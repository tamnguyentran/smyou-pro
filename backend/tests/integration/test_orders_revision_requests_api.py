"""M15-03: CSKH gửi yêu cầu chỉnh sửa đơn tới QLKT (AC-CSK-020...025)."""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, Person, login, seed

LAN = Person("lan.vo@smyou.vn", "Lan@SmYou26", ("CUSTOMER_CARE",), "NV020", "Võ Thị Lan", "SALES")
HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV007", "Phạm Quốc Tuấn", "TECHNICAL")


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


def problem(res, status: int, code: str) -> dict:
    assert res.status_code == status, res.text
    body = res.json()
    assert body["code"] == code
    return body


def insert_order(
    db: Connection,
    *,
    created_by: uuid.UUID,
    status: str,
    code: str | None = None,
    csat_comment: str | None = None,
) -> uuid.UUID:
    order_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO orders (id, code, status, created_by, service_address, work_description,"
            " priority, version, completed_at, csat_comment)"
            " VALUES (:id, :code, :status, :created_by, '12 Lê Lợi, Q1', 'Lắp đặt', 'NORMAL', 1,"
            " :completed_at, :csat_comment)"
        ),
        {
            "id": order_id,
            "code": code or f"DH0000-{uuid.uuid4().hex[:4]}",
            "status": status,
            "created_by": created_by,
            "completed_at": datetime(2026, 9, 20, 3, 0, tzinfo=UTC) if status == "COMPLETED" else None,
            "csat_comment": csat_comment,
        },
    )
    return order_id


def audit_rows(db: Connection, order_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT action, data FROM audit_events"
            " WHERE entity_type='ORDER' AND entity_id=:id ORDER BY occurred_at"
        ),
        {"id": order_id},
    ).mappings()
    return [dict(r) for r in rows]


def notifications_for(db: Connection, recipient_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        text("SELECT type, entity_id FROM notifications WHERE recipient_id = :rid"),
        {"rid": recipient_id},
    ).mappings()
    return [dict(r) for r in rows]


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, LAN, HOA, TUAN)}


@pytest.mark.ac("AC-CSK-021")
def test_customer_care_sends_revision_request(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH2609-0020",
        csat_comment="Máy vẫn còn kêu to",
    )
    lan = client_as(app, LAN)

    res = lan.post(
        f"/api/v1/orders/{order_id}/revision-requests",
        json={"note": "Khách muốn kỹ thuật quay lại kiểm tra lần nữa"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["order_id"] == str(order_id)
    assert body["note"] == "Khách muốn kỹ thuật quay lại kiểm tra lần nữa"
    assert body["requested_by"] == str(people["NV020"])
    assert body["requested_at"] is not None

    rows = audit_rows(db, order_id)
    assert rows[-1]["action"] == "revision_requested"
    assert rows[-1]["data"]["note"] == "Khách muốn kỹ thuật quay lại kiểm tra lần nữa"

    status_row = db.execute(text("SELECT status FROM orders WHERE id=:id"), {"id": order_id}).one()
    assert status_row.status == "COMPLETED"

    notifs = notifications_for(db, people["NV007"])
    assert len(notifs) == 1
    assert notifs[0]["type"] == "ORDER_CSK_REVISION_REQUESTED"
    assert notifs[0]["entity_id"] == order_id


@pytest.mark.ac("AC-CSK-022")
def test_guard_order_not_completed(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="DH2609-0021")
    lan = client_as(app, LAN)

    problem(
        lan.post(f"/api/v1/orders/{order_id}/revision-requests", json={"note": "Khách chưa hài lòng"}),
        409,
        "GUARD_FAILED",
    )


def test_blank_note_rejected(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    """Review finding: `min_length=1` alone accepts whitespace-only note (empty-looking
    notification to every active TECH_LEAD)."""
    order_id = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0026")
    lan = client_as(app, LAN)

    res = lan.post(f"/api/v1/orders/{order_id}/revision-requests", json={"note": "   "})
    assert res.status_code == 422, res.text


@pytest.mark.ac("AC-CSK-023")
def test_sale_forbidden(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0022")
    hoa = client_as(app, HOA)

    res = hoa.post(f"/api/v1/orders/{order_id}/revision-requests", json={"note": "Khách chưa hài lòng"})
    assert res.status_code == 403, res.text


@pytest.mark.ac("AC-CSK-021")
def test_multiple_requests_allowed_each_notifies(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    """Q93: cho gửi nhiều lần, mỗi lần 1 audit event + 1 thông báo riêng (không gộp/chặn trùng)."""
    order_id = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0023")
    lan = client_as(app, LAN)

    for note in ("Lần 1", "Lần 2"):
        res = lan.post(f"/api/v1/orders/{order_id}/revision-requests", json={"note": note})
        assert res.status_code == 201, res.text

    rows = [r for r in audit_rows(db, order_id) if r["action"] == "revision_requested"]
    assert len(rows) == 2
    notifs = notifications_for(db, people["NV007"])
    assert len(notifs) == 2


@pytest.mark.ac("AC-CSK-024")
def test_badge_pending_after_request(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0024")
    lan = client_as(app, LAN)
    assert (
        lan.post(
            f"/api/v1/orders/{order_id}/revision-requests", json={"note": "Khách chưa hài lòng"}
        ).status_code
        == 201
    )

    tuan = client_as(app, TUAN)
    res = tuan.get(f"/api/v1/orders/{order_id}")
    assert res.status_code == 200, res.text
    assert res.json()["has_pending_revision_request"] is True


@pytest.mark.ac("AC-CSK-025")
def test_badge_clears_once_tech_lead_revises(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0025")
    lan = client_as(app, LAN)
    assert (
        lan.post(
            f"/api/v1/orders/{order_id}/revision-requests", json={"note": "Khách chưa hài lòng"}
        ).status_code
        == 201
    )

    tuan = client_as(app, TUAN)
    res = tuan.post(f"/api/v1/orders/{order_id}/revise", json={"version": 1, "reason": "Kiểm tra lại máy"})
    assert res.status_code == 200, res.text
    assert res.json()["has_pending_revision_request"] is False

    res = tuan.get(f"/api/v1/orders/{order_id}")
    assert res.json()["has_pending_revision_request"] is False
