"""Web Push delivery for new notifications (M10-05) — best-effort, synchronous.

Called directly from `realtime.py`'s `after_commit` hook, strictly after the notification itself
is durably saved, on the *same* thread as the triggering request (deliberately not handed off to
a background thread — see that module's docstring for why). A failed push (service down, expired
subscription) never fails the business transaction that created the notification. `webpush()` has
a short timeout so a slow/unreachable push service only adds a bounded delay to that request, not
an unbounded one. A 404/410 response means the browser unsubscribed that endpoint; the dead row is
deleted so future notifications stop trying it.

Disabled by default: if `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` aren't configured (`Settings`),
`send_for_recipient` is a no-op — same "chừa chỗ, không bắt buộc" posture as M7-01a's channel hooks.
"""

import json
import logging
import uuid
from typing import Any

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.modules.notifications.models import PushSubscription

logger = logging.getLogger(__name__)


def _delete_dead_subscription(session_factory: sessionmaker[Session], subscription_id: uuid.UUID) -> None:
    with session_factory() as session, session.begin():
        session.execute(delete(PushSubscription).where(PushSubscription.id == subscription_id))


def _send_one(
    *,
    session_factory: sessionmaker[Session],
    endpoint: str,
    p256dh: str,
    auth: str,
    subscription_id: uuid.UUID,
    payload: dict[str, Any],
    vapid_private_key: str,
    vapid_subject: str,
) -> None:
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=json.dumps(payload),
            vapid_private_key=vapid_private_key,
            vapid_claims={"sub": vapid_subject},
            timeout=5,
        )
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status in (404, 410):
            _delete_dead_subscription(session_factory, subscription_id)
        else:
            logger.warning("web push failed (status=%s): %s", status, exc)


def send_for_recipient(
    session_factory: sessionmaker[Session],
    settings: Settings,
    recipient_id: uuid.UUID,
    payload: dict[str, Any],
) -> None:
    """Runs synchronously on the caller's thread (called from `realtime.py`, itself on the
    request-handling thread) — see that module's docstring for why this must not be a detached
    background thread.

    `session_factory`/`settings` are passed in explicitly (not read from a module-level global)
    because they must be the ones from the *current* `app.state` — stashed onto `session.info` by
    `core/db.py#get_session` — not whatever was true when the process first started; a test that
    overrides either on `app.state` after app creation would otherwise be invisible here.
    """
    if not settings.vapid_public_key or not settings.vapid_private_key:
        return
    vapid_private_key = settings.vapid_private_key
    with session_factory() as session:
        subscriptions = session.scalars(
            select(PushSubscription).where(PushSubscription.employee_id == recipient_id)
        ).all()
        rows = [(s.id, s.endpoint, s.p256dh, s.auth) for s in subscriptions]
    for subscription_id, endpoint, p256dh, auth in rows:
        _send_one(
            session_factory=session_factory,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            subscription_id=subscription_id,
            payload=payload,
            vapid_private_key=vapid_private_key,
            vapid_subject=settings.vapid_subject,
        )
