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
    res = login(client, person.username, person.password)
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


@pytest.mark.ac("AC-CSK-011")
def test_order_list_includes_csat_rating(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    """M15-02b: OrderSummary mang csat_rating để FE tô màu dòng/thẻ không cần gọi thêm API."""
    rated = insert_order(
        db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0300", csat_rating=4
    )
    unrated = insert_order(db, created_by=people["NV001"], status="COMPLETED", code="DH2609-0301")
    lan = client_as(app, LAN)

    res = lan.get("/api/v1/orders?q=DH2609-030")
    assert res.status_code == 200, res.text
    by_id = {item["id"]: item["csat_rating"] for item in res.json()["items"]}
    assert by_id[str(rated)] == 4
    assert by_id[str(unrated)] is None


@pytest.mark.ac("AC-CSK-010")
@pytest.mark.ac("AC-CSK-012")
def test_order_list_filters_by_completed_at_range_and_csat_rating(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    """M15-02b: GET /orders lọc theo `from`/`to` (Order.completed_at, khớp Q92) và `csat_rating`."""
    in_range_5 = insert_order(
        db,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH2609-0400",
        completed_at=datetime(2026, 9, 15, 3, 0, tzinfo=UTC),
        csat_rating=5,
    )
    in_range_3 = insert_order(
        db,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH2609-0401",
        completed_at=datetime(2026, 9, 16, 3, 0, tzinfo=UTC),
        csat_rating=3,
    )
    out_of_range = insert_order(
        db,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH2608-0001",
        completed_at=datetime(2026, 8, 15, 3, 0, tzinfo=UTC),
        csat_rating=5,
    )
    not_completed = insert_order(
        db, created_by=people["NV001"], status="PENDING_DISPATCH", code="DH2609-0402"
    )
    lan = client_as(app, LAN)

    by_range = lan.get("/api/v1/orders?from=2026-09-01&to=2026-09-26").json()
    ids = {item["id"] for item in by_range["items"]}
    assert ids == {str(in_range_5), str(in_range_3)}
    assert str(out_of_range) not in ids
    assert str(not_completed) not in ids

    by_rating = lan.get("/api/v1/orders?from=2026-09-01&to=2026-09-26&csat_rating=3").json()
    assert [item["id"] for item in by_rating["items"]] == [str(in_range_3)]


@pytest.fixture
def october_orders(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    """M20-02: tháng 10/2026 — 0001 5★, 0002 + 0003 chưa đánh giá, 0004 đang làm."""
    completed = datetime(2026, 10, 15, 3, 0, tzinfo=UTC)
    return {
        "0001": insert_order(
            db,
            created_by=people["NV001"],
            status="COMPLETED",
            code="DH2610-0001",
            completed_at=completed,
            csat_rating=5,
        ),
        "0002": insert_order(
            db, created_by=people["NV001"], status="COMPLETED", code="DH2610-0002", completed_at=completed
        ),
        "0003": insert_order(
            db, created_by=people["NV001"], status="COMPLETED", code="DH2610-0003", completed_at=completed
        ),
        "0004": insert_order(db, created_by=people["NV001"], status="IN_PROGRESS", code="DH2610-0004"),
    }


@pytest.mark.ac("AC-CSK-026")
def test_order_list_filters_unrated_matches_csat_summary(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], october_orders: dict[str, uuid.UUID]
) -> None:
    # Chưa đánh giá nhưng hoàn tất ngoài khoảng ngày, và đơn huỷ có completed_at → đều không được tính.
    insert_order(
        db,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH2609-0099",
        completed_at=datetime(2026, 9, 20, 3, 0, tzinfo=UTC),
    )
    insert_order(
        db,
        created_by=people["NV001"],
        status="CANCELLED",
        code="DH2610-0098",
        completed_at=datetime(2026, 10, 15, 3, 0, tzinfo=UTC),
    )
    lan = client_as(app, LAN)

    res = lan.get("/api/v1/orders?from=2026-10-01&to=2026-10-31&csat_unrated=true")
    assert res.status_code == 200, res.text
    page = res.json()
    assert page["total"] == 2
    assert {item["code"] for item in page["items"]} == {"DH2610-0002", "DH2610-0003"}

    summary = lan.get("/api/v1/orders/csat-summary?from=2026-10-01&to=2026-10-31").json()
    assert page["total"] == summary["none"]


@pytest.mark.ac("AC-CSK-027")
def test_order_list_unrated_without_dates_only_completed(
    app: FastAPI, db: Connection, october_orders: dict[str, uuid.UUID]
) -> None:
    res = client_as(app, LAN).get("/api/v1/orders?csat_unrated=true")
    assert res.status_code == 200, res.text
    codes = {item["code"] for item in res.json()["items"]}
    assert codes == {"DH2610-0002", "DH2610-0003"}
    assert all(item["csat_rating"] is None for item in res.json()["items"])


@pytest.mark.ac("AC-CSK-028")
@pytest.mark.usefixtures("people")
def test_order_list_rejects_rating_with_unrated(app: FastAPI) -> None:
    res = client_as(app, LAN).get("/api/v1/orders?csat_rating=4&csat_unrated=true")
    body = problem(res, 422, "VALIDATION_ERROR")
    assert body["errors"][0]["code"] == "conflicting_filters"


@pytest.mark.ac("AC-CSK-029")
def test_order_list_unrated_combines_with_mine(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], october_orders: dict[str, uuid.UUID]
) -> None:
    own = insert_order(
        db,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH2610-0005",
        completed_at=datetime(2026, 10, 16, 3, 0, tzinfo=UTC),
    )
    hoa = client_as(app, HOA)

    mine = hoa.get("/api/v1/orders?csat_unrated=true&mine=true")
    assert mine.status_code == 200, mine.text
    assert {item["id"] for item in mine.json()["items"]} == {str(own)}

    everyone = hoa.get("/api/v1/orders?csat_unrated=true")
    assert everyone.status_code == 200, everyone.text
    assert {item["id"] for item in everyone.json()["items"]} == {
        str(own),
        str(october_orders["0002"]),
        str(october_orders["0003"]),
    }
