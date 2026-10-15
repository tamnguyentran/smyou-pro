"""Realtime fan-out of newly-created notifications over WebSocket (M7-03).

In-memory, single-process registry — the backend runs exactly 1 uvicorn worker, no multi-instance
(docs/architecture/DEPLOYMENT.md: `uvicorn app.main:app` with no `--workers`). Scaling to several
workers/instances later would need a shared pub/sub (e.g. Redis) instead of this module-level dict.

`_create` (service.py) queues the just-added `Notification` ORM row onto `session.info`; the
`after_commit` listener below only fires once the owning transaction actually committed, so a
notification that gets rolled back is never broadcast. `expire_on_commit=False` (core/db.py) keeps
the row's attributes readable after commit without a fresh query.

All HTTP endpoints run as sync `def` (ADR-009), so `after_commit` fires on FastAPI's threadpool
thread, not the asyncio event loop that owns the WebSocket connections — `asyncio.run_coroutine_threadsafe`
bridges back to it using the loop captured at startup (`set_event_loop`, called from `main.py` lifespan).

Web Push (M10-05) runs synchronously, right here, on the same thread as the request — deliberately
*not* on a detached background thread: that thread would open its own session on `app_state.session_factory`,
which in tests is a single connection shared with the test's own transaction (see
`tests/integration/conftest.py`'s `db` fixture) — a second, unsynchronised thread touching that same
connection corrupted state badly enough to cascade failures into unrelated test files. `webpush()` has
a short timeout (push.py) to bound how much latency this adds to the triggering request.
"""

import asyncio
import logging
import uuid
from collections import defaultdict
from typing import TYPE_CHECKING, Any

from fastapi import WebSocket
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.modules.notifications import push

if TYPE_CHECKING:
    from app.modules.notifications.models import Notification

logger = logging.getLogger(__name__)

_connections: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop | None) -> None:
    global _loop
    _loop = loop


def connect(employee_id: uuid.UUID, websocket: WebSocket) -> None:
    _connections[employee_id].add(websocket)


def disconnect(employee_id: uuid.UUID, websocket: WebSocket) -> None:
    sockets = _connections.get(employee_id)
    if sockets is None:
        return
    sockets.discard(websocket)
    if not sockets:
        _connections.pop(employee_id, None)


async def _send_to(employee_id: uuid.UUID, message: dict[str, Any]) -> None:
    for websocket in list(_connections.get(employee_id, ())):
        try:
            await websocket.send_json(message)
        except Exception:
            logger.info("notifications ws: dropping dead connection for %s", employee_id)
            disconnect(employee_id, websocket)


def queue_for_broadcast(session: Session, notification: "Notification") -> None:
    session.info.setdefault("_realtime_notifications", []).append(notification)


@event.listens_for(Session, "after_commit")
def _broadcast_after_commit(session: Session) -> None:
    pending: list[Notification] = session.info.get("_realtime_notifications") or []
    if not pending:
        return
    session.info["_realtime_notifications"] = []
    for notification in pending:
        payload = {
            "id": str(notification.id),
            "type": notification.type,
            "title": notification.title,
            "body": notification.body,
            "entity_type": notification.entity_type,
            "entity_id": str(notification.entity_id),
            "created_at": notification.created_at.isoformat(),
        }
        if _loop is not None:
            message = {"type": "notification", "notification": payload}
            asyncio.run_coroutine_threadsafe(_send_to(notification.recipient_id, message), _loop)
        # `app_state` (stashed by core/db.py#get_session) carries the *current* session_factory/
        # settings — see push.py's docstring for why this can't be a module-level global instead.
        app_state = session.info.get("app_state")
        if app_state is not None:
            push.send_for_recipient(
                app_state.session_factory, app_state.settings, notification.recipient_id, payload
            )
