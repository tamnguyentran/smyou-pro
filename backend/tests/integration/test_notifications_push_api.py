"""M10-05: Web Push subscriptions + delivery (`/api/v1/notifications/push-subscriptions`).

Push sending happens synchronously, on the same thread as the triggering request (realtime.py),
so tests that exercise the full pipeline can assert on `pywebpush.webpush` mocks right after the
HTTP call returns — no waiting/threading needed.
"""

import uuid
from collections.abc import Callable
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from pywebpush import WebPushException
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import seed
from tests.integration.test_notifications_api import HOA, TUAN, client_as, insert_order

VAPID_OVERRIDES = {
    "vapid_public_key": "test-public-key",
    "vapid_private_key": "test-private-key",
    "vapid_subject": "mailto:test@smyou.vn",
}


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (HOA, TUAN)}


def subscriptions_for(db: Connection, employee_id: uuid.UUID) -> list[Any]:
    return db.execute(
        text("SELECT * FROM push_subscriptions WHERE employee_id = :id"), {"id": employee_id}
    ).all()


def test_subscribe_creates_a_row(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    tuan = client_as(app, TUAN)
    res = tuan.post(
        "/api/v1/notifications/push-subscriptions",
        json={"endpoint": "https://push.example/abc", "keys": {"p256dh": "p1", "auth": "a1"}},
    )
    assert res.status_code == 204, res.text
    rows = subscriptions_for(db, people["NV010"])
    assert len(rows) == 1
    assert rows[0].endpoint == "https://push.example/abc"


def test_resubscribe_same_endpoint_updates_in_place(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    tuan = client_as(app, TUAN)
    body = {"endpoint": "https://push.example/same", "keys": {"p256dh": "p1", "auth": "a1"}}
    tuan.post("/api/v1/notifications/push-subscriptions", json=body)
    body2 = {"endpoint": "https://push.example/same", "keys": {"p256dh": "p2", "auth": "a2"}}
    res = tuan.post("/api/v1/notifications/push-subscriptions", json=body2)
    assert res.status_code == 204, res.text

    rows = db.execute(
        text("SELECT * FROM push_subscriptions WHERE endpoint = :e"), {"e": "https://push.example/same"}
    ).all()
    assert len(rows) == 1
    assert rows[0].p256dh == "p2"


def test_unsubscribe_removes_the_row(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    tuan = client_as(app, TUAN)
    tuan.post(
        "/api/v1/notifications/push-subscriptions",
        json={"endpoint": "https://push.example/gone", "keys": {"p256dh": "p1", "auth": "a1"}},
    )
    res = tuan.post(
        "/api/v1/notifications/push-subscriptions/unsubscribe", json={"endpoint": "https://push.example/gone"}
    )
    assert res.status_code == 204, res.text
    assert subscriptions_for(db, people["NV010"]) == []


def test_push_routes_declare_notification_read_capability(app: FastAPI) -> None:
    routes = declared_routes(app)
    assert ("POST", "/api/v1/notifications/push-subscriptions", "notification.read") in routes
    assert (
        "POST",
        "/api/v1/notifications/push-subscriptions/unsubscribe",
        "notification.read",
    ) in routes


@pytest.mark.ac("AC-NTF-043")
def test_push_sent_on_new_notification_when_vapid_configured(
    auth_app: Callable[..., FastAPI], db: Connection, people: dict[str, uuid.UUID]
) -> None:
    app = auth_app(**VAPID_OVERRIDES)
    order_id = insert_order(db, created_by=people["NV005"], status="DRAFT", code="DH2610-P001")

    tuan = client_as(app, TUAN)
    tuan.post(
        "/api/v1/notifications/push-subscriptions",
        json={"endpoint": "https://push.example/tuan", "keys": {"p256dh": "p1", "auth": "a1"}},
    )

    hoa = client_as(app, HOA)
    with patch("app.modules.notifications.push.webpush") as mock_webpush:
        res = hoa.post(f"/api/v1/orders/{order_id}/submit", json={"version": 1})
        assert res.status_code == 200, res.text

    mock_webpush.assert_called_once()
    call_kwargs = mock_webpush.call_args.kwargs
    assert call_kwargs["subscription_info"]["endpoint"] == "https://push.example/tuan"
    assert call_kwargs["vapid_private_key"] == "test-private-key"


def test_no_push_when_vapid_not_configured(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="DRAFT", code="DH2610-P002")
    tuan = client_as(app, TUAN)
    tuan.post(
        "/api/v1/notifications/push-subscriptions",
        json={"endpoint": "https://push.example/no-vapid", "keys": {"p256dh": "p1", "auth": "a1"}},
    )

    hoa = client_as(app, HOA)
    with patch("app.modules.notifications.push.webpush") as mock_webpush:
        res = hoa.post(f"/api/v1/orders/{order_id}/submit", json={"version": 1})
        assert res.status_code == 200, res.text
        mock_webpush.assert_not_called()


@pytest.mark.ac("AC-NTF-044")
def test_dead_subscription_deleted_on_410(
    auth_app: Callable[..., FastAPI], db: Connection, people: dict[str, uuid.UUID]
) -> None:
    app = auth_app(**VAPID_OVERRIDES)
    order_id = insert_order(db, created_by=people["NV005"], status="DRAFT", code="DH2610-P003")

    tuan = client_as(app, TUAN)
    tuan.post(
        "/api/v1/notifications/push-subscriptions",
        json={"endpoint": "https://push.example/dead", "keys": {"p256dh": "p1", "auth": "a1"}},
    )

    def fake_webpush(**kwargs: Any) -> None:
        response = type("Response", (), {"status_code": 410})()
        raise WebPushException("gone", response=response)

    hoa = client_as(app, HOA)
    with patch("app.modules.notifications.push.webpush", side_effect=fake_webpush):
        res = hoa.post(f"/api/v1/orders/{order_id}/submit", json={"version": 1})
        assert res.status_code == 200, res.text

    assert subscriptions_for(db, people["NV010"]) == []
