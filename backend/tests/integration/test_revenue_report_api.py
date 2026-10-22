"""M15-09a: báo cáo doanh thu theo khách hàng (API) (AC-RPT-001…008, 043…045)."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, seed
from tests.integration.test_dispatch_api import HOA, client_as, problem

MINH = Person("minh.sale@smyou.vn", "Minh@SmYou26", ("SALE",), "NV019", "Nguyễn Thành Minh", "SALES")
LAN = Person("lan.csk@smyou.vn", "Lan@SmYou26", ("CUSTOMER_CARE",), "NV020", "Đỗ Thị Lan", "SALES")
DUC = Person(
    "duc.technician@smyou.vn", "Duc@SmYou26", ("TECHNICIAN",), "NV021", "Nguyễn Văn Đức", "TECHNICAL"
)

COMPLETED_IN_RANGE = datetime(2026, 9, 10, 3, 0, tzinfo=UTC)  # 2026-09-10 10:00 giờ VN
CREATED_IN_RANGE = datetime(2026, 9, 12, 3, 0, tzinfo=UTC)


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, MINH, LAN, DUC, KHOA)}


def insert_customer(
    db: Connection, *, code: str, created_by: uuid.UUID, name: str | None = None
) -> uuid.UUID:
    customer_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO customers (id, code, type, name, contact_person, phone, created_by, version)"
            " VALUES (:id, :code, 'COMPANY', :name, 'Người liên hệ', '0918000000', :created_by, 1)"
        ),
        {"id": customer_id, "code": code, "name": name or f"Khách hàng {code}", "created_by": created_by},
    )
    return customer_id


def insert_order(
    db: Connection,
    *,
    customer_id: uuid.UUID | None,
    created_by: uuid.UUID,
    status: str,
    code: str,
    total: int = 0,
    completed_at: datetime | None = None,
    created_at: datetime | None = None,
) -> uuid.UUID:
    order_id = uuid.uuid4()
    columns = ["id", "code", "status", "created_by", "customer_id", "total", "version"]
    params: dict[str, object] = {
        "id": order_id,
        "code": code,
        "status": status,
        "created_by": created_by,
        "customer_id": customer_id,
        "total": total,
        "version": 1,
    }
    if completed_at is not None:
        columns.append("completed_at")
        params["completed_at"] = completed_at
    if created_at is not None:
        columns.append("created_at")
        params["created_at"] = created_at
    placeholders = ", ".join(f":{c}" for c in columns)
    query = f"INSERT INTO orders ({', '.join(columns)}) VALUES ({placeholders})"  # noqa: S608  # literal column names from the fixed set above
    db.execute(text(query), params)
    return order_id


def insert_order_line(
    db: Connection,
    order_id: uuid.UUID,
    *,
    position: int = 1,
    quantity: str = "1",
    unit_price: int = 0,
    line_total: int = 0,
    cost_price_snapshot: int | None,
) -> uuid.UUID:
    line_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO order_lines (id, order_id, position, item_type, name_snapshot, unit_snapshot,"
            " vat_rate, quantity, unit_price, line_gross, line_vat, line_total, cost_price_snapshot)"
            " VALUES (:id, :order_id, :position, 'PRODUCT', 'Hàng hoá', 'CAI',"
            " 0, :quantity, :unit_price, :line_total, 0, :line_total, :cost)"
        ),
        {
            "id": line_id,
            "order_id": order_id,
            "position": position,
            "quantity": Decimal(quantity),
            "unit_price": unit_price,
            "line_total": line_total,
            "cost": cost_price_snapshot,
        },
    )
    return line_id


def body(res: Any) -> dict[str, Any]:
    assert res.status_code == 200, res.text
    result: dict[str, Any] = res.json()
    return result


def test_revenue_report_capability_declared() -> None:
    from app.main import create_app

    app = create_app()
    routes = dict(((method, path), capability) for method, path, capability in declared_routes(app))
    assert routes[("GET", "/api/v1/reports/revenue-by-customer")] == "report.revenue.read"
    assert (
        routes[("GET", "/api/v1/reports/revenue-by-customer/{customer_id}/orders")] == "report.revenue.read"
    )
    assert routes[("GET", "/api/v1/reports/revenue-by-customer/export")] == "report.revenue.read"


@pytest.mark.ac("AC-RPT-001")
def test_report_groups_by_customer_and_seller_with_defaults(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    kh2 = insert_customer(db, code="KH00002", created_by=people["NV001"])

    o1 = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH01",
        total=20_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(db, o1, line_total=20_000_000, unit_price=20_000_000, cost_price_snapshot=15_000_000)
    o2 = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH02",
        total=10_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(db, o2, line_total=10_000_000, unit_price=10_000_000, cost_price_snapshot=7_000_000)
    o3 = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV019"],
        status="COMPLETED",
        code="DH03",
        total=20_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(db, o3, line_total=20_000_000, unit_price=20_000_000, cost_price_snapshot=16_000_000)
    o4 = insert_order(
        db,
        customer_id=kh2,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH04",
        total=5_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(db, o4, line_total=5_000_000, unit_price=5_000_000, cost_price_snapshot=3_000_000)

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-customer"))

    assert data["from"] == "2026-09-01"
    assert data["to"] == "2026-09-26"
    assert data["total"] == 3
    items = {(row["customer_code"], row["seller"]["full_name"]): row for row in data["items"]}
    row1 = items[("KH00001", HOA.full_name)]
    assert (row1["order_count"], row1["subtotal_revenue"], row1["profit"]) == (2, 30_000_000, 8_000_000)
    row2 = items[("KH00001", MINH.full_name)]
    assert (row2["order_count"], row2["subtotal_revenue"], row2["profit"]) == (1, 20_000_000, 4_000_000)
    row3 = items[("KH00002", HOA.full_name)]
    assert (row3["order_count"], row3["subtotal_revenue"], row3["profit"]) == (1, 5_000_000, 2_000_000)
    codes = [row["customer_code"] for row in data["items"]]
    assert codes == sorted(codes)


@pytest.mark.ac("AC-RPT-002")
def test_report_profit_null_when_cost_price_snapshot_missing(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    order = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH05",
        total=10_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(db, order, line_total=10_000_000, unit_price=10_000_000, cost_price_snapshot=None)

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-customer"))

    assert data["items"][0]["profit"] is None


@pytest.mark.ac("AC-RPT-003")
def test_not_completed_excludes_cancelled_and_draft(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh3 = insert_customer(db, code="KH00003", created_by=people["NV001"])
    insert_order(
        db,
        customer_id=kh3,
        created_by=people["NV005"],
        status="PENDING_DISPATCH",
        code="DH06",
        total=1_000_000,
        created_at=CREATED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=kh3,
        created_by=people["NV005"],
        status="CANCELLED",
        code="DH07",
        total=2_000_000,
        created_at=CREATED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=kh3,
        created_by=people["NV005"],
        status="DRAFT",
        code="DH08",
        total=3_000_000,
        created_at=CREATED_IN_RANGE,
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-customer", params={"status": "NOT_COMPLETED"}))

    assert len(data["items"]) == 1
    assert data["items"][0]["customer_code"] == "KH00003"
    assert data["items"][0]["order_count"] == 1


@pytest.mark.ac("AC-RPT-004")
def test_report_filters_by_customer_id(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    kh2 = insert_customer(db, code="KH00002", created_by=people["NV001"])
    insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH09",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=kh2,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH10",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-customer", params={"customer_id": str(kh1)}))

    assert [row["customer_code"] for row in data["items"]] == ["KH00001"]


@pytest.mark.ac("AC-RPT-005")
def test_sale_sees_only_own_rows(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    kh2 = insert_customer(db, code="KH00002", created_by=people["NV001"])
    insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH11",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV019"],
        status="COMPLETED",
        code="DH12",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=kh2,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH13",
        total=3_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    hoa = client_as(app, HOA)
    data = body(hoa.get("/api/v1/reports/revenue-by-customer"))

    pairs = {(row["customer_code"], row["seller"]["full_name"]) for row in data["items"]}
    assert pairs == {("KH00001", HOA.full_name), ("KH00002", HOA.full_name)}


@pytest.mark.ac("AC-RPT-006")
def test_technician_without_capability_is_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    duc = client_as(app, DUC)
    problem(duc.get("/api/v1/reports/revenue-by-customer"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-RPT-007")
def test_drilldown_orders_for_one_seller(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH14",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH15",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV019"],
        status="COMPLETED",
        code="DH16",
        total=9_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    an = client_as(app, AN)
    res = an.get(
        f"/api/v1/reports/revenue-by-customer/{kh1}/orders", params={"seller_id": str(people["NV005"])}
    )
    assert res.status_code == 200, res.text
    orders = res.json()
    assert {order["code"] for order in orders} == {"DH14", "DH15"}


@pytest.mark.ac("AC-RPT-008")
def test_export_returns_csv_with_bom_and_filename(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH17",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    an = client_as(app, AN)
    res = an.get(
        "/api/v1/reports/revenue-by-customer/export", params={"from": "2026-09-01", "to": "2026-09-26"}
    )

    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert "doanh-thu-theo-khach-hang-2026-09-01_2026-09-26.csv" in res.headers["content-disposition"]
    assert res.content.startswith(b"\xef\xbb\xbf")
    text_content = res.content.decode("utf-8-sig")
    assert "KH00001" in text_content


@pytest.mark.ac("AC-RPT-043")
def test_drilldown_404_when_customer_outside_sale_scope(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh4 = insert_customer(db, code="KH00004", created_by=people["NV001"])
    insert_order(
        db,
        customer_id=kh4,
        created_by=people["NV019"],
        status="COMPLETED",
        code="DH18",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    hoa = client_as(app, HOA)
    problem(hoa.get(f"/api/v1/reports/revenue-by-customer/{kh4}/orders"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-RPT-044")
def test_customer_care_scope_ignores_customers_created_by(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh5 = insert_customer(db, code="KH00005", created_by=people["NV020"])
    insert_order(
        db,
        customer_id=kh5,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH19",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    lan = client_as(app, LAN)
    data = body(lan.get("/api/v1/reports/revenue-by-customer"))

    assert data["items"] == []


@pytest.mark.ac("AC-RPT-045")
def test_customer_care_scope_uses_orders_created_by(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh6 = insert_customer(db, code="KH00006", created_by=people["NV001"])
    insert_order(
        db,
        customer_id=kh6,
        created_by=people["NV020"],
        status="COMPLETED",
        code="DH20",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    lan = client_as(app, LAN)
    data = body(lan.get("/api/v1/reports/revenue-by-customer"))

    assert [row["customer_code"] for row in data["items"]] == ["KH00006"]
