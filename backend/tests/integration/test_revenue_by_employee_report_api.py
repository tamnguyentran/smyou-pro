"""M16-05: báo cáo doanh thu theo nhân viên tính theo dòng hàng (AC-RPT-056…064)."""

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
    assert routes[("GET", "/api/v1/reports/revenue-by-employee/lines")] == "report.revenue.read"
    assert routes[("GET", "/api/v1/reports/revenue-by-employee/export")] == "report.revenue.read"


@pytest.mark.ac("AC-RPT-056")
def test_report_groups_by_credited_employee_across_orders(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_a = insert_order(
        db,
        customer_id=None,
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
        credited_employee_id=people["NV020"],
    )
    order_b = insert_order(
        db,
        customer_id=None,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DHB",
        total=30_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_b,
        line_total=30_000_000,
        unit_price=30_000_000,
        cost_price_snapshot=20_000_000,
        credited_employee_id=people["NV005"],
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-employee"))

    rows = {row["employee_code"]: row for row in data["items"]}
    assert (rows["NV005"]["order_count"], rows["NV005"]["subtotal_revenue"], rows["NV005"]["profit"]) == (
        2,
        130_000_000,
        50_000_000,
    )
    assert (rows["NV020"]["order_count"], rows["NV020"]["subtotal_revenue"], rows["NV020"]["profit"]) == (
        1,
        50_000_000,
        20_000_000,
    )


@pytest.mark.ac("AC-RPT-056")
def test_report_order_count_not_double_counted_for_two_lines_same_employee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_a = insert_order(
        db,
        customer_id=None,
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
    data = body(an.get("/api/v1/reports/revenue-by-employee"))

    rows = {row["employee_code"]: row for row in data["items"]}
    assert rows["NV005"]["order_count"] == 1
    assert rows["NV005"]["subtotal_revenue"] == 30_000_000


@pytest.mark.ac("AC-RPT-057")
def test_report_has_unassigned_bucket_for_lines_without_employee(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_c = insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHC",
        total=20_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_c,
        line_total=20_000_000,
        unit_price=20_000_000,
        cost_price_snapshot=10_000_000,
        credited_employee_id=None,
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-employee"))

    unassigned_rows = [row for row in data["items"] if row["unassigned"]]
    assert len(unassigned_rows) == 1
    row = unassigned_rows[0]
    assert row["employee_id"] is None
    assert row["employee_code"] is None
    assert row["subtotal_revenue"] == 20_000_000


@pytest.mark.ac("AC-RPT-058")
def test_sale_own_scope_sees_only_lines_credited_to_self(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_d = insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHD",
        total=10_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_d,
        line_total=10_000_000,
        unit_price=10_000_000,
        cost_price_snapshot=5_000_000,
        credited_employee_id=people["NV020"],
    )

    hoa = client_as(app, HOA)
    data = body(hoa.get("/api/v1/reports/revenue-by-employee"))

    assert data["items"] == []


@pytest.mark.ac("AC-RPT-059")
def test_profit_null_when_line_missing_cost_snapshot(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_e = insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHE",
        total=5_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_e,
        line_total=5_000_000,
        unit_price=5_000_000,
        cost_price_snapshot=None,
        credited_employee_id=people["NV005"],
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-employee"))

    rows = {row["employee_code"]: row for row in data["items"]}
    assert rows["NV005"]["profit"] is None


@pytest.mark.ac("AC-RPT-060")
def test_lines_drilldown_by_employee_id(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_a = insert_order(
        db,
        customer_id=None,
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
    order_b = insert_order(
        db,
        customer_id=None,
        created_by=people["NV001"],
        status="COMPLETED",
        code="DHB",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_b,
        line_total=2_000_000,
        unit_price=2_000_000,
        cost_price_snapshot=1_000_000,
        credited_employee_id=people["NV020"],
    )

    an = client_as(app, AN)
    res = an.get("/api/v1/reports/revenue-by-employee/lines", params={"employee_id": str(people["NV005"])})
    assert res.status_code == 200, res.text
    lines = res.json()
    assert len(lines) == 1
    assert lines[0]["order_code"] == "DHA"
    assert lines[0]["line_name"] == "Camera IMOU 2MP"
    assert lines[0]["line_total"] == 1_000_000
    assert lines[0]["profit"] == 500_000


@pytest.mark.ac("AC-RPT-061")
def test_lines_drilldown_unassigned(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_c = insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHC",
        total=3_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_c,
        line_total=3_000_000,
        unit_price=3_000_000,
        cost_price_snapshot=1_000_000,
        credited_employee_id=None,
    )

    an = client_as(app, AN)
    res = an.get("/api/v1/reports/revenue-by-employee/lines", params={"unassigned": "true"})
    assert res.status_code == 200, res.text
    lines = res.json()
    assert len(lines) == 1
    assert lines[0]["order_code"] == "DHC"


@pytest.mark.ac("AC-RPT-062")
def test_lines_drilldown_requires_exactly_one_selector(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    problem(an.get("/api/v1/reports/revenue-by-employee/lines"), 422, "VALIDATION_ERROR")
    problem(
        an.get(
            "/api/v1/reports/revenue-by-employee/lines",
            params={"employee_id": str(people["NV005"]), "unassigned": "true"},
        ),
        422,
        "VALIDATION_ERROR",
    )


def test_not_completed_excludes_cancelled_and_draft(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    pending = insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="PENDING_DISPATCH",
        code="DH01",
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
        customer_id=None,
        created_by=people["NV005"],
        status="CANCELLED",
        code="DH02",
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
    draft = insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="DRAFT",
        code="DH03",
        total=3_000_000,
        created_at=CREATED_IN_RANGE,
    )
    insert_order_line(
        db,
        draft,
        line_total=3_000_000,
        unit_price=3_000_000,
        cost_price_snapshot=None,
        credited_employee_id=people["NV005"],
    )

    an = client_as(app, AN)
    data = body(an.get("/api/v1/reports/revenue-by-employee", params={"status": "NOT_COMPLETED"}))

    rows = {row["employee_code"]: row for row in data["items"]}
    assert rows["NV005"]["order_count"] == 1


def test_technician_without_capability_is_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    duc = client_as(app, DUC)
    problem(duc.get("/api/v1/reports/revenue-by-employee"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-RPT-056")
def test_export_returns_csv_with_bom_and_unassigned_row(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_a = insert_order(
        db,
        customer_id=None,
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
    )
    order_c = insert_order(
        db,
        customer_id=None,
        created_by=people["NV005"],
        status="COMPLETED",
        code="DHC",
        total=2_000_000,
        completed_at=COMPLETED_IN_RANGE,
    )
    insert_order_line(
        db,
        order_c,
        line_total=2_000_000,
        unit_price=2_000_000,
        cost_price_snapshot=1_000_000,
        credited_employee_id=None,
    )

    params = {"from": "2026-09-01", "to": "2026-09-26"}
    an = client_as(app, AN)
    json_res = an.get("/api/v1/reports/revenue-by-employee", params=params)
    assert json_res.status_code == 200, json_res.text
    report_items = json_res.json()["items"]
    assert len(report_items) == 2

    res = an.get("/api/v1/reports/revenue-by-employee/export", params=params)

    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert "doanh-thu-theo-nhan-vien-2026-09-01_2026-09-26.csv" in res.headers["content-disposition"]
    assert res.content.startswith(b"\xef\xbb\xbf")
    text_content = res.content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text_content)))
    assert rows[0] == ["Mã nhân viên", "Tên nhân viên", "Số đơn", "Doanh thu", "Lợi nhuận"]
    assert len(rows) - 1 == len(report_items)
    unassigned_csv_row = next(row for row in rows[1:] if row[0] == "")
    assert unassigned_csv_row[1] == "(Chưa gán)"
