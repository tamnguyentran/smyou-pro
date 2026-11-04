"""M23a: "Biểu đồ kinh doanh" — 3 endpoint số liệu, chỉ Manager (AC-RPT-100…122)."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, FakeClock, Person, seed
from tests.integration.test_kpi_sales_report_api import KHANG, sale
from tests.integration.test_kpi_targets_api import HOA, HUNG, NGOC, TUAN, client_as, put_target
from tests.integration.test_revenue_report_api import insert_order

LONG = Person("long.pham@smyou.vn", "Long@SmYou26", ("TECHNICIAN",), "NV020", "Phạm Đức Long", "ECONOMIC")
QUAN = Person("quan.vo@smyou.vn", "Quan@SmYou26", ("TECHNICIAN",), "NV021", "Võ Minh Quân", "ECONOMIC")

BASE = "/api/v1/reports/business-charts"
RESULTS = f"{BASE}/results"
SALES = f"{BASE}/sales"
STAFF = f"{BASE}/staff"
PERIOD = {"from": "2026-09", "to": "2026-10"}


def utc(month: int, day: int, hour: int = 3, minute: int = 0) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=UTC)


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, NGOC, HUNG, KHANG, LONG, QUAN)}


@pytest.fixture
def an(app: FastAPI, people: dict[str, uuid.UUID]) -> TestClient:
    return client_as(app, AN)


# ---------------------------------------------------------------- data helpers


def group_id(db: Connection, name: str) -> uuid.UUID:
    value: uuid.UUID = db.execute(
        text("SELECT id FROM product_service_groups WHERE name = :n AND is_active"), {"n": name}
    ).scalar_one()
    return value


def customer(
    db: Connection, created_by: uuid.UUID, *, code: str, name: str, kind: str = "COMPANY"
) -> uuid.UUID:
    customer_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO customers (id, code, type, name, contact_person, phone, created_by, version)"
            " VALUES (:id, :code, :type, :name, 'Người liên hệ', '0918000000', :created_by, 1)"
        ),
        {"id": customer_id, "code": code, "type": kind, "name": name, "created_by": created_by},
    )
    return customer_id


def product(db: Connection, name: str, *, active: bool = True, cost: int | None = None) -> uuid.UUID:
    product_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO products (id, sku, name, category, unit, price, cost_price, vat_rate, price_fixed,"
            " is_active, version)"
            " VALUES (:id, :sku, :name, 'PC', 'CAI', 1000000, :cost, 8, false, :active, 1)"
        ),
        {"id": product_id, "sku": f"SKU-{product_id.hex[:8]}", "name": name, "cost": cost, "active": active},
    )
    return product_id


def service(db: Connection, name: str, *, active: bool = True) -> uuid.UUID:
    service_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO services (id, code, name, category, unit, price, vat_rate, price_fixed, is_active,"
            " version) VALUES (:id, :code, :name, 'MAINTENANCE', 'LAN', 500000, 8, false, :active, 1)"
        ),
        {"id": service_id, "code": f"DV-{service_id.hex[:8]}", "name": name, "active": active},
    )
    return service_id


def order(
    db: Connection,
    created_by: uuid.UUID,
    *,
    code: str,
    status: str = "COMPLETED",
    customer_id: uuid.UUID | None = None,
    completed_at: datetime | None = None,
    submitted_at: datetime | None = None,
    division_id: uuid.UUID | None = None,
) -> uuid.UUID:
    order_id = insert_order(
        db,
        customer_id=customer_id,
        created_by=created_by,
        status=status,
        code=code,
        completed_at=completed_at,
    )
    db.execute(
        text("UPDATE orders SET submitted_at = :s, division_id = :d WHERE id = :id"),
        {"s": submitted_at, "d": division_id, "id": order_id},
    )
    return order_id


def line(
    db: Connection,
    order_id: uuid.UUID,
    *,
    name: str,
    quantity: str,
    unit_price: int,
    line_total: int,
    cost: int | None,
    position: int = 1,
    product_id: uuid.UUID | None = None,
    service_id: uuid.UUID | None = None,
    unit: str = "CAI",
) -> None:
    item_type = "PRODUCT" if product_id else "SERVICE" if service_id else "CUSTOM"
    db.execute(
        text(
            "INSERT INTO order_lines (id, order_id, position, item_type, product_id, service_id,"
            " name_snapshot, unit_snapshot, vat_rate, quantity, unit_price, line_gross, line_vat, line_total,"
            " cost_price_snapshot)"
            " VALUES (:id, :order_id, :position, :item_type, :product_id, :service_id, :name, :unit, 0,"
            " :quantity, :unit_price, :line_total, 0, :line_total, :cost)"
        ),
        {
            "id": uuid.uuid4(),
            "order_id": order_id,
            "position": position,
            "item_type": item_type,
            "product_id": product_id,
            "service_id": service_id,
            "name": name,
            "unit": unit,
            "quantity": Decimal(quantity),
            "unit_price": unit_price,
            "line_total": line_total,
            "cost": cost,
        },
    )


def completed_sale(
    db: Connection,
    created_by: uuid.UUID,
    *,
    code: str,
    line_total: int,
    cost: int,
    item: uuid.UUID,
    qty: str = "1",
) -> None:
    order_id = order(db, created_by, code=code, completed_at=utc(10, 10), submitted_at=utc(10, 1))
    line(
        db,
        order_id,
        name=code,
        quantity=qty,
        unit_price=line_total,
        line_total=line_total,
        cost=cost,
        product_id=item,
    )


def seed_sample(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    an_id = people["NV001"]
    minh_phat = customer(db, an_id, code="KH0101", name="Công ty TNHH Minh Phát")
    lan = customer(db, an_id, code="KH0102", name="Nguyễn Thị Lan", kind="INDIVIDUAL")
    canon = product(db, "Máy in Canon LBP 2900", cost=2_800_000)
    imou = product(db, "Camera Imou", cost=600_000)
    o1 = order(
        db,
        an_id,
        code="DH2609-0011",
        customer_id=minh_phat,
        completed_at=utc(9, 15),
        submitted_at=utc(9, 10),
        division_id=group_id(db, "Thiết bị văn phòng"),
    )
    line(db, o1, name="Máy in Canon LBP 2900", quantity="2", unit_price=3_500_000, line_total=7_000_000,
         cost=2_800_000, product_id=canon)  # fmt: skip
    o2 = order(
        db,
        an_id,
        code="DH2610-0021",
        customer_id=lan,
        completed_at=utc(10, 5),
        submitted_at=utc(10, 3),
        division_id=group_id(db, "Thiết bị an ninh"),
    )
    line(db, o2, name="Camera Imou", quantity="4", unit_price=800_000, line_total=3_200_000, cost=600_000,
         product_id=imou)  # fmt: skip
    line(
        db,
        o2,
        name="Công đi dây",
        quantity="1",
        unit_price=500_000,
        line_total=500_000,
        cost=None,
        position=2,
    )
    o3 = order(
        db,
        an_id,
        code="DH2610-0022",
        status="IN_PROGRESS",
        submitted_at=utc(10, 20),
        division_id=group_id(db, "Kỹ thuật chung"),
    )
    line(db, o3, name="Công lắp đặt", quantity="1", unit_price=1_000_000, line_total=1_000_000, cost=None)
    return {"minh_phat": minh_phat, "lan": lan, "canon": canon, "imou": imou}


def get(client: TestClient, url: str, **params: str) -> dict[str, Any]:
    res = client.get(url, params={**PERIOD, **params})
    assert res.status_code == 200, res.text
    result: dict[str, Any] = res.json()
    return result


def problem(res: Any, status: int, code: str) -> dict[str, Any]:
    assert res.status_code == status, res.text
    payload: dict[str, Any] = res.json()
    assert payload["code"] == code
    return payload


# ---------------------------------------------------------------- AC tests


def test_business_charts_capabilities_declared() -> None:
    from app.main import create_app

    routes = {(m, p): c for m, p, c in declared_routes(create_app())}
    for url in (RESULTS, SALES, STAFF):
        assert routes[("GET", url)] == "report.business_charts.read"


@pytest.mark.ac("AC-RPT-100")
def test_monthly_revenue_and_profit(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_sample(db, people)

    data = get(an, RESULTS)

    assert (data["from"], data["to"]) == ("2026-09", "2026-10")
    assert data["monthly"] == [
        {"month": "2026-09", "revenue": 7_000_000, "profit": 1_400_000},
        {"month": "2026-10", "revenue": 3_700_000, "profit": 950_000},
    ]


@pytest.mark.ac("AC-RPT-102")
def test_monthly_includes_empty_months(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_sample(db, people)

    data = get(an, RESULTS, **{"from": "2026-07"})

    assert [m["month"] for m in data["monthly"]] == ["2026-07", "2026-08", "2026-09", "2026-10"]
    assert data["monthly"][0] == {"month": "2026-07", "revenue": 0, "profit": 0}
    assert data["monthly"][1] == {"month": "2026-08", "revenue": 0, "profit": 0}


@pytest.mark.ac("AC-RPT-103")
def test_month_boundaries_follow_vietnam_time(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    edge = product(db, "Bộ phát Wifi")
    early = order(
        db, people["NV001"], code="DH-EDGE-1", completed_at=utc(9, 30, 16, 30), submitted_at=utc(9, 1)
    )
    line(
        db,
        early,
        name="Wifi",
        quantity="1",
        unit_price=1_000_000,
        line_total=1_000_000,
        cost=500_000,
        product_id=edge,
    )
    late = order(
        db, people["NV001"], code="DH-EDGE-2", completed_at=utc(10, 31, 17, 30), submitted_at=utc(10, 1)
    )
    line(
        db,
        late,
        name="Wifi",
        quantity="1",
        unit_price=2_000_000,
        line_total=2_000_000,
        cost=500_000,
        product_id=edge,
    )

    data = get(an, RESULTS)

    assert data["monthly"] == [
        {"month": "2026-09", "revenue": 1_000_000, "profit": 500_000},
        {"month": "2026-10", "revenue": 0, "profit": 0},
    ]


@pytest.mark.ac("AC-RPT-104")
def test_composition_by_group(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_sample(db, people)

    groups = get(an, RESULTS)["composition"]["by_group"]

    assert [(g["label"], g["revenue"], g["profit"]) for g in groups] == [
        ("Thiết bị văn phòng", 7_000_000, 1_400_000),
        ("Thiết bị an ninh", 3_700_000, 950_000),
    ]
    assert groups[0]["key"] == str(group_id(db, "Thiết bị văn phòng"))


@pytest.mark.ac("AC-RPT-104")
def test_composition_order_without_group_is_unclassified(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = order(db, people["NV001"], code="DH-NOGRP", completed_at=utc(10, 2), submitted_at=utc(10, 1))
    line(
        db, order_id, name="Công vệ sinh", quantity="1", unit_price=300_000, line_total=300_000, cost=100_000
    )

    groups = get(an, RESULTS)["composition"]["by_group"]

    assert [(g["label"], g["revenue"]) for g in groups] == [("Chưa phân nhóm", 300_000)]


@pytest.mark.ac("AC-RPT-105")
def test_composition_by_item_top_nine_plus_other(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    for n in range(1, 13):
        item = product(db, f"Sản phẩm {n:02d}")
        completed_sale(
            db, people["NV001"], code=f"DH-I{n:02d}", line_total=n * 1_000_000, cost=n * 500_000, item=item
        )

    data = get(an, RESULTS)
    items = data["composition"]["by_item"]

    assert len(items) == 10
    assert [i["label"] for i in items[:9]] == [f"Sản phẩm {n:02d}" for n in range(12, 3, -1)]
    assert items[9]["key"] == "OTHER"
    assert items[9]["label"] == "Khác"
    assert (items[9]["revenue"], items[9]["profit"]) == (6_000_000, 3_000_000)  # 1 + 2 + 3 triệu
    assert sum(i["revenue"] for i in items) == sum(m["revenue"] for m in data["monthly"])


@pytest.mark.ac("AC-RPT-106")
def test_composition_by_customer_type_walk_in_is_individual(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_sample(db, people)
    walk_in = order(
        db, people["NV001"], code="DH2610-0030", completed_at=utc(10, 10), submitted_at=utc(10, 9)
    )
    line(db, walk_in, name="Mực in", quantity="1", unit_price=1_000_000, line_total=1_000_000, cost=700_000)

    types = get(an, RESULTS)["composition"]["by_customer_type"]

    assert [(t["key"], t["label"], t["revenue"]) for t in types] == [
        ("COMPANY", "Tổ chức", 7_000_000),
        ("INDIVIDUAL", "Cá nhân", 4_700_000),
    ]


@pytest.mark.ac("AC-RPT-107")
def test_new_vs_returning_customers(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an_id = people["NV001"]
    lan = customer(db, an_id, code="KH0201", name="Nguyễn Thị Lan", kind="INDIVIDUAL")
    minh_phat = customer(db, an_id, code="KH0202", name="Công ty TNHH Minh Phát")
    hung = customer(db, an_id, code="KH0203", name="Đỗ Mạnh Hùng", kind="INDIVIDUAL")
    order(db, an_id, code="DH-C1", status="IN_PROGRESS", customer_id=lan, submitted_at=utc(10, 3))
    order(db, an_id, code="DH-C2", status="PENDING_DISPATCH", customer_id=lan, submitted_at=utc(10, 25))
    order(db, an_id, code="DH-C3", completed_at=utc(8, 20), customer_id=minh_phat, submitted_at=utc(8, 10))
    order(db, an_id, code="DH-C4", status="IN_PROGRESS", customer_id=minh_phat, submitted_at=utc(10, 12))
    order(db, an_id, code="DH-C5", status="CANCELLED", customer_id=hung, submitted_at=utc(10, 15))
    order(db, an_id, code="DH-C6", status="IN_PROGRESS", submitted_at=utc(10, 20))

    data = get(an, RESULTS)

    assert data["customers_monthly"] == [
        {"month": "2026-09", "new_count": 0, "returning_count": 0},
        {"month": "2026-10", "new_count": 1, "returning_count": 1},
    ]


@pytest.mark.ac("AC-RPT-108")
def test_draft_order_does_not_make_customer_new(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    binh = customer(db, people["NV001"], code="KH0301", name="Trần Văn Bình", kind="INDIVIDUAL")
    order(db, people["NV001"], code="DH-DRAFT", status="DRAFT", customer_id=binh)

    october = get(an, RESULTS)["customers_monthly"][1]

    assert october == {"month": "2026-10", "new_count": 0, "returning_count": 0}


def seed_pareto(db: Connection, people: dict[str, uuid.UUID]) -> None:
    for n, revenue in enumerate((50, 30, 10, 6, 4), start=1):
        item = product(db, f"Hàng Pareto {n}")
        completed_sale(
            db, people["NV001"], code=f"DH-P{n}", line_total=revenue * 1_000_000, cost=0, item=item
        )
    gift = product(db, "Quà tặng chuột")
    order_id = order(db, people["NV001"], code="DH-P6", completed_at=utc(10, 11), submitted_at=utc(10, 1))
    line(
        db,
        order_id,
        name="Quà tặng chuột",
        quantity="1",
        unit_price=0,
        line_total=0,
        cost=200_000,
        product_id=gift,
    )


@pytest.mark.ac("AC-RPT-109")
def test_pareto_by_revenue(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_pareto(db, people)

    data = get(an, SALES, metric="revenue")

    assert data["metric"] == "revenue"
    assert [(p["label"], p["value"], p["cumulative_pct"], p["is_vital"]) for p in data["pareto"]] == [
        ("Hàng Pareto 1", 50_000_000, 50.0, True),
        ("Hàng Pareto 2", 30_000_000, 80.0, True),
        ("Hàng Pareto 3", 10_000_000, 90.0, False),
        ("Hàng Pareto 4", 6_000_000, 96.0, False),
        ("Hàng Pareto 5", 4_000_000, 100.0, False),
    ]


@pytest.mark.ac("AC-RPT-109")
def test_pareto_defaults_to_revenue(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_pareto(db, people)

    data = get(an, SALES)

    assert data["metric"] == "revenue"
    assert len(data["pareto"]) == 5


@pytest.mark.ac("AC-RPT-110")
def test_pareto_by_profit_drops_non_positive(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_pareto(db, people)

    data = get(an, SALES, metric="profit")

    assert data["metric"] == "profit"
    assert [p["label"] for p in data["pareto"]] == [f"Hàng Pareto {n}" for n in range(1, 6)]
    assert "Quà tặng chuột" not in {p["label"] for p in data["pareto"]}


@pytest.mark.ac("AC-RPT-111")
def test_unknown_metric_is_rejected(an: TestClient, people: dict[str, uuid.UUID]) -> None:
    problem(an.get(SALES, params={**PERIOD, "metric": "quantity"}), 422, "VALIDATION_ERROR")


@pytest.mark.ac("AC-RPT-112")
def test_top_selling_by_quantity_catalog_only(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    ids = seed_sample(db, people)

    top = get(an, SALES)["top_selling"]

    assert [(t["key"], t["label"], t["unit"], t["quantity"], t["revenue"]) for t in top] == [
        (str(ids["imou"]), "Camera Imou", "CAI", 4.0, 3_200_000),
        (str(ids["canon"]), "Máy in Canon LBP 2900", "CAI", 2.0, 7_000_000),
    ]
    assert "Công đi dây" not in {t["label"] for t in top}


@pytest.mark.ac("AC-RPT-113")
def test_slow_selling_includes_unsold_active_items(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    for n in range(1, 11):
        item = product(db, f"Hàng {n:02d}")
        completed_sale(
            db, people["NV001"], code=f"DH-S{n:02d}", line_total=1_000_000, cost=0, item=item, qty=str(n)
        )
    product(db, "Ổ cứng SSD 256GB")
    service(db, "Bảo trì máy in")
    product(db, "Switch 8 port", active=False)

    slow = get(an, SALES)["slow_selling"]

    assert [(s["label"], s["quantity"]) for s in slow] == [
        ("Bảo trì máy in", 0.0),
        ("Ổ cứng SSD 256GB", 0.0),
        *[(f"Hàng {n:02d}", float(n)) for n in range(1, 9)],
    ]
    assert slow[0]["unit"] == "LAN"
    assert "Switch 8 port" not in {s["label"] for s in slow}


def assign(
    db: Connection,
    people: dict[str, uuid.UUID],
    employee: str,
    *,
    code: str,
    hours: str,
    status: str,
    created_at: datetime,
) -> None:
    order_id = order(db, people["NV010"], code=f"DH-{code}", status="IN_PROGRESS", submitted_at=created_at)
    task_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
            " estimated_hours, due_at, priority, created_by)"
            " VALUES (:id, :order_id, :code, :code, 'INITIAL', 0, 'IN_PROGRESS', :hours, :due_at,"
            " 'NORMAL', :created_by)"
        ),
        {
            "id": task_id,
            "order_id": order_id,
            "code": code,
            "hours": Decimal(hours),
            "due_at": created_at,
            "created_by": people["NV010"],
        },
    )
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, cycle, status, assigned_by, created_at)"
            " VALUES (:id, :task_id, :employee_id, 1, :status, :assigned_by, :created_at)"
        ),
        {
            "id": uuid.uuid4(),
            "task_id": task_id,
            "employee_id": people[employee],
            "status": status,
            "assigned_by": people["NV010"],
            "created_at": created_at,
        },
    )


@pytest.mark.ac("AC-RPT-114")
def test_assigned_hours_per_technician(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    assign(db, people, "NV020", code="T-L1", hours="3.5", status="ACCEPTED", created_at=utc(10, 2))
    assign(db, people, "NV020", code="T-L2", hours="2", status="DONE", created_at=utc(9, 9))
    assign(db, people, "NV020", code="T-L3", hours="4", status="REJECTED", created_at=utc(10, 12))
    assign(db, people, "NV020", code="T-L4", hours="1", status="PENDING", created_at=utc(8, 28))

    rows = get(an, STAFF)["hours_by_technician"]

    assert rows == [
        {
            "employee_id": str(people["NV020"]),
            "employee_code": "NV020",
            "employee_name": "Phạm Đức Long",
            "assigned_hours": 5.5,
            "task_count": 2,
        }
    ]


@pytest.mark.ac("AC-RPT-114")
def test_removed_assignment_is_not_counted(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    assign(db, people, "NV020", code="T-R1", hours="6", status="REMOVED", created_at=utc(10, 2))

    assert get(an, STAFF)["hours_by_technician"] == []


@pytest.mark.ac("AC-RPT-115")
def test_assigned_hours_sorted_descending(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    assign(db, people, "NV020", code="T-A1", hours="5.5", status="ACCEPTED", created_at=utc(10, 2))
    assign(db, people, "NV021", code="T-A2", hours="8", status="IN_PROGRESS", created_at=utc(10, 3))

    rows = get(an, STAFF)["hours_by_technician"]

    assert [(r["employee_name"], r["assigned_hours"]) for r in rows] == [
        ("Võ Minh Quân", 8.0),
        ("Phạm Đức Long", 5.5),
    ]


@pytest.mark.ac("AC-RPT-116")
def test_kpi_completion_uses_last_month_of_period(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    oct_10 = utc(10, 10)
    sale(db, people["NV005"], code="DH-K1", line_total=100_000_000, cost=60_000_000, completed_at=oct_10)
    sale(db, people["NV007"], code="DH-K2", line_total=50_000_000, cost=25_000_000, completed_at=oct_10)
    sale(db, people["NV008"], code="DH-K3", line_total=10_000_000, cost=5_000_000, completed_at=oct_10)
    put_target(db, people["NV005"], "2026-10", 50_000_000)
    put_target(db, people["NV007"], "2026-10", 20_000_000)

    kpi = get(an, STAFF)["kpi_completion"]

    assert kpi["month"] == "2026-10"
    assert [(r["employee_code"], r["achievement_pct"]) for r in kpi["rows"]] == [
        ("NV007", 125.0),
        ("NV005", 80.0),
        ("NV008", None),
    ]
    report = an.get("/api/v1/reports/kpi-sales", params={"month": "2026-10"}).json()["rows"]
    fields = ("employee_id", "employee_code", "employee_name", "net_revenue", "target", "achievement_pct")
    expected = {r["employee_code"]: {f: r[f] for f in fields} for r in report}
    assert {r["employee_code"]: {f: r[f] for f in fields} for r in kpi["rows"]} == expected


@pytest.mark.ac("AC-RPT-117")
def test_default_period_is_last_twelve_months(
    app: FastAPI, clock: FakeClock, people: dict[str, uuid.UUID]
) -> None:
    clock.now = datetime(2026, 11, 4, 2, 0, tzinfo=UTC)
    client = client_as(app, AN)

    res = client.get(RESULTS)

    assert res.status_code == 200, res.text
    data = res.json()
    assert (data["from"], data["to"]) == ("2025-12", "2026-11")
    assert len(data["monthly"]) == 12
    assert data["monthly"][0]["month"] == "2025-12"
    assert data["monthly"][-1]["month"] == "2026-11"


@pytest.mark.ac("AC-RPT-118")
def test_invalid_periods_are_rejected(an: TestClient, people: dict[str, uuid.UUID]) -> None:
    for url in (RESULTS, SALES, STAFF):
        reversed_range = problem(
            an.get(url, params={"from": "2026-10", "to": "2026-09"}), 422, "INVALID_RANGE"
        )
        assert reversed_range["detail"] == "Tháng bắt đầu phải trước hoặc bằng tháng kết thúc."
        too_long = problem(an.get(url, params={"from": "2024-01", "to": "2026-10"}), 422, "RANGE_TOO_LONG")
        assert too_long["detail"] == "Chỉ xem tối đa 24 tháng."
        problem(an.get(url, params={"from": "2026-13"}), 422, "VALIDATION_ERROR")
    # exactly 24 months is allowed
    assert an.get(RESULTS, params={"from": "2024-11", "to": "2026-10"}).status_code == 200


@pytest.mark.ac("AC-RPT-119")
def test_only_manager_can_read(app: FastAPI, people: dict[str, uuid.UUID]) -> None:
    for person in (HOA, NGOC, HUNG, KHANG):
        client = client_as(app, person)
        for url in (RESULTS, SALES, STAFF):
            problem(client.get(url, params=PERIOD), 403, "FORBIDDEN")
    anonymous = TestClient(app, raise_server_exceptions=False)
    for url in (RESULTS, SALES, STAFF):
        assert anonymous.get(url, params=PERIOD).status_code == 401


@pytest.mark.ac("AC-RPT-120")
def test_empty_period(an: TestClient, people: dict[str, uuid.UUID]) -> None:
    results = get(an, RESULTS)
    assert results["monthly"] == [
        {"month": "2026-09", "revenue": 0, "profit": 0},
        {"month": "2026-10", "revenue": 0, "profit": 0},
    ]
    assert results["customers_monthly"] == [
        {"month": "2026-09", "new_count": 0, "returning_count": 0},
        {"month": "2026-10", "new_count": 0, "returning_count": 0},
    ]
    assert results["composition"] == {"by_group": [], "by_item": [], "by_customer_type": []}
    sales = get(an, SALES)
    assert (sales["pareto"], sales["top_selling"], sales["slow_selling"]) == ([], [], [])
    staff = get(an, STAFF)
    assert staff["hours_by_technician"] == []
    assert staff["kpi_completion"] == {"month": "2026-10", "rows": []}


@pytest.mark.ac("AC-RPT-122")
def test_profit_uses_snapshot_and_reads_do_not_write(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    ids = seed_sample(db, people)
    db.execute(text("UPDATE products SET cost_price = 3000000 WHERE id = :id"), {"id": ids["canon"]})
    snapshot = "SELECT id, cost_price_snapshot, unit_price, line_total, quantity FROM order_lines ORDER BY id"
    before = db.execute(text(snapshot)).all()

    data = get(an, RESULTS)
    get(an, SALES)
    get(an, STAFF)

    assert data["monthly"][0]["profit"] == 1_400_000
    assert db.execute(text(snapshot)).all() == before
