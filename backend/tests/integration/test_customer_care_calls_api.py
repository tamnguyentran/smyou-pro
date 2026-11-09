"""M27-01a: CSKH ghi nhận cuộc gọi chăm sóc khách hàng (AC-CUS-061…066). UAT-05 (Q199, thay Q192):
yêu cầu của khách chỉ lưu ở cuộc gọi, không thành "tiềm năng sử dụng dịch vụ" (AC-CUS-086/087)."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, Person, seed
from tests.integration.test_customer_potential_api import (
    KHANG,
    REPORT_RANGE,
    completed_sep_order,
    insert_note,
    order_with_assignment,
    report_row,
)
from tests.integration.test_dispatch_api import HOA, client_as, problem

LAN = Person("lan.cskh@smyou.vn", "Lan@SmYou26", ("CUSTOMER_CARE",), "NV016", "Phạm Thị Lan", "SALES")
MAI = Person("mai.vo@smyou.vn", "Mai@SmYou26", ("CUSTOMER_CARE",), "NV015", "Võ Thị Mai", "SALES")
TOAN = Person("toan.tl@smyou.vn", "Toan@SmYou26", ("TECH_LEAD",), "NV011", "Lê Văn Toàn", "TECHNICAL")
QUAN = Person("quan.ktv@smyou.vn", "Quan@SmYou26", ("TECHNICIAN",), "NV021", "Đỗ Minh Quân", "TECHNICAL")
BINH = Person("binh.tl@smyou.vn", "Binh@SmYou26", ("TECH_LEAD",), "NV010", "Nguyễn Văn Bình", "TECHNICAL")

URL = "/api/v1/customer-care-calls"
OFFERED = "Camera IP 4MP"
REQUEST = "Báo giá 6 camera kho"


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, LAN, MAI, TOAN, QUAN, BINH, KHANG)}


def insert_customer(db: Connection, *, code: str, name: str, phone: str, created_by: uuid.UUID) -> uuid.UUID:
    customer_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO customers (id, code, type, name, contact_person, phone, created_by, version)"
            " VALUES (:id, :code, 'COMPANY', :name, 'Người liên hệ', :phone, :created_by, 1)"
        ),
        {"id": customer_id, "code": code, "name": name, "phone": phone, "created_by": created_by},
    )
    return customer_id


@pytest.fixture
def minh_phat(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    return insert_customer(
        db, code="KH00042", name="Công ty TNHH Minh Phát", phone="0918000042", created_by=people["NV001"]
    )


@pytest.fixture
def an_khang(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    return insert_customer(
        db, code="KH00043", name="Nhà thuốc An Khang", phone="0907111222", created_by=people["NV001"]
    )


def insert_call(
    db: Connection,
    *,
    customer_id: uuid.UUID,
    caller_id: uuid.UUID,
    offered: str,
    called_at: datetime,
    customer_request: str | None = None,
) -> uuid.UUID:
    call_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO customer_care_calls"
            " (id, customer_id, caller_id, offered, customer_request, called_at)"
            " VALUES (:id, :customer_id, :caller_id, :offered, :customer_request, :called_at)"
        ),
        {
            "id": call_id,
            "customer_id": customer_id,
            "caller_id": caller_id,
            "offered": offered,
            "customer_request": customer_request,
            "called_at": called_at,
        },
    )
    return call_id


def potential_rows(db: Connection, customer_id: uuid.UUID) -> list[Any]:
    return db.execute(
        text("SELECT * FROM customer_potential_notes WHERE customer_id = :id"), {"id": customer_id}
    ).all()


def test_care_call_capabilities_declared() -> None:
    from app.main import create_app

    routes = {(m, p): c for m, p, c in declared_routes(create_app())}
    assert routes[("POST", URL)] == "customer_care.call.record"
    assert routes[("GET", URL)] == "customer_care.call.read"


@pytest.mark.ac("AC-CUS-061")
@pytest.mark.ac("AC-CUS-086")
def test_care_staff_records_call_and_request_stays_on_the_call(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    res = client_as(app, LAN).post(
        URL, json={"customer_id": str(minh_phat), "offered": OFFERED, "customer_request": REQUEST}
    )

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["customer_id"] == str(minh_phat)
    assert body["customer_name"] == "Công ty TNHH Minh Phát"
    assert body["customer_phone"] == "0918000042"
    assert body["caller_id"] == str(people["NV016"])
    assert body["caller_name"] == "Phạm Thị Lan"
    assert body["offered"] == OFFERED
    assert body["customer_request"] == REQUEST
    called_at = datetime.fromisoformat(body["called_at"])
    assert abs(datetime.now(UTC) - called_at) < timedelta(minutes=10)

    event = db.execute(
        text("SELECT * FROM audit_events WHERE entity_type = 'CUSTOMER' AND entity_id = :id"),
        {"id": minh_phat},
    ).one()
    assert event.action == "care_call"
    assert event.actor_id == people["NV016"]
    assert event.data["care_call_id"] == body["id"]

    stored = db.execute(
        text("SELECT customer_request FROM customer_care_calls WHERE id = :id"), {"id": body["id"]}
    ).scalar_one()
    assert stored == REQUEST
    assert potential_rows(db, minh_phat) == []


@pytest.mark.ac("AC-CUS-061")
def test_offered_and_request_are_trimmed(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    res = client_as(app, LAN).post(
        URL,
        json={"customer_id": str(minh_phat), "offered": f"  {OFFERED} ", "customer_request": f" {REQUEST}  "},
    )

    assert res.status_code == 201, res.text
    assert res.json()["offered"] == OFFERED
    assert res.json()["customer_request"] == REQUEST
    stored = db.execute(
        text("SELECT customer_request FROM customer_care_calls WHERE id = :id"), {"id": res.json()["id"]}
    ).scalar_one()
    assert stored == REQUEST


@pytest.mark.ac("AC-CUS-062")
@pytest.mark.parametrize("extra", [{}, {"customer_request": None}, {"customer_request": "   "}])
def test_call_without_request_adds_no_potential_note(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    minh_phat: uuid.UUID,
    extra: dict[str, Any],
) -> None:
    res = client_as(app, LAN).post(URL, json={"customer_id": str(minh_phat), "offered": OFFERED, **extra})

    assert res.status_code == 201, res.text
    assert res.json()["customer_request"] is None
    assert potential_rows(db, minh_phat) == []
    count = db.execute(
        text("SELECT count(*) FROM customer_care_calls WHERE customer_id = :id"), {"id": minh_phat}
    ).scalar_one()
    assert count == 1


@pytest.mark.ac("AC-CUS-063")
@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"offered": ""}, "offered"),
        ({"offered": "   "}, "offered"),
        ({"offered": "x" * 2001}, "offered"),
        ({"customer_request": "y" * 2001}, "customer_request"),
    ],
    ids=["offered_empty", "offered_blank", "offered_too_long", "request_too_long"],
)
def test_invalid_fields_are_422(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    minh_phat: uuid.UUID,
    change: dict[str, str],
    field: str,
) -> None:
    res = client_as(app, LAN).post(URL, json={"customer_id": str(minh_phat), "offered": OFFERED, **change})

    body = problem(res, 422, "VALIDATION_ERROR")
    assert field in [e["field"] for e in body["errors"]]
    assert potential_rows(db, minh_phat) == []
    assert db.execute(text("SELECT count(*) FROM customer_care_calls")).scalar_one() == 0


@pytest.mark.ac("AC-CUS-063")
def test_fields_of_exactly_2000_chars_are_accepted(
    app: FastAPI, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    res = client_as(app, LAN).post(
        URL, json={"customer_id": str(minh_phat), "offered": "x" * 2000, "customer_request": "y" * 2000}
    )

    assert res.status_code == 201, res.text


@pytest.mark.ac("AC-CUS-063")
def test_unknown_customer_is_404(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    res = client_as(app, LAN).post(URL, json={"customer_id": str(uuid.uuid4()), "offered": OFFERED})

    problem(res, 404, "NOT_FOUND")


@pytest.mark.ac("AC-CUS-064")
@pytest.mark.parametrize("person", [HOA, TOAN, QUAN], ids=["sale", "tech_lead", "technician"])
def test_other_roles_cannot_record_calls(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID, person: Person
) -> None:
    res = client_as(app, person).post(
        URL, json={"customer_id": str(minh_phat), "offered": OFFERED, "customer_request": REQUEST}
    )

    problem(res, 403, "FORBIDDEN")
    assert potential_rows(db, minh_phat) == []
    assert db.execute(text("SELECT count(*) FROM customer_care_calls")).scalar_one() == 0


def seed_three_calls(
    db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID, an_khang: uuid.UUID
) -> None:
    """Lan: Minh Phát 05/11 10:00 VN, An Khang 06/11 00:30 VN; Mai: Minh Phát 06/11 09:00 VN."""
    insert_call(
        db,
        customer_id=minh_phat,
        caller_id=people["NV016"],
        offered="Máy in Canon LBP2900",
        called_at=datetime(2026, 11, 5, 3, 0, tzinfo=UTC),
    )
    insert_call(
        db,
        customer_id=an_khang,
        caller_id=people["NV016"],
        offered="Camera IP 4MP",
        customer_request="Lắp 2 camera quầy",
        called_at=datetime(2026, 11, 5, 17, 30, tzinfo=UTC),
    )
    insert_call(
        db,
        customer_id=minh_phat,
        caller_id=people["NV015"],
        offered="Bảo trì máy tính định kỳ",
        called_at=datetime(2026, 11, 6, 2, 0, tzinfo=UTC),
    )


@pytest.mark.ac("AC-CUS-065")
def test_manager_sees_all_calls_newest_first(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    minh_phat: uuid.UUID,
    an_khang: uuid.UUID,
) -> None:
    # M27-03 (Q197): phần "Lan/Mai chỉ thấy cuộc gọi của mình" được AC-CUS-080 thay thế.
    seed_three_calls(db, people, minh_phat, an_khang)

    nam = client_as(app, AN).get(URL)
    assert nam.status_code == 200, nam.text
    assert nam.json()["total"] == 3
    items = nam.json()["items"]
    assert [c["offered"] for c in items] == [
        "Bảo trì máy tính định kỳ",
        "Camera IP 4MP",
        "Máy in Canon LBP2900",
    ]
    assert items[1]["customer_name"] == "Nhà thuốc An Khang"
    assert items[1]["customer_phone"] == "0907111222"
    assert items[1]["customer_request"] == "Lắp 2 camera quầy"
    assert items[1]["called_at"].startswith("2026-11-05T17:30:00")


@pytest.mark.ac("AC-CUS-065")
def test_sale_cannot_read_calls(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    problem(client_as(app, HOA).get(URL), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CUS-080")
def test_care_staff_see_all_calls_and_filter_by_caller(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    minh_phat: uuid.UUID,
    an_khang: uuid.UUID,
) -> None:
    seed_three_calls(db, people, minh_phat, an_khang)
    lan = client_as(app, LAN)

    res = lan.get(URL)
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 3
    assert [c["offered"] for c in res.json()["items"]] == [
        "Bảo trì máy tính định kỳ",
        "Camera IP 4MP",
        "Máy in Canon LBP2900",
    ]
    assert {c["caller_name"] for c in res.json()["items"]} == {"Phạm Thị Lan", "Võ Thị Mai"}

    only_mai = lan.get(URL, params={"caller_id": str(people["NV015"])})
    assert only_mai.status_code == 200, only_mai.text
    assert only_mai.json()["total"] == 1
    assert [(c["offered"], c["caller_name"]) for c in only_mai.json()["items"]] == [
        ("Bảo trì máy tính định kỳ", "Võ Thị Mai")
    ]

    problem(client_as(app, HOA).get(URL), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CUS-066")
def test_manager_filters_and_paginates_calls(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    minh_phat: uuid.UUID,
    an_khang: uuid.UUID,
) -> None:
    seed_three_calls(db, people, minh_phat, an_khang)
    nam = client_as(app, AN)

    def offered(params: dict[str, Any]) -> tuple[int, list[str]]:
        res = nam.get(URL, params=params)
        assert res.status_code == 200, res.text
        return res.json()["total"], [c["offered"] for c in res.json()["items"]]

    assert offered({"customer_id": str(minh_phat)}) == (
        2,
        ["Bảo trì máy tính định kỳ", "Máy in Canon LBP2900"],
    )
    assert offered({"caller_id": str(people["NV015"])}) == (1, ["Bảo trì máy tính định kỳ"])
    # 05/11 17:30 UTC là 06/11 00:30 giờ VN → thuộc ngày 06/11.
    assert offered({"from": "2026-11-06", "to": "2026-11-06"}) == (
        2,
        ["Bảo trì máy tính định kỳ", "Camera IP 4MP"],
    )
    assert offered({"to": "2026-11-05"}) == (1, ["Máy in Canon LBP2900"])
    assert offered({"q": "an khang"}) == (1, ["Camera IP 4MP"])
    assert offered({"q": "0918000042"}) == (2, ["Bảo trì máy tính định kỳ", "Máy in Canon LBP2900"])
    assert offered({"q": "minh phat", "caller_id": str(people["NV016"])}) == (1, ["Máy in Canon LBP2900"])
    assert offered({"limit": 2, "offset": 0}) == (3, ["Bảo trì máy tính định kỳ", "Camera IP 4MP"])
    assert offered({"limit": 2, "offset": 2}) == (3, ["Máy in Canon LBP2900"])


@pytest.mark.ac("AC-CUS-066")
@pytest.mark.parametrize("params", [{"limit": 101}, {"limit": 0}, {"offset": -1}])
def test_invalid_paging_is_422(app: FastAPI, people: dict[str, uuid.UUID], params: dict[str, int]) -> None:
    problem(client_as(app, AN).get(URL, params=params), 422, "VALIDATION_ERROR")


def insert_legacy_call_note(
    db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID, created_at: datetime
) -> None:
    """A potential note written from a care call before UAT-05 (Q192) — still in the table."""
    call_id = insert_call(
        db,
        customer_id=customer_id,
        caller_id=people["NV016"],
        offered=OFFERED,
        customer_request=REQUEST,
        called_at=created_at,
    )
    db.execute(
        text(
            "INSERT INTO customer_potential_notes"
            " (id, customer_id, care_call_id, author_id, note, created_at)"
            " VALUES (:id, :customer_id, :care_call_id, :author_id, :note, :created_at)"
        ),
        {
            "id": uuid.uuid4(),
            "customer_id": customer_id,
            "care_call_id": call_id,
            "author_id": people["NV016"],
            "note": REQUEST,
            "created_at": created_at,
        },
    )


@pytest.mark.ac("AC-CUS-087")
def test_report_potential_ignores_care_call_notes(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    sep_order = completed_sep_order(db, people, minh_phat)
    insert_note(
        db,
        customer_id=minh_phat,
        order_id=sep_order,
        author_id=people["NV020"],
        note="Muốn lắp thêm 4 camera kho",
        created_at=datetime(2026, 10, 1, 3, 0, tzinfo=UTC),
    )
    insert_legacy_call_note(db, people, minh_phat, datetime(2026, 10, 5, 3, 0, tzinfo=UTC))

    row = report_row(
        client_as(app, AN).get("/api/v1/reports/revenue-by-customer", params=REPORT_RANGE), minh_phat
    )

    assert row["potential_note"] == "Muốn lắp thêm 4 camera kho"


@pytest.mark.ac("AC-CUS-087")
def test_order_potential_history_ignores_care_call_notes(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], minh_phat: uuid.UUID
) -> None:
    order_id = order_with_assignment(db, people, minh_phat)
    insert_note(
        db,
        customer_id=minh_phat,
        order_id=order_id,
        author_id=people["NV020"],
        note="Muốn lắp thêm 4 camera kho",
        created_at=datetime(2026, 10, 1, 3, 0, tzinfo=UTC),
    )
    insert_legacy_call_note(db, people, minh_phat, datetime(2026, 10, 5, 3, 0, tzinfo=UTC))

    res = client_as(app, AN).get(f"/api/v1/orders/{order_id}/customer-potential")

    assert res.status_code == 200, res.text
    notes = res.json()
    assert [n["note"] for n in notes] == ["Muốn lắp thêm 4 camera kho"]
    assert [n["source"] for n in notes] == ["ORDER"]
