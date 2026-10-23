"""M15-10a: báo cáo doanh thu theo nhân viên (API) (AC-RPT-020…022, 024…025, 046…049)."""

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, seed
from tests.integration.test_dispatch_api import HOA, client_as, problem
from tests.integration.test_revenue_report_api import DUC, LAN, insert_order, insert_order_line

MINH = Person("minh.sale@smyou.vn", "Minh@SmYou26", ("SALE",), "NV019", "Nguyễn Thành Minh", "SALES")

COMPLETED_IN_RANGE = datetime(2026, 9, 10, 3, 0, tzinfo=UTC)  # 2026-09-10 10:00 giờ VN
CREATED_IN_RANGE = datetime(2026, 9, 12, 3, 0, tzinfo=UTC)


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, MINH, LAN, DUC, KHOA)}


def body(res: Any) -> dict[str, Any]:
    assert res.status_code == 200, res.text
    result: dict[str, Any] = res.json()
    return result


def test_revenue_by_employee_capability_declared() -> None:
    from app.main import create_app

    app = create_app()
    routes = {(method, path): capability for method, path, capability in declared_routes(app)}
    assert routes[("GET", "/api/v1/reports/revenue-by-employee")] == "report.revenue.read"
    assert (
        routes[("GET", "/api/v1/reports/revenue-by-employee/{employee_id}/orders")] == "report.revenue.read"
    )
    assert routes[("GET", "/api/v1/reports/revenue-by-employee/export")] == "report.revenue.read"


@pytest.mark.ac("AC-RPT-020")
def test_report_groups_by_employee_with_defaults(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    for i in range(4):
        order = insert_order(
            db,
            customer_id=None,
            created_by=people["NV005"],
            status="COMPLETED",
            code=f"DH{i + 1:02d}",
            total=20_000_000,
            completed_at=COMPLETED_IN_RANGE,
        )
        insert_order_line(
            db, order, line_total=20_000_000, unit_price=20_000_000, cost_price_snapshot=15_000_000
        )
    order_an = insert_order(
        db,
        customer_id=None,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH99",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(db, order_an, line_total=1_000_000, unit_price=1_000_000, cost_price_snapshot=500_000)

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-employee"))

    assert data["from"] == "2026-09-01"
    assert data["to"] == "2026-09-26"
    assert data["total"] == 2
    codes = [row["employee_code"] for row in data["items"]]
    assert codes == sorted(codes)
    rows = {row["employee_code"]: row for row in data["items"]}
    hoa_row = rows["NV005"]
    assert (hoa_row["order_count"], hoa_row["subtotal_revenue"], hoa_row["profit"]) == (
        4,
        80_000_000,
        20_000_000,
    )
    assert rows["NV001"]["order_count"] == 1


@pytest.mark.ac("AC-RPT-021")
def test_report_filters_by_employee_id(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH01",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH02",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-employee", params={"employee_id": str(people["NV005"])}))

    assert [row["employee_code"] for row in data["items"]] == ["NV005"]


@pytest.mark.ac("AC-RPT-022")
def test_customer_care_appears_as_employee_row(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    for i in range(2):
        insert_order(
            db,
            customer_id=None,
            created_by=people["NV020"],
            status="COMPLETED",
            code=f"DHL{i + 1}",
            total=1_000_000,
            completed_at=COMPLETED_IN_RANGE,
        )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-employee"))

    rows = {row["employee_code"]: row for row in data["items"]}
    assert rows["NV020"]["order_count"] == 2


@pytest.mark.ac("AC-RPT-046")
def test_sale_sees_only_own_row(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH01",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH02",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    hoa = client_as(app, HOA)
    data = body(hoa.get("/api/v1/reports/revenue-by-employee"))

    assert [row["employee_code"] for row in data["items"]] == ["NV005"]


@pytest.mark.ac("AC-RPT-047")
def test_drilldown_404_when_employee_outside_scope(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH01",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    hoa = client_as(app, HOA)
    problem(hoa.get(f"/api/v1/reports/revenue-by-employee/{people['NV001']}/orders"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-RPT-048")
def test_not_completed_excludes_cancelled_and_draft(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="PENDING_DISPATCH",
        code="DH01",
        total=1_000_000,
        created_at=CREATED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="CANCELLED",
        code="DH02",
        total=2_000_000,
        created_at=CREATED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="DRAFT",
        code="DH03",
        total=3_000_000,
        created_at=CREATED_IN_RANGE,
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-employee", params={"status": "NOT_COMPLETED"}))

    rows = {row["employee_code"]: row for row in data["items"]}
    assert rows["NV005"]["order_count"] == 1


@pytest.mark.ac("AC-RPT-049")
def test_technician_without_capability_is_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    duc = client_as(app, DUC)
    problem(duc.get("/api/v1/reports/revenue-by-employee"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-RPT-024")
def test_drilldown_orders_for_one_employee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH01",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH02",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DH03",
        total=9_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    an = client_as(app, AN)
    res = an.get(f"/api/v1/reports/revenue-by-employee/{people['NV005']}/orders")
    assert res.status_code == 200, res.text
    codes = {order["code"] for order in res.json()}
    assert codes == {"DH01", "DH02"}


@pytest.mark.ac("AC-RPT-025")
def test_export_returns_csv_with_bom_and_filename(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DH01",
        total=1_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )

    params = {"from": "2026-09-01", "to": "2026-09-26"}
    an = client_as(app, AN)
    json_res = an.get("/api/v1/reports/revenue-by-employee", params=params)
    assert json_res.status_code == 200, json_res.text
    report_items = json_res.json()["items"]
    assert report_items

    res = an.get("/api/v1/reports/revenue-by-employee/export", params=params)

    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert "doanh-thu-theo-nhan-vien-2026-09-01_2026-09-26.csv" in res.headers["content-disposition"]
    assert res.content.startswith(b"\xef\xbb\xbf")
    text_content = res.content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text_content)))
    assert rows[0] == [
        "Mã nhân viên",
        "Tên nhân viên",
        "Số đơn",
        "Doanh thu",
        "Lợi nhuận",
    ]
    assert len(rows) - 1 == len(report_items)
    for csv_row, item in zip(rows[1:], report_items, strict=True):
        assert csv_row == [
            item["employee_code"],
            item["employee_name"],
            str(item["order_count"]),
            str(item["subtotal_revenue"]),
            "" if item["profit"] is None else str(item["profit"]),
        ]
