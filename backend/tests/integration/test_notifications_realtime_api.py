"""M7-03: realtime notifications over WebSocket (`/api/v1/notifications/ws`).

Uses `with TestClient(app) as client:` (unlike the bare `TestClient(app)` most other integration
tests use) — only the context-manager form runs the app's lifespan, which is where
`notifications_realtime.set_event_loop` is called; without it the `after_commit` broadcast hook
has no event loop to schedule onto and silently no-ops.
"""

import uuid
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection
from starlette.websockets import WebSocketDisconnect

from app.core.spec_loader import load_specs
from tests.integration.conftest import login, seed
from tests.integration.test_notifications_api import HOA, TUAN, insert_order
from tests.spec_fixtures import REPO_SPEC_DIR


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (HOA, TUAN)}


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.mark.ac("AC-NTF-036")
def test_ws_rejects_without_session_cookie(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as exc_info, client.websocket_connect("/api/v1/notifications/ws"):
        pass
    assert exc_info.value.code == 4401


@pytest.mark.ac("AC-NTF-037")
def test_ws_receives_notify_order_submitted_realtime(
    client: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="DRAFT", code="DH2610-R001")

    login(client, HOA.email, HOA.password)
    hoa_token = client.cookies.get("smyou_access")
    assert hoa_token is not None

    login(client, TUAN.email, TUAN.password)  # overwrites the jar; the WS connects as TUAN below

    with client.websocket_connect("/api/v1/notifications/ws") as ws:
        res = client.post(
            f"/api/v1/orders/{order_id}/submit",
            json={"version": 1},
            headers={"cookie": f"smyou_access={hoa_token}"},
        )
        assert res.status_code == 200, res.text

        message = ws.receive_json()
        assert message["type"] == "notification"
        notification = message["notification"]
        assert notification["type"] == "ORDER_SUBMITTED"
        assert notification["entity_type"] == "ORDER"
        assert notification["entity_id"] == str(order_id)


@pytest.mark.ac("AC-NTF-042")
def test_ws_route_declared_in_websocket_routes_with_right_capability() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    routes = {ws.path: ws.capability for ws in permissions.websocket_routes}
    assert routes["/api/v1/notifications/ws"] == "notification.read"
