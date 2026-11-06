"""M21-05a: KTV ghi "Tiềm năng sử dụng dịch vụ" của khách hàng chủ đơn + 2 cột mới ở báo cáo
Doanh thu theo khách hàng (AC-CUS-040…051)."""

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, Person, seed
from tests.integration.test_dispatch_api import HOA, client_as, problem
from tests.integration.test_orders_on_site_lines_api import insert_assignment, insert_task
from tests.integration.test_revenue_report_api import insert_customer, insert_order, insert_order_line

MAI = Person("mai.vo@smyou.vn", "Mai@SmYou26", ("CUSTOMER_CARE",), "NV015", "Võ Thị Mai", "SALES")
BINH = Person("binh.tl@smyou.vn", "Binh@SmYou26", ("TECH_LEAD",), "NV010", "Nguyễn Văn Bình", "TECHNICAL")
KHANG = Person(
    "khang.ktv@smyou.vn", "Khang@SmYou26", ("TECHNICIAN",), "NV020", "Trần Minh Khang", "TECHNICAL"
)

NOTE = "Muốn lắp thêm 4 camera kho"
REPORT_RANGE = {"from": "2026-09-01", "to": "2026-09-30"}
COMPLETED_SEP_10 = datetime(2026, 9, 10, 3, 0, tzinfo=UTC)
# 2026-11-02 18:00 UTC = 2026-11-03 01:00 giờ VN — last_purchase_date phải theo giờ VN.
CREATED_NOV_03_VN = datetime(2026, 11, 2, 18, 0, tzinfo=UTC)


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, MAI, BINH, KHANG)}


@pytest.fixture
def minh_phat(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    return insert_customer(db, code="KH00042", created_by=people["NV001"], name="Công ty TNHH Minh Phát")


def order_with_assignment(
    db: Connection,
    people: dict[str, uuid.UUID],
    customer_id: uuid.UUID | None,
    *,
    code: str = "DH2611-0005",
    order_status: str = "IN_PROGRESS",
    assignment_status: str | None = "IN_PROGRESS",
) -> uuid.UUID:
    order_id = insert_order(
        db, customer_id=customer_id, created_by=people["NV005"], status=order_status, code=code
    )
    task_id = insert_task(db, order_id, created_by=people["NV010"], status="IN_PROGRESS", cycle=1)
    if assignment_status is not None:
        insert_assignment(db, task_id, people["NV020"], assignment_status)
    return order_id


def insert_note(
    db: Connection,
    *,
    customer_id: uuid.UUID,
    order_id: uuid.UUID,
    author_id: uuid.UUID,
    note: str,
    created_at: datetime,
) -> uuid.UUID:
    note_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO customer_potential_notes (id, customer_id, order_id, author_id, note, created_at)"
            " VALUES (:id, :customer_id, :order_id, :author_id, :note, :created_at)"
        ),
        {
            "id": note_id,
            "customer_id": customer_id,
            "order_id": order_id,
            "author_id": author_id,
            "note": note,
            "created_at": created_at,
        },
    )
    return note_id


def completed_sep_order(db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID) -> uuid.UUID:
    """Đơn COMPLETED 10/09/2026 có 1 dòng ghi doanh số cho Hoa — để khách hiện trong báo cáo tháng 9."""
    order_id = insert_order(
        db,
        customer_id=customer_id,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH2609-0001",
        total=1_000_000,
        completed_at=COMPLETED_SEP_10,
        created_at=COMPLETED_SEP_10,
    )
    insert_order_line(
        db,
        order_id,
        line_total=1_000_000,
        unit_price=1_000_000,
        cost_price_snapshot=500_000,
        credited_employee_id=people["NV005"],
    )
    return order_id


def report_row(res: Any, customer_id: uuid.UUID) -> dict[str, Any]:
    assert res.status_code == 200, res.text
    return next(r for r in res.json()["items"] if r["customer_id"] == str(customer_id))


def test_customer_potential_capabilities_declared() -> None:
    from app.main import create_app

    routes = {(m, p): c for m, p, c in declared_routes(create_app())}
    assert routes[("POST", "/api/v1/orders/{order_id}/customer-potential")] == "customer.potential.record"
    assert routes[("GET", "/api/v1/orders/{order_id}/customer-potential")] == "order.read"


@pytest.mark.ac("AC-CUS-040")
def test_technician_records_potential_note_for_order_customer(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    order_id = order_with_assignment(db, people, minh_phat)

    res = client_as(app, KHANG).post(f"/api/v1/orders/{order_id}/customer-potential", json={"note": NOTE})

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["customer_id"] == str(minh_phat)
    assert body["order_id"] == str(order_id)
    assert body["order_code"] == "DH2611-0005"
    assert body["note"] == NOTE
    assert body["author_id"] == str(people["NV020"])
    assert body["author_name"] == "Trần Minh Khang"
    row = db.execute(
        text("SELECT customer_id, order_id, author_id, note FROM customer_potential_notes WHERE id = :id"),
        {"id": body["id"]},
    ).one()
    assert (row.customer_id, row.order_id, row.author_id, row.note) == (
        minh_phat,
        order_id,
        people["NV020"],
        NOTE,
    )
    event = db.execute(
        text("SELECT * FROM audit_events WHERE entity_type = 'CUSTOMER' AND entity_id = :id"),
        {"id": minh_phat},
    ).one()
    assert event.action == "potential_note"
    assert event.actor_id == people["NV020"]
    assert event.data["order_id"] == str(order_id)


@pytest.mark.ac("AC-CUS-040")
def test_note_is_trimmed(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    order_id = order_with_assignment(db, people, minh_phat)

    res = client_as(app, KHANG).post(
        f"/api/v1/orders/{order_id}/customer-potential", json={"note": f"  {NOTE}  "}
    )

    assert res.status_code == 201, res.text
    assert res.json()["note"] == NOTE


@pytest.mark.ac("AC-CUS-041")
@pytest.mark.parametrize("assignment_status", ["ACCEPTED", "DONE"])
def test_accepted_or_done_assignment_may_record(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    minh_phat: uuid.UUID,
    assignment_status: str,
) -> None:
    order_id = order_with_assignment(db, people, minh_phat, assignment_status=assignment_status)

    res = client_as(app, KHANG).post(f"/api/v1/orders/{order_id}/customer-potential", json={"note": NOTE})

    assert res.status_code == 201, res.text


@pytest.mark.ac("AC-CUS-042")
@pytest.mark.parametrize("assignment_status", ["PENDING", "REJECTED", None])
def test_pending_rejected_or_unassigned_technician_gets_404(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    minh_phat: uuid.UUID,
    assignment_status: str | None,
) -> None:
    order_id = order_with_assignment(db, people, minh_phat, assignment_status=assignment_status)

    res = client_as(app, KHANG).post(f"/api/v1/orders/{order_id}/customer-potential", json={"note": NOTE})

    problem(res, 404, "NOT_FOUND")
    count = db.execute(text("SELECT count(*) FROM customer_potential_notes")).scalar_one()
    assert count == 0


@pytest.mark.ac("AC-CUS-043")
@pytest.mark.parametrize("order_status", ["COMPLETED", "CANCELLED"])
def test_closed_order_rejects_note(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    minh_phat: uuid.UUID,
    order_status: str,
) -> None:
    order_id = order_with_assignment(
        db, people, minh_phat, order_status=order_status, assignment_status="DONE"
    )

    res = client_as(app, KHANG).post(f"/api/v1/orders/{order_id}/customer-potential", json={"note": NOTE})

    body = problem(res, 409, "GUARD_FAILED")
    assert body["guard"] == "order_open_for_potential_note"
    assert db.execute(text("SELECT count(*) FROM customer_potential_notes")).scalar_one() == 0
    audits = db.execute(
        text("SELECT count(*) FROM audit_events WHERE action = 'potential_note'")
    ).scalar_one()
    assert audits == 0


def test_order_without_customer_record_rejects_note(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    """Spec §5: khách lẻ cũ không có `customer_id` → 409 guard `order_has_customer`."""
    order_id = order_with_assignment(db, people, None)

    res = client_as(app, KHANG).post(f"/api/v1/orders/{order_id}/customer-potential", json={"note": NOTE})

    body = problem(res, 409, "GUARD_FAILED")
    assert body["guard"] == "order_has_customer"


@pytest.mark.ac("AC-CUS-044")
@pytest.mark.parametrize("note", ["", "   ", "x" * 1001])
def test_invalid_note_is_422(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID, note: str
) -> None:
    order_id = order_with_assignment(db, people, minh_phat)

    res = client_as(app, KHANG).post(f"/api/v1/orders/{order_id}/customer-potential", json={"note": note})

    problem(res, 422, "VALIDATION_ERROR")


@pytest.mark.ac("AC-CUS-044")
def test_note_of_exactly_1000_chars_is_accepted(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    order_id = order_with_assignment(db, people, minh_phat)

    res = client_as(app, KHANG).post(
        f"/api/v1/orders/{order_id}/customer-potential", json={"note": "x" * 1000}
    )

    assert res.status_code == 201, res.text


@pytest.mark.ac("AC-CUS-045")
@pytest.mark.parametrize("person", [HOA, MAI, BINH, AN], ids=["sale", "cskh", "tech_lead", "manager"])
def test_non_technician_roles_are_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID, person: Person
) -> None:
    order_id = order_with_assignment(db, people, minh_phat)

    res = client_as(app, person).post(f"/api/v1/orders/{order_id}/customer-potential", json={"note": NOTE})

    problem(res, 403, "FORBIDDEN")
    assert db.execute(text("SELECT count(*) FROM customer_potential_notes")).scalar_one() == 0


@pytest.mark.ac("AC-CUS-046")
def test_history_lists_customer_notes_from_all_orders_newest_first(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    old_order = insert_order(
        db, customer_id=minh_phat, created_by=people["NV005"], status="COMPLETED", code="DH2610-0002"
    )
    order_id = order_with_assignment(db, people, minh_phat)
    insert_note(
        db,
        customer_id=minh_phat,
        order_id=old_order,
        author_id=people["NV010"],
        note="Hỏi giá máy in màu",
        created_at=datetime(2026, 10, 1, 3, 0, tzinfo=UTC),
    )
    insert_note(
        db,
        customer_id=minh_phat,
        order_id=order_id,
        author_id=people["NV020"],
        note=NOTE,
        created_at=datetime(2026, 11, 5, 3, 0, tzinfo=UTC),
    )

    res = client_as(app, KHANG).get(f"/api/v1/orders/{order_id}/customer-potential")

    assert res.status_code == 200, res.text
    notes = res.json()
    assert [n["note"] for n in notes] == [NOTE, "Hỏi giá máy in màu"]
    assert [n["order_code"] for n in notes] == ["DH2611-0005", "DH2610-0002"]
    assert [n["author_name"] for n in notes] == ["Trần Minh Khang", "Nguyễn Văn Bình"]
    assert notes[0]["created_at"].startswith("2026-11-05T03:00:00")


@pytest.mark.ac("AC-CUS-046")
def test_history_outside_scope_is_404(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    order_id = order_with_assignment(db, people, minh_phat, assignment_status=None)

    res = client_as(app, KHANG).get(f"/api/v1/orders/{order_id}/customer-potential")

    problem(res, 404, "NOT_FOUND")


@pytest.mark.ac("AC-CUS-047")
def test_report_shows_latest_potential_note(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    sep_order = completed_sep_order(db, people, minh_phat)
    order_id = order_with_assignment(db, people, minh_phat)
    insert_note(
        db,
        customer_id=minh_phat,
        order_id=sep_order,
        author_id=people["NV010"],
        note="Hỏi giá máy in màu",
        created_at=datetime(2026, 10, 1, 3, 0, tzinfo=UTC),
    )
    insert_note(
        db,
        customer_id=minh_phat,
        order_id=order_id,
        author_id=people["NV020"],
        note=NOTE,
        created_at=datetime(2026, 11, 5, 3, 0, tzinfo=UTC),
    )

    row = report_row(
        client_as(app, AN).get("/api/v1/reports/revenue-by-customer", params=REPORT_RANGE), minh_phat
    )

    assert row["potential_note"] == NOTE
    assert row["potential_noted_at"].startswith("2026-11-05T03:00:00")


def seed_purchase_history(db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID) -> None:
    """AC-CUS-048: COMPLETED 10/09, IN_PROGRESS 03/11 (giờ VN), DRAFT 06/11, CANCELLED 07/11."""
    completed_sep_order(db, people, customer_id)
    for code, status, created_at in (
        ("DH2611-0003", "IN_PROGRESS", CREATED_NOV_03_VN),
        ("DH2611-0006", "DRAFT", datetime(2026, 11, 6, 3, 0, tzinfo=UTC)),
        ("DH2611-0007", "CANCELLED", datetime(2026, 11, 7, 3, 0, tzinfo=UTC)),
    ):
        insert_order(
            db,
            customer_id=customer_id,
            created_by=people["NV005"],
            status=status,
            code=code,
            created_at=created_at,
        )


@pytest.mark.ac("AC-CUS-048")
def test_last_purchase_date_ignores_report_range_and_draft_cancelled(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    seed_purchase_history(db, people, minh_phat)

    row = report_row(
        client_as(app, AN).get("/api/v1/reports/revenue-by-customer", params=REPORT_RANGE), minh_phat
    )

    assert row["last_purchase_date"] == "2026-11-03"


@pytest.mark.ac("AC-CUS-049")
def test_customer_without_note_has_null_potential(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    completed_sep_order(db, people, minh_phat)

    row = report_row(
        client_as(app, AN).get("/api/v1/reports/revenue-by-customer", params=REPORT_RANGE), minh_phat
    )

    assert row["potential_note"] is None
    assert row["potential_noted_at"] is None
    assert row["last_purchase_date"] == "2026-09-10"


@pytest.mark.ac("AC-CUS-050")
def test_export_has_potential_and_last_purchase_columns(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    seed_purchase_history(db, people, minh_phat)
    sep_order = db.execute(text("SELECT id FROM orders WHERE code = 'DH2609-0001'")).scalar_one()
    insert_note(
        db,
        customer_id=minh_phat,
        order_id=sep_order,
        author_id=people["NV020"],
        note='=HYPERLINK("x")',
        created_at=datetime(2026, 11, 5, 3, 0, tzinfo=UTC),
    )

    res = client_as(app, AN).get("/api/v1/reports/revenue-by-customer/export", params=REPORT_RANGE)

    assert res.status_code == 200, res.text
    rows = list(csv.reader(io.StringIO(res.content.decode("utf-8-sig"))))
    header = rows[0]
    assert header[-2:] == ["Tiềm năng sử dụng dịch vụ", "Ngày mua hàng cuối"]
    data = next(r for r in rows[1:] if r[0] == "KH00042")
    assert data[-2] == '\'=HYPERLINK("x")'
    assert data[-1] == "03/11/2026"


@pytest.mark.ac("AC-CUS-050")
def test_export_blank_cells_when_no_note(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    completed_sep_order(db, people, minh_phat)

    res = client_as(app, AN).get("/api/v1/reports/revenue-by-customer/export", params=REPORT_RANGE)

    rows = list(csv.reader(io.StringIO(res.content.decode("utf-8-sig"))))
    data = next(r for r in rows[1:] if r[0] == "KH00042")
    assert data[-2:] == ["", "10/09/2026"]


@pytest.mark.ac("AC-CUS-051")
def test_sale_own_scope_rows_also_carry_new_fields(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    seed_purchase_history(db, people, minh_phat)
    other = insert_customer(db, code="KH00043", created_by=people["NV001"])
    other_order = insert_order(
        db,
        customer_id=other,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH2609-0099",
        total=500_000,
        completed_at=COMPLETED_SEP_10,
    )
    insert_order_line(
        db,
        other_order,
        line_total=500_000,
        unit_price=500_000,
        cost_price_snapshot=None,
        credited_employee_id=None,
    )
    sep_order = db.execute(text("SELECT id FROM orders WHERE code = 'DH2609-0001'")).scalar_one()
    insert_note(
        db,
        customer_id=minh_phat,
        order_id=sep_order,
        author_id=people["NV020"],
        note=NOTE,
        created_at=datetime(2026, 11, 5, 3, 0, tzinfo=UTC),
    )

    res = client_as(app, HOA).get("/api/v1/reports/revenue-by-customer", params=REPORT_RANGE)

    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert [r["customer_id"] for r in items] == [str(minh_phat)]
    assert items[0]["potential_note"] == NOTE
    assert items[0]["last_purchase_date"] == "2026-11-03"
