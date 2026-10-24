"""M16-06: báo cáo doanh thu theo khách hàng tính theo dòng hàng (AC-RPT-065…071)."""

import csv
import io
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
    credited_employee_id: uuid.UUID | None = None,
    name_snapshot: str = "Hàng hoá",
) -> uuid.UUID:
    line_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO order_lines (id, order_id, position, item_type, name_snapshot, unit_snapshot,"
            " vat_rate, quantity, unit_price, line_gross, line_vat, line_total, cost_price_snapshot,"
            " credited_employee_id)"
            " VALUES (:id, :order_id, :position, 'PRODUCT', :name_snapshot, 'CAI',"
            " 0, :quantity, :unit_price, :line_total, 0, :line_total, :cost, :credited_employee_id)"
        ),
        {
            "id": line_id,
            "order_id": order_id,
            "position": position,
            "name_snapshot": name_snapshot,
            "quantity": Decimal(quantity),
            "unit_price": unit_price,
            "line_total": line_total,
            "cost": cost_price_snapshot,
            "credited_employee_id": credited_employee_id,
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
    routes = {(method, path): capability for method, path, capability in declared_routes(app)}
    assert routes[("GET", "/api/v1/reports/revenue-by-customer")] == "report.revenue.read"
    assert routes[("GET", "/api/v1/reports/revenue-by-customer/{customer_id}/lines")] == "report.revenue.read"
    assert routes[("GET", "/api/v1/reports/revenue-by-customer/export")] == "report.revenue.read"


@pytest.mark.ac("AC-RPT-065")
def test_report_groups_by_customer_and_credited_employee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    order_a = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHA",
        total=150_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_a,
        line_total=100_000_000,
        unit_price=100_000_000,
        cost_price_snapshot=60_000_000,
        credited_employee_id=people["NV005"],
    )
    insert_order_line(
        db,
        order_a,
        position=2,
        line_total=50_000_000,
        unit_price=50_000_000,
        cost_price_snapshot=30_000_000,
        credited_employee_id=people["NV019"],
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-customer"))

    rows = {(row["customer_code"], row["seller"]["full_name"]): row for row in data["items"]}
    hoa_row = rows[("KH00001", HOA.full_name)]
    assert (hoa_row["order_count"], hoa_row["subtotal_revenue"], hoa_row["profit"]) == (
        1,
        100_000_000,
        40_000_000,
    )
    minh_row = rows[("KH00001", MINH.full_name)]
    assert (minh_row["order_count"], minh_row["subtotal_revenue"], minh_row["profit"]) == (
        1,
        50_000_000,
        20_000_000,
    )


@pytest.mark.ac("AC-RPT-065")
def test_report_order_count_not_double_counted_for_two_lines_same_employee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    order_a = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DHA",
        total=30_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_a,
        line_total=10_000_000,
        unit_price=10_000_000,
        cost_price_snapshot=5_000_000,
        credited_employee_id=people["NV005"],
    )
    insert_order_line(
        db,
        order_a,
        position=2,
        line_total=20_000_000,
        unit_price=20_000_000,
        cost_price_snapshot=10_000_000,
        credited_employee_id=people["NV005"],
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-customer"))

    rows = {(row["customer_code"], row["seller"]["full_name"]): row for row in data["items"]}
    hoa_row = rows[("KH00001", HOA.full_name)]
    assert hoa_row["order_count"] == 1
    assert hoa_row["subtotal_revenue"] == 30_000_000


@pytest.mark.ac("AC-RPT-066")
def test_report_has_unassigned_bucket_per_customer(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh2 = insert_customer(db, code="KH00002", created_by=people["NV001"])
    order_b = insert_order(
        db,
        customer_id=kh2,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHB",
        total=20_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_b,
        line_total=20_000_000,
        unit_price=20_000_000,
        cost_price_snapshot=10_000_000,
        credited_employee_id=None,
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-customer"))

    rows = [row for row in data["items"] if row["customer_code"] == "KH00002"]
    assert len(rows) == 1
    assert rows[0]["unassigned"] is True
    assert rows[0]["seller"] is None
    assert rows[0]["subtotal_revenue"] == 20_000_000


@pytest.mark.ac("AC-RPT-067")
def test_sale_own_scope_sees_only_lines_credited_to_self(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh3 = insert_customer(db, code="KH00003", created_by=people["NV001"])
    order_c = insert_order(
        db,
        customer_id=kh3,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHC",
        total=10_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_c,
        line_total=10_000_000,
        unit_price=10_000_000,
        cost_price_snapshot=5_000_000,
        credited_employee_id=people["NV019"],
    )

    hoa = client_as(app, HOA)
    data = body(hoa.get("/api/v1/reports/revenue-by-customer"))

    assert data["items"] == []


@pytest.mark.ac("AC-RPT-068")
def test_lines_drilldown_by_seller_id(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    order_a = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHA",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_a,
        line_total=1_000_000,
        unit_price=1_000_000,
        cost_price_snapshot=500_000,
        credited_employee_id=people["NV005"],
        name_snapshot="Camera IMOU 2MP",
    )
    insert_order_line(
        db,
        order_a,
        position=2,
        line_total=2_000_000,
        unit_price=2_000_000,
        cost_price_snapshot=1_000_000,
        credited_employee_id=people["NV019"],
    )

    an = client_as(app, AN)
    res = an.get(
        f"/api/v1/reports/revenue-by-customer/{kh1}/lines", params={"seller_id": str(people["NV005"])}
    )
    assert res.status_code == 200, res.text
    lines = res.json()
    assert len(lines) == 1
    assert lines[0]["order_code"] == "DHA"
    assert lines[0]["line_name"] == "Camera IMOU 2MP"
    assert lines[0]["line_total"] == 1_000_000
    assert lines[0]["profit"] == 500_000


@pytest.mark.ac("AC-RPT-069")
def test_lines_drilldown_unassigned_for_customer(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh2 = insert_customer(db, code="KH00002", created_by=people["NV001"])
    order_b = insert_order(
        db,
        customer_id=kh2,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHB",
        total=3_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_b,
        line_total=3_000_000,
        unit_price=3_000_000,
        cost_price_snapshot=1_000_000,
        credited_employee_id=None,
    )

    an = client_as(app, AN)
    res = an.get(f"/api/v1/reports/revenue-by-customer/{kh2}/lines", params={"unassigned": "true"})
    assert res.status_code == 200, res.text
    lines = res.json()
    assert len(lines) == 1
    assert lines[0]["order_code"] == "DHB"


@pytest.mark.ac("AC-RPT-070")
def test_lines_drilldown_rejects_both_seller_id_and_unassigned(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])

    an = client_as(app, AN)
    problem(
        an.get(
            f"/api/v1/reports/revenue-by-customer/{kh1}/lines",
            params={"seller_id": str(people["NV005"]), "unassigned": "true"},
        ),
        422,
        "VALIDATION_ERROR",
    )


def test_not_completed_excludes_cancelled_and_draft(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh3 = insert_customer(db, code="KH00003", created_by=people["NV001"])
    pending = insert_order(
        db,
        customer_id=kh3,
        created_by=people["NV005"],
        status="PENDING_DISPATCH",
        code="DH06",
        total=1_000_000,
        created_at=CREATED_IN_RANGE,
    )
    insert_order_line(
        db,
        pending,
        line_total=1_000_000,
        unit_price=1_000_000,
        cost_price_snapshot=None,
        credited_employee_id=people["NV005"],
    )
    cancelled = insert_order(
        db,
        customer_id=kh3,
        created_by=people["NV005"],
        status="CANCELLED",
        code="DH07",
        total=2_000_000,
        created_at=CREATED_IN_RANGE,
    )
    insert_order_line(
        db,
        cancelled,
        line_total=2_000_000,
        unit_price=2_000_000,
        cost_price_snapshot=None,
        credited_employee_id=people["NV005"],
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-customer", params={"status": "NOT_COMPLETED"}))

    assert len(data["items"]) == 1
    assert data["items"][0]["customer_code"] == "KH00003"
    assert data["items"][0]["order_count"] == 1


def test_technician_without_capability_is_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    duc = client_as(app, DUC)
    problem(duc.get("/api/v1/reports/revenue-by-customer"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-RPT-065")
def test_export_returns_csv_with_bom_and_unassigned_row(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    kh1 = insert_customer(db, code="KH00001", created_by=people["NV001"])
    order_a = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH17",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_a,
        line_total=1_000_000,
        unit_price=1_000_000,
        cost_price_snapshot=500_000,
        credited_employee_id=people["NV005"],
    )
    order_b = insert_order(
        db,
        customer_id=kh1,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH18",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_b,
        line_total=2_000_000,
        unit_price=2_000_000,
        cost_price_snapshot=1_000_000,
        credited_employee_id=None,
    )

    params = {"from": "2026-09-01", "to": "2026-09-26"}
    an = client_as(app, AN)
    json_res = an.get("/api/v1/reports/revenue-by-customer", params=params)
    assert json_res.status_code == 200, json_res.text
    report_items = json_res.json()["items"]
    assert len(report_items) == 2

    res = an.get("/api/v1/reports/revenue-by-customer/export", params=params)

    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert "doanh-thu-theo-khach-hang-2026-09-01_2026-09-26.csv" in res.headers["content-disposition"]
    assert res.content.startswith(b"\xef\xbb\xbf")
    text_content = res.content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text_content)))
    assert rows[0] == [
        "Mã khách hàng",
        "Tên khách hàng",
        "Người liên hệ",
        "Số điện thoại",
        "Mã người bán",
        "Tên người bán",
        "Số đơn",
        "Doanh thu",
        "Lợi nhuận",
    ]
    assert len(rows) - 1 == len(report_items)
    unassigned_csv_row = next(row for row in rows[1:] if row[4] == "")
    assert unassigned_csv_row[5] == "(Chưa gán)"


@pytest.mark.ac("AC-RPT-067")
def test_drilldown_404_when_outside_scope(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    kh4 = insert_customer(db, code="KH00004", created_by=people["NV001"])
    order_d = insert_order(
        db,
        customer_id=kh4,
        created_by=people["NV019"],
        status="COMPLETED",
        code="DH18",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_d,
        line_total=1_000_000,
        unit_price=1_000_000,
        cost_price_snapshot=None,
        credited_employee_id=people["NV019"],
    )

    hoa = client_as(app, HOA)
    problem(
        hoa.get(f"/api/v1/reports/revenue-by-customer/{kh4}/lines?seller_id={people['NV019']}"),
        404,
        "NOT_FOUND",
    )
