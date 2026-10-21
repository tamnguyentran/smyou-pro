"""M15-02a: CSKH ghi phản hồi khách hàng (CSAT) trên đơn đã Hoàn tất (AC-CSK-001...007)."""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, Person, login, seed

LAN = Person("lan.vo@smyou.vn", "Lan@SmYou26", ("CUSTOMER_CARE",), "NV020", "Võ Thị Lan", "SALES")
HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")


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
    completed_at: datetime | None = None,
    csat_rating: int | None = None,
) -> uuid.UUID:
    order_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO orders (id, code, status, created_by, service_address, work_description,"
            " priority, version, completed_at, csat_rating)"
            " VALUES (:id, :code, :status, :created_by, '12 Lê Lợi, Q1', 'Lắp đặt', 'NORMAL', 1,"
            " :completed_at, :csat_rating)"
        ),
        {
            "id": order_id,
            "code": code or f"DH0000-{uuid.uuid4().hex[:4]}",
            "status": status,
            "created_by": created_by,
            "completed_at": completed_at,
            "csat_rating": csat_rating,
        },
    )
    return order_id


def audit_rows(db: Connection, order_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT action, from_status, to_status FROM audit_events"
            " WHERE entity_type='ORDER' AND entity_id=:id ORDER BY occurred_at"
        ),
        {"id": order_id},
    ).mappings()
    return [dict(r) for r in rows]


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, LAN, HOA)}


@pytest.mark.ac("AC-CSK-001")
def test_customer_care_records_csat(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH2609-0010",
        completed_at=datetime(2026, 9, 20, 3, 0, tzinfo=UTC),
    )
    lan = client_as(app, LAN)

    res = lan.post(
        f"/api/v1/orders/{order_id}/csat",
        json={"version": 1, "csat_rating": 5, "csat_comment": "Khách rất hài lòng"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["csat_rating"] == 5
    assert body["csat_comment"] == "Khách rất hài lòng"
    assert body["csat_recorded_by"] == str(people["NV020"])
    assert body["csat_recorded_at"] is not None

    rows = audit_rows(db, order_id)
    assert rows[-1]["action"] == "csat_recorded"


@pytest.mark.ac("AC-CSK-002")
def test_comment_required_when_rating_set(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0011")
    lan = client_as(app, LAN)

    res = problem(
        lan.post(
            f"/api/v1/orders/{order_id}/csat",
            json={"version": 1, "csat_rating": 5, "csat_comment": ""},
        ),
        422,
        "VALIDATION_ERROR",
    )
    assert res["errors"][0]["field"] == "csat_comment"


@pytest.mark.ac("AC-CSK-003")
def test_guard_order_not_completed(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="PENDING_DISPATCH", code="DH2609-0012")
    lan = client_as(app, LAN)

    res = problem(
        lan.post(
            f"/api/v1/orders/{order_id}/csat",
            json={"version": 1, "csat_rating": 5, "csat_comment": "Khách hài lòng"},
        ),
        409,
        "GUARD_FAILED",
    )
    assert res["guard"] == "order_completed"


@pytest.mark.ac("AC-CSK-004")
def test_rerecord_overwrites_previous_value(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(
        db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0013", csat_rating=3
    )
    lan = client_as(app, LAN)

    res = lan.post(
        f"/api/v1/orders/{order_id}/csat",
        json={"version": 1, "csat_rating": 5, "csat_comment": "Gọi lại, khách đổi ý đánh giá cao hơn"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["csat_rating"] == 5
    assert body["version"] == 2

    rows = audit_rows(db, order_id)
    assert len(rows) == 1
    assert rows[0]["action"] == "csat_recorded"


@pytest.mark.ac("AC-CSK-005")
def test_sale_is_forbidden(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0014")
    hoa = client_as(app, HOA)

    problem(
        hoa.post(
            f"/api/v1/orders/{order_id}/csat",
            json={"version": 1, "csat_rating": 5, "csat_comment": "Khách hài lòng"},
        ),
        403,
        "FORBIDDEN",
    )


@pytest.mark.ac("AC-CSK-006")
def test_csat_summary_counts_by_rating(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    ratings = [5, 5, 5, 4, 4, 3, 2, 1, None, None]
    for i, rating in enumerate(ratings):
        insert_order(
            db,
            created_by=people["NV001"],
            status="COMPLETED",
            code=f"DH2609-{100 + i:04d}",
            completed_at=datetime(2026, 9, 15, 3, 0, tzinfo=UTC),
            csat_rating=rating,
        )
    lan = client_as(app, LAN)

    res = lan.get("/api/v1/orders/csat-summary?from=2026-09-01&to=2026-09-26")
    assert res.status_code == 200, res.text
    assert res.json() == {"5": 3, "4": 2, "3": 1, "2": 1, "1": 1, "none": 2}


@pytest.mark.ac("AC-CSK-007")
def test_csat_summary_defaults_to_current_month(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    insert_order(
        db,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH2609-0200",
        completed_at=datetime(2026, 9, 15, 3, 0, tzinfo=UTC),
        csat_rating=5,
    )
    insert_order(
        db,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH2608-0001",
        completed_at=datetime(2026, 8, 15, 3, 0, tzinfo=UTC),
        csat_rating=5,
    )
    lan = client_as(app, LAN)

    res = lan.get("/api/v1/orders/csat-summary")
    assert res.status_code == 200, res.text
    assert res.json() == {"5": 1, "4": 0, "3": 0, "2": 0, "1": 0, "none": 0}
