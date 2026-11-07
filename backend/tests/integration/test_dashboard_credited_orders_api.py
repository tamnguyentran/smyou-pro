"""M21-03: thẻ "Đơn ghi doanh số" ở khối CSKH của Tổng quan (AC-DASH-123…128)."""

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, FakeClock, Person, seed
from tests.integration.test_dashboard_cards_c_api import MAI
from tests.integration.test_dispatch_api import HOA, TUAN, client_as, problem
from tests.integration.test_revenue_report_api import insert_order, insert_order_line

LAN = Person("lan.csk@smyou.vn", "Lan@SmYou26", ("CUSTOMER_CARE",), "NV029", "Đỗ Thị Lan", "SALES")

CARD_URL = "/api/v1/dashboard/cards/care.credited_orders"
NOV_15_VN_09H = datetime(2026, 11, 15, 2, 0, tzinfo=UTC)
NOV_05 = datetime(2026, 11, 5, 3, 0, tzinfo=UTC)
OCT_28 = datetime(2026, 10, 28, 3, 0, tzinfo=UTC)
# 31/10/2026 23:50 giờ VN.
OCT_31_LATE_VN = datetime(2026, 10, 31, 16, 50, tzinfo=UTC)
CREDITED_ROW_KEYS = {"order_id", "order_code", "customer_name", "created_at", "status", "credited_total"}


@pytest.fixture
def people(db: Connection, clock: FakeClock) -> dict[str, uuid.UUID]:
    clock.now = NOV_15_VN_09H  # log in after moving the clock (token expiry)
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, MAI, LAN)}


def order(
    db: Connection,
    people: dict[str, uuid.UUID],
    code: str,
    *,
    status: str = "IN_PROGRESS",
    created_at: datetime = NOV_05,
    credited: list[tuple[str, int]],
) -> uuid.UUID:
    order_id = insert_order(
        db,
        customer_id=None,
        created_by=people["NV001"],
        status=status,
        code=code,
        total=sum(amount for _, amount in credited),
        created_at=created_at,
    )
    db.execute(
        text("UPDATE orders SET customer_name = :n WHERE id = :id"), {"n": f"KH {code}", "id": order_id}
    )
    for position, (employee_code, amount) in enumerate(credited, start=1):
        insert_order_line(
            db,
            order_id,
            position=position,
            unit_price=amount,
            line_total=amount,
            cost_price_snapshot=None,
            credited_employee_id=people[employee_code],
        )
    return order_id


def seed_ac123(db: Connection, people: dict[str, uuid.UUID]) -> None:
    order(db, people, "DH-A", credited=[("NV028", 1_000_000), ("NV028", 2_000_000)])
    order(db, people, "DH-B", status="COMPLETED", credited=[("NV028", 500_000), ("NV005", 9_000_000)])
    order(db, people, "DH-C", status="DRAFT", credited=[("NV028", 100_000)])
    order(db, people, "DH-D", status="CANCELLED", credited=[("NV028", 100_000)])
    order(db, people, "DH-E", created_at=OCT_28, credited=[("NV028", 100_000)])


def dashboard(app: FastAPI, person: Person) -> dict[str, Any]:
    res = client_as(app, person).get("/api/v1/dashboard")
    assert res.status_code == 200, res.text
    data: dict[str, Any] = res.json()
    return data


@pytest.mark.ac("AC-DASH-123")
def test_care_staff_counts_own_credited_orders_created_this_month(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_ac123(db, people)

    assert dashboard(app, MAI)["care_credited_order_count"] == 2


@pytest.mark.ac("AC-DASH-124")
def test_manager_counts_orders_credited_to_any_customer_care_staff(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_ac123(db, people)
    order(db, people, "DH-F", credited=[("NV029", 700_000)])
    order(db, people, "DH-G", credited=[("NV005", 800_000)])

    assert dashboard(app, AN)["care_credited_order_count"] == 3
    assert dashboard(app, MAI)["care_credited_order_count"] == 2


@pytest.mark.ac("AC-DASH-125")
def test_order_created_last_month_late_evening_vn_is_not_counted(
    app: FastAPI, clock: FakeClock, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    clock.now = datetime(2026, 10, 31, 17, 30, tzinfo=UTC)  # 01/11/2026 00:30 giờ VN
    order(db, people, "DH-LATE", created_at=OCT_31_LATE_VN, credited=[("NV028", 100_000)])
    # 01/11/2026 00:10 giờ VN — vẫn là 31/10 theo UTC nhưng thuộc tháng 11.
    order(
        db, people, "DH-EARLY", created_at=datetime(2026, 10, 31, 17, 10, tzinfo=UTC), credited=[("NV028", 1)]
    )

    assert dashboard(app, MAI)["care_credited_order_count"] == 1


@pytest.mark.ac("AC-DASH-124")
def test_manager_who_is_also_customer_care_sees_all_customer_care_orders(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    """Q152: người vừa MANAGER vừa CUSTOMER_CARE xem theo cách của Manager."""
    both = Person(
        "binh.ql@smyou.vn", "Binh@SmYou26", ("MANAGER", "CUSTOMER_CARE"), "NV030", "Lê Văn Bình", "MANAGEMENT"
    )
    people["NV030"] = seed(db, both)
    seed_ac123(db, people)
    order(db, people, "DH-OWN", credited=[("NV030", 400_000)])

    assert dashboard(app, both)["care_credited_order_count"] == 3


@pytest.mark.ac("AC-DASH-126")
@pytest.mark.parametrize("person", [HOA, TUAN, KHOA], ids=["sale", "tech_lead", "technician"])
def test_other_roles_do_not_get_credited_order_count(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], person: Person
) -> None:
    seed_ac123(db, people)

    assert "care_credited_order_count" not in dashboard(app, person)


@pytest.mark.ac("AC-DASH-126")
@pytest.mark.parametrize("person", [MAI, AN], ids=["customer_care", "manager"])
def test_entitled_roles_get_zero_when_nothing_credited(
    app: FastAPI, people: dict[str, uuid.UUID], person: Person
) -> None:
    assert dashboard(app, person)["care_credited_order_count"] == 0


@pytest.mark.ac("AC-DASH-127")
def test_credited_orders_card_lists_orders_with_own_credited_total(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_ac123(db, people)
    order(db, people, "DH-F", credited=[("NV029", 700_000)])

    res = client_as(app, MAI).get(f"{CARD_URL}/items")

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["kind"] == "credited_order"
    assert data["label"] == "Đơn ghi doanh số"
    assert data["total"] == 2
    rows = {r["order_code"]: r for r in data["credited_order_items"]}
    assert set(rows) == {"DH-A", "DH-B"}
    assert set(rows["DH-B"]) == CREDITED_ROW_KEYS
    assert rows["DH-A"]["credited_total"] == 3_000_000
    assert rows["DH-B"]["credited_total"] == 500_000
    assert rows["DH-B"]["status"] == "COMPLETED"
    assert rows["DH-B"]["customer_name"] == "KH DH-B"


@pytest.mark.ac("AC-DASH-127")
def test_manager_credited_orders_card_sums_all_customer_care_lines(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_ac123(db, people)
    order(db, people, "DH-F", credited=[("NV029", 700_000), ("NV028", 300_000), ("NV005", 50_000)])
    order(db, people, "DH-G", credited=[("NV005", 800_000)])

    res = client_as(app, AN).get(f"{CARD_URL}/items")

    assert res.status_code == 200, res.text
    rows = {r["order_code"]: r["credited_total"] for r in res.json()["credited_order_items"]}
    assert rows == {"DH-A": 3_000_000, "DH-B": 500_000, "DH-F": 1_000_000}


@pytest.mark.ac("AC-DASH-127")
def test_credited_orders_export_matches_list(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_ac123(db, people)

    res = client_as(app, MAI).get(f"{CARD_URL}/export")

    assert res.status_code == 200, res.text
    raw = res.content.decode("utf-8")
    assert raw.startswith("﻿")
    table = list(csv.reader(io.StringIO(raw[1:])))
    assert table[0] == ["Mã đơn", "Khách hàng", "Ngày tạo", "Trạng thái", "Doanh số ghi cho CSKH"]
    assert sorted((r[0], r[4]) for r in table[1:]) == [("DH-A", "3000000"), ("DH-B", "500000")]


@pytest.mark.ac("AC-DASH-128")
@pytest.mark.parametrize("person", [HOA, TUAN, KHOA], ids=["sale", "tech_lead", "technician"])
@pytest.mark.parametrize("suffix", ["items", "export"])
def test_other_roles_are_forbidden_from_credited_orders_card(
    app: FastAPI, people: dict[str, uuid.UUID], person: Person, suffix: str
) -> None:
    problem(client_as(app, person).get(f"{CARD_URL}/{suffix}"), 403, "FORBIDDEN")
