"""M21-02a: "Báo cáo KPI" doanh số theo tháng + KPI của tôi (AC-RPT-072…086)."""

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from app.modules.departments.models import STANDARD_DEPARTMENT_IDS
from tests.integration.conftest import AN, FakeClock, Person, seed
from tests.integration.test_kpi_targets_api import HOA, HUNG, NGOC, TUAN, client_as, put_target
from tests.integration.test_revenue_report_api import insert_order, insert_order_line

KHANG = Person("khang.vo@smyou.vn", "Khang@SmYou26", ("TECHNICIAN",), "NV012", "Võ Minh Khang", "ECONOMIC")

URL = "/api/v1/reports/kpi-sales"
EXPORT_URL = f"{URL}/export"
ME_URL = "/api/v1/me/kpi-sales"
MONTH = "2026-11"
NOV_05 = datetime(2026, 11, 5, 3, 0, tzinfo=UTC)
NOV_20 = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, NGOC, HUNG, KHANG)}


@pytest.fixture
def an(app: FastAPI, people: dict[str, uuid.UUID]) -> TestClient:
    return client_as(app, AN)


def sale(
    db: Connection,
    employee_id: uuid.UUID,
    *,
    code: str,
    line_total: int,
    cost: int | None,
    completed_at: datetime | None = NOV_05,
    status: str = "COMPLETED",
    division_id: uuid.UUID | None = None,
) -> uuid.UUID:
    order_id = insert_order(
        db,
        customer_id=None,
        created_by=employee_id,
        status=status,
        code=code,
        total=line_total,
        completed_at=completed_at,
    )
    if division_id is not None:
        db.execute(
            text("UPDATE orders SET division_id = :d WHERE id = :id"), {"d": division_id, "id": order_id}
        )
    insert_order_line(
        db,
        order_id,
        line_total=line_total,
        unit_price=line_total,
        cost_price_snapshot=cost,
        credited_employee_id=employee_id,
    )
    return order_id


def seed_ac072(db: Connection, people: dict[str, uuid.UUID]) -> tuple[uuid.UUID, uuid.UUID]:
    order_a = sale(
        db, people["NV005"], code="DHA", line_total=100_000_000, cost=80_000_000, completed_at=NOV_05
    )
    order_b = sale(
        db, people["NV005"], code="DHB", line_total=30_000_000, cost=25_000_000, completed_at=NOV_20
    )
    put_target(db, people["NV005"], MONTH, 20_000_000)
    return order_a, order_b


def insert_group(db: Connection, name: str) -> uuid.UUID:
    group_id = uuid.uuid4()
    name = f"{name} {group_id.hex[:6]}"  # migrations already seed the real group names
    db.execute(
        text("INSERT INTO product_service_groups (id, name) VALUES (:id, :n)"), {"id": group_id, "n": name}
    )
    return group_id


def report(client: TestClient, **params: str) -> dict[str, Any]:
    res = client.get(URL, params={"month": MONTH, **params})
    assert res.status_code == 200, res.text
    result: dict[str, Any] = res.json()
    return result


def by_code(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {r["employee_code"]: r for r in data["rows"]}


def figures(row: dict[str, Any]) -> tuple[Any, ...]:
    return (row["total_sales"], row["net_revenue"], row["target"], row["achievement_pct"])


def test_kpi_sales_capabilities_declared() -> None:
    from app.main import create_app

    routes = {(m, p): c for m, p, c in declared_routes(create_app())}
    assert routes[("GET", URL)] == "report.kpi_sales.read"
    assert routes[("GET", EXPORT_URL)] == "report.kpi_sales.read"
    assert routes[("GET", ME_URL)] == "profile.manage"


@pytest.mark.ac("AC-RPT-072")
def test_report_sums_completed_lines_against_target(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_ac072(db, people)

    data = report(an)

    assert data["month"] == MONTH
    assert len(data["rows"]) == 1
    row = data["rows"][0]
    assert row["stt"] == 1
    assert row["employee_id"] == str(people["NV005"])
    assert (row["employee_code"], row["employee_name"], row["department_name"]) == (
        "NV005",
        HOA.full_name,
        "Phát Triển Kinh Tế",
    )
    assert figures(row) == (130_000_000, 25_000_000, 20_000_000, 125.0)


@pytest.mark.ac("AC-RPT-072")
def test_rows_sorted_by_code_with_stt(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    put_target(db, people["NV008"], MONTH, 1_000_000)
    put_target(db, people["NV005"], MONTH, 1_000_000)
    put_target(db, people["NV007"], MONTH, 1_000_000)

    data = report(an)

    assert [(r["stt"], r["employee_code"]) for r in data["rows"]] == [
        (1, "NV005"),
        (2, "NV007"),
        (3, "NV008"),
    ]


@pytest.mark.ac("AC-RPT-073")
def test_month_boundary_uses_vietnam_time(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    sale(
        db,
        people["NV005"],
        code="DHC",
        line_total=10_000_000,
        cost=1,
        completed_at=datetime(2026, 10, 31, 16, 30, tzinfo=UTC),
    )
    sale(
        db,
        people["NV005"],
        code="DHD",
        line_total=7_000_000,
        cost=1,
        completed_at=datetime(2026, 10, 31, 17, 10, tzinfo=UTC),
    )

    assert by_code(report(an))["NV005"]["total_sales"] == 7_000_000
    assert by_code(report(an, month="2026-10"))["NV005"]["total_sales"] == 10_000_000


@pytest.mark.ac("AC-RPT-073")
def test_month_upper_boundary_uses_vietnam_time(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    sale(
        db,
        people["NV005"],
        code="DHE",
        line_total=4_000_000,
        cost=1,
        completed_at=datetime(2026, 11, 30, 16, 59, tzinfo=UTC),
    )
    sale(
        db,
        people["NV005"],
        code="DHF",
        line_total=9_000_000,
        cost=1,
        completed_at=datetime(2026, 11, 30, 17, 0, tzinfo=UTC),
    )

    assert by_code(report(an))["NV005"]["total_sales"] == 4_000_000
    assert by_code(report(an, month="2026-12"))["NV005"]["total_sales"] == 9_000_000


@pytest.mark.ac("AC-RPT-074")
def test_only_completed_orders_count(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    sale(db, people["NV005"], code="DHOK", line_total=5_000_000, cost=1_000_000)
    sale(
        db,
        people["NV005"],
        code="DHE",
        line_total=40_000_000,
        cost=1,
        status="IN_PROGRESS",
        completed_at=None,
    )
    sale(db, people["NV005"], code="DHF", line_total=60_000_000, cost=1, status="CANCELLED")

    row = by_code(report(an))["NV005"]

    assert (row["total_sales"], row["net_revenue"]) == (5_000_000, 4_000_000)


@pytest.mark.ac("AC-RPT-075")
def test_target_without_sales_shows_zero(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    put_target(db, people["NV007"], MONTH, 15_000_000)

    assert figures(by_code(report(an))["NV007"]) == (0, 0, 15_000_000, 0.0)


@pytest.mark.ac("AC-RPT-075")
def test_zero_target_gives_null_pct(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    put_target(db, people["NV007"], MONTH, 0)

    assert figures(by_code(report(an))["NV007"]) == (0, 0, 0, None)


@pytest.mark.ac("AC-RPT-076")
def test_sales_without_target_has_null_target(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    sale(db, people["NV008"], code="DHN", line_total=10_000_000, cost=6_000_000)

    data = report(an)

    assert figures(by_code(data)["NV008"]) == (10_000_000, 4_000_000, None, None)
    assert "NV001" not in by_code(data)  # no target, no sales → not listed


@pytest.mark.ac("AC-RPT-077")
def test_missing_cost_nulls_net_revenue(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_ac072(db, people)
    sale(db, people["NV005"], code="DHX", line_total=5_000_000, cost=None)

    assert figures(by_code(report(an))["NV005"]) == (135_000_000, None, 20_000_000, None)


@pytest.mark.ac("AC-RPT-078")
def test_group_filter_uses_order_division(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    security = insert_group(db, "Thiết bị an ninh")
    office = insert_group(db, "Thiết bị văn phòng")
    sale(db, people["NV005"], code="DHA", line_total=100_000_000, cost=80_000_000, division_id=security)
    sale(db, people["NV005"], code="DHB", line_total=30_000_000, cost=25_000_000, division_id=office)
    sale(db, people["NV008"], code="DHN", line_total=9_000_000, cost=1, division_id=office)
    put_target(db, people["NV005"], MONTH, 20_000_000)
    put_target(db, people["NV007"], MONTH, 15_000_000)

    rows = by_code(report(an, group_id=str(security)))

    assert figures(rows["NV005"]) == (100_000_000, 20_000_000, 20_000_000, 100.0)
    assert figures(rows["NV007"]) == (0, 0, 15_000_000, 0.0)
    assert "NV008" not in rows


@pytest.mark.ac("AC-RPT-079")
def test_department_and_employee_filters(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    sale(db, people["NV005"], code="DHA", line_total=10_000_000, cost=1)
    sale(db, people["NV008"], code="DHN", line_total=10_000_000, cost=1)
    put_target(db, people["NV007"], MONTH, 15_000_000)

    by_department = by_code(report(an, department_id=str(STANDARD_DEPARTMENT_IDS["ECONOMIC"])))
    by_employee = by_code(report(an, employee_id=str(people["NV008"])))

    assert set(by_department) == {"NV005", "NV007"}
    assert set(by_employee) == {"NV008"}


@pytest.mark.ac("AC-RPT-080")
@pytest.mark.ac("AC-RPT-171")
def test_totals_sum_rows(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_ac072(db, people)
    put_target(db, people["NV007"], MONTH, 15_000_000)
    sale(db, people["NV008"], code="DHN", line_total=10_000_000, cost=6_000_000)

    totals = report(an)["totals"]

    assert totals == {
        "total_sales": 140_000_000,
        "net_revenue": 29_000_000,
        "target": 35_000_000,
        "has_missing_cost": False,
        "achievement_pct": 82.9,
    }


@pytest.mark.ac("AC-RPT-080")
def test_totals_skip_null_net_and_flag_missing_cost(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    seed_ac072(db, people)
    sale(db, people["NV008"], code="DHN", line_total=10_000_000, cost=None)

    totals = report(an)["totals"]

    assert totals == {
        "total_sales": 140_000_000,
        "net_revenue": 25_000_000,
        "target": 20_000_000,
        "has_missing_cost": True,
        "achievement_pct": 125.0,
    }


@pytest.mark.ac("AC-RPT-171")
def test_totals_pct_null_without_target(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    sale(db, people["NV008"], code="DHN", line_total=10_000_000, cost=6_000_000)

    totals = report(an)["totals"]

    assert totals["target"] == 0
    assert totals["achievement_pct"] is None


@pytest.mark.ac("AC-RPT-081")
@pytest.mark.parametrize("url", [URL, EXPORT_URL, ME_URL])
@pytest.mark.parametrize("month", ["2026-13", "11-2026", "9999-12"])
def test_invalid_month_is_422(an: TestClient, url: str, month: str) -> None:
    assert an.get(url, params={"month": month}).status_code == 422


@pytest.mark.ac("AC-RPT-082")
@pytest.mark.parametrize("person", [HOA, NGOC, HUNG, KHANG], ids=lambda p: p.roles[0])
@pytest.mark.parametrize("url", [URL, EXPORT_URL])
def test_non_manager_forbidden(app: FastAPI, people: dict[str, uuid.UUID], person: Person, url: str) -> None:
    res = client_as(app, person).get(url, params={"month": MONTH})

    assert res.status_code == 403, res.text


@pytest.mark.ac("AC-RPT-083")
def test_export_csv(an: TestClient, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_ac072(db, people)
    db.execute(
        text("UPDATE employees SET full_name = '=HYPERLINK(1)' WHERE id = :id"), {"id": people["NV008"]}
    )
    put_target(db, people["NV008"], MONTH, 5_000_000)

    res = an.get(EXPORT_URL, params={"month": MONTH})

    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/csv")
    assert 'filename="bao-cao-kpi-2026-11.csv"' in res.headers["content-disposition"]
    assert res.content.startswith("﻿".encode())
    table = list(csv.reader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert table[0] == [
        "STT",
        "Mã NV",
        "Họ tên",
        "Tổng doanh số",
        "Doanh thu thuần",
        "Mục tiêu",
        "Tỷ lệ đạt (%)",
    ]
    assert table[1] == ["1", "NV005", HOA.full_name, "130000000", "25000000", "20000000", "125.0"]
    assert table[2][:3] == ["2", "NV008", "'=HYPERLINK(1)"]


@pytest.mark.ac("AC-RPT-084")
def test_my_kpi_sales(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_ac072(db, people)

    res = client_as(app, HOA).get(ME_URL, params={"month": MONTH})

    assert res.status_code == 200, res.text
    assert res.json() == {
        "month": MONTH,
        "total_sales": 130_000_000,
        "net_revenue": 25_000_000,
        "target": 20_000_000,
        "achievement_pct": 125.0,
    }


@pytest.mark.ac("AC-RPT-085")
def test_my_kpi_sales_defaults_to_current_vn_month(
    app: FastAPI, clock: FakeClock, people: dict[str, uuid.UUID]
) -> None:
    clock.now = datetime(2026, 10, 31, 17, 30, tzinfo=UTC)  # 01/11/2026 00:30 giờ VN

    res = client_as(app, KHANG).get(ME_URL)

    assert res.status_code == 200, res.text
    assert res.json() == {
        "month": MONTH,
        "total_sales": 0,
        "net_revenue": 0,
        "target": None,
        "achievement_pct": None,
    }


@pytest.mark.ac("AC-RPT-085")
def test_report_defaults_to_current_vn_month(
    app: FastAPI, clock: FakeClock, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    clock.now = datetime(2026, 10, 31, 17, 30, tzinfo=UTC)  # log in after moving the clock (token expiry)
    put_target(db, people["NV007"], MONTH, 15_000_000)

    res = client_as(app, AN).get(URL)

    assert res.status_code == 200, res.text
    assert res.json()["month"] == MONTH
    assert [r["employee_code"] for r in res.json()["rows"]] == ["NV007"]


@pytest.mark.ac("AC-RPT-086")
def test_my_kpi_sales_ignores_employee_id(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    seed_ac072(db, people)
    put_target(db, people["NV007"], MONTH, 15_000_000)

    res = client_as(app, HOA).get(ME_URL, params={"month": MONTH, "employee_id": str(people["NV007"])})

    assert res.status_code == 200, res.text
    assert res.json()["total_sales"] == 130_000_000
    assert res.json()["target"] == 20_000_000
