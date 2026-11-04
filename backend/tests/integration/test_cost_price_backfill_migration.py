"""M21-08 (AC-CAT-110, AC-ORD-259…262): data migration filling missing cost prices with 70% of the
selling price. Runs like test_consolidate_groups_migration.py (real downgrade/upgrade commits) on its
own temporary rows, cleaned up afterwards. The `backfilled` fixture must come before `app`/`db` in a
test's parameters so it is torn down **after** the `db` transaction rolled back.
"""

import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy import Connection, Engine, create_engine, text

from app.modules.departments.models import STANDARD_DEPARTMENT_IDS
from tests.conftest import TEST_DATABASE_URL
from tests.integration.conftest import AN, seed
from tests.integration.test_orders_api import client_as

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Head right before the M21-08 migration (M21-05a customer_potential_notes).
_BEFORE_REVISION = "149cce71a5c6"

# line key -> (order key, item_type, product key, is_gift, unit_price, catalog_price_snapshot, cost)
LINES: dict[str, tuple[str, str, str | None, bool, int, int | None, int | None]] = {
    "cam": ("done", "PRODUCT", "CAM-H265", False, 1_250_000, 1_250_000, None),
    "lbp": ("draft", "PRODUCT", "LBP2900", False, 4_200_000, 4_200_000, 2_940_000),
    "custom": ("draft", "CUSTOM", None, False, 300_000, None, None),
    "gift": ("draft", "PRODUCT", "CAM-H265", True, 0, 1_250_000, None),
    "gift_custom": ("draft", "CUSTOM", None, True, 0, None, None),
}


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


def _rows(engine: Engine, table: str, ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, Any]]:
    assert table in ("products", "services", "orders", "order_lines")
    with engine.connect() as conn:
        rows = conn.execute(text(f"SELECT * FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608  # table name checked against a literal allow-list above
        return {row.id: dict(row._mapping) for row in rows}


def _count(engine: Engine, query: str) -> int:
    with engine.connect() as conn:
        return int(conn.execute(text(query)).scalar_one())


@pytest.fixture
def backfilled(migrated: None) -> Iterator[dict[str, Any]]:
    """DB with legacy null cost prices at the revision before M21-08, then migrated to head."""
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    employee_id = uuid.uuid4()
    customer_id = uuid.uuid4()
    products = {"CAM-H265": uuid.uuid4(), "LBP2900": uuid.uuid4()}
    service_id = uuid.uuid4()
    orders = {"done": uuid.uuid4(), "draft": uuid.uuid4()}
    lines = {key: uuid.uuid4() for key in LINES}

    command.downgrade(config, _BEFORE_REVISION)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO employees (id, code, full_name, email, username, department_id,"
                    " password_hash) VALUES (:id, 'NV-MIGCOST', 'NV tạm cho test migration',"
                    " 'migcost@smyou.vn', 'migcost', :dept, 'x')"
                ),
                {"id": employee_id, "dept": STANDARD_DEPARTMENT_IDS["ECONOMIC"]},
            )
            conn.execute(
                text(
                    "INSERT INTO customers (id, code, type, name, phone, created_by, version)"
                    " VALUES (:id, 'KH-MIGCOST', 'INDIVIDUAL', 'Khách test migration', '0918000999',"
                    " :created_by, 1)"
                ),
                {"id": customer_id, "created_by": employee_id},
            )
            conn.execute(
                text(
                    "INSERT INTO products (id, sku, name, category, unit, price, cost_price, vat_rate,"
                    " price_fixed, is_active, version) VALUES"
                    " (:cam, 'MIG-CAM-H265', 'Camera Hikvision 2MP (test migration)', 'CAMERA', 'CAI',"
                    " 1250000, NULL, 8, false, true, 3),"
                    " (:lbp, 'MIG-LBP2900', 'Máy in Canon LBP2900 (test migration)', 'PRINTER', 'CAI',"
                    " 4200000, 2940000, 8, false, true, 2)"
                ),
                {"cam": products["CAM-H265"], "lbp": products["LBP2900"]},
            )
            conn.execute(
                text(
                    "INSERT INTO services (id, code, name, category, unit, price, cost_price, vat_rate,"
                    " price_fixed, is_active, version) VALUES (:id, 'MIG-DV-LD01',"
                    " 'Lắp đặt camera (test migration)', 'INSTALLATION', 'LAN', 155555, NULL, 8, false,"
                    " true, 4)"
                ),
                {"id": service_id},
            )
            conn.execute(
                text(
                    "INSERT INTO orders (id, code, created_by, customer_id, status, version, total,"
                    " submitted_at, completed_at) VALUES"
                    " (:done, 'DH2501-0901', :by, :customer, 'COMPLETED', 5, 1250000,"
                    " '2025-01-08T03:00:00Z', '2025-01-10T03:00:00Z'),"
                    " (:draft, 'DH2501-0902', :by, :customer, 'DRAFT', 7, 4500000, NULL, NULL)"
                ),
                {
                    "done": orders["done"],
                    "draft": orders["draft"],
                    "by": employee_id,
                    "customer": customer_id,
                },
            )
            for position, (key, (order, item_type, product, gift, price, catalog, cost)) in enumerate(
                LINES.items(), start=1
            ):
                conn.execute(
                    text(
                        "INSERT INTO order_lines (id, order_id, position, item_type, product_id,"
                        " name_snapshot, unit_snapshot, is_gift, vat_rate, quantity, unit_price,"
                        " catalog_price_snapshot, cost_price_snapshot, line_gross, line_vat, line_total,"
                        " credited_employee_id)"
                        " VALUES (:id, :order_id, :position, :item_type, :product_id, :name, 'CAI', :gift,"
                        " 0, 1, :price, :catalog, :cost, :price, 0, :price, :credited)"
                    ),
                    {
                        "id": lines[key],
                        "order_id": orders[order],
                        "position": position,
                        "item_type": item_type,
                        "product_id": products[product] if product else None,
                        "name": f"Dòng {key}",
                        "gift": gift,
                        "price": price,
                        "catalog": catalog,
                        "cost": cost,
                        "credited": employee_id,
                    },
                )

        before = {
            "products": _rows(engine, "products", list(products.values())),
            "services": _rows(engine, "services", [service_id]),
            "orders": _rows(engine, "orders", list(orders.values())),
            "lines": _rows(engine, "order_lines", list(lines.values())),
        }
        command.upgrade(config, "head")
        yield {
            "engine": engine,
            "employee_id": employee_id,
            "products": products,
            "service_id": service_id,
            "orders": orders,
            "lines": lines,
            "before": before,
        }
    finally:
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM order_lines WHERE order_id = ANY(:ids)"), {"ids": list(orders.values())}
            )
            conn.execute(text("DELETE FROM orders WHERE id = ANY(:ids)"), {"ids": list(orders.values())})
            conn.execute(text("DELETE FROM products WHERE id = ANY(:ids)"), {"ids": list(products.values())})
            conn.execute(text("DELETE FROM services WHERE id = :id"), {"id": service_id})
            conn.execute(text("DELETE FROM customers WHERE id = :id"), {"id": customer_id})
            conn.execute(text("DELETE FROM employees WHERE id = :id"), {"id": employee_id})
        command.upgrade(config, "head")
        engine.dispose()


@pytest.mark.ac("AC-CAT-110")
def test_catalog_items_without_cost_get_70_percent(backfilled: dict[str, Any]) -> None:
    engine = backfilled["engine"]
    products = _rows(engine, "products", list(backfilled["products"].values()))
    service = _rows(engine, "services", [backfilled["service_id"]])[backfilled["service_id"]]
    before = backfilled["before"]
    cam, lbp = (products[backfilled["products"][key]] for key in ("CAM-H265", "LBP2900"))

    assert cam["cost_price"] == 875_000
    assert service["cost_price"] == 108_889  # 108.888,5 rounded half up
    assert lbp["cost_price"] == 2_940_000
    for row in (cam, lbp):
        assert (row["price"], row["version"]) == (
            before["products"][row["id"]]["price"],
            before["products"][row["id"]]["version"],
        )
    assert (service["price"], service["version"]) == (155_555, 4)
    assert _count(engine, "SELECT count(*) FROM products WHERE cost_price IS NULL") == 0
    assert _count(engine, "SELECT count(*) FROM services WHERE cost_price IS NULL") == 0


@pytest.mark.ac("AC-ORD-259")
def test_order_lines_without_cost_get_70_percent_of_unit_price(backfilled: dict[str, Any]) -> None:
    engine = backfilled["engine"]
    lines = _rows(engine, "order_lines", list(backfilled["lines"].values()))
    before = backfilled["before"]
    cam, lbp = (lines[backfilled["lines"][key]] for key in ("cam", "lbp"))

    assert cam["cost_price_snapshot"] == 875_000
    assert lbp["cost_price_snapshot"] == 2_940_000
    for row in lines.values():
        old = before["lines"][row["id"]]
        assert (row["unit_price"], row["line_total"], row["vat_rate"]) == (
            old["unit_price"],
            old["line_total"],
            old["vat_rate"],
        )
    orders = _rows(engine, "orders", list(backfilled["orders"].values()))
    assert {k: v["version"] for k, v in orders.items()} == {
        k: v["version"] for k, v in before["orders"].items()
    }


@pytest.mark.ac("AC-ORD-260")
def test_custom_line_without_cost_gets_70_percent(backfilled: dict[str, Any]) -> None:
    line_id = backfilled["lines"]["custom"]

    assert _rows(backfilled["engine"], "order_lines", [line_id])[line_id]["cost_price_snapshot"] == 210_000


@pytest.mark.ac("AC-ORD-261")
def test_gift_lines_use_catalog_price_or_zero(backfilled: dict[str, Any]) -> None:
    ids = [backfilled["lines"]["gift"], backfilled["lines"]["gift_custom"]]
    lines = _rows(backfilled["engine"], "order_lines", ids)

    assert [lines[i]["cost_price_snapshot"] for i in ids] == [875_000, 0]
    assert (
        _count(backfilled["engine"], "SELECT count(*) FROM order_lines WHERE cost_price_snapshot IS NULL")
        == 0
    )


@pytest.mark.ac("AC-ORD-262")
def test_reports_show_profit_after_migration(
    backfilled: dict[str, Any], app: FastAPI, db: Connection
) -> None:
    seed(db, AN)
    an = client_as(app, AN)
    employee_id = str(backfilled["employee_id"])

    report = an.get("/api/v1/reports/revenue-by-employee", params={"from": "2025-01-01", "to": "2025-01-31"})
    charts = an.get("/api/v1/reports/business-charts/results", params={"from": "2025-01", "to": "2025-01"})

    assert report.status_code == 200, report.text
    row = next(r for r in report.json()["items"] if r["employee_id"] == employee_id)
    assert (row["subtotal_revenue"], row["profit"]) == (1_250_000, 375_000)
    assert charts.status_code == 200, charts.text
    assert charts.json()["monthly"] == [{"month": "2025-01", "revenue": 1_250_000, "profit": 375_000}]
