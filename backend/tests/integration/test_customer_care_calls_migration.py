"""M27-01a (AC-CUS-069): `customer_potential_notes.order_id` nullable + `care_call_id`, new table
`customer_care_calls`. Runs like test_cost_price_backfill_migration.py (real downgrade/upgrade commits)
on its own temporary rows, cleaned up afterwards.
"""

import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import IntegrityError

from app.modules.departments.models import STANDARD_DEPARTMENT_IDS
from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Head right before the M27-01a migration (UAT-02 manager bundle backfill).
_BEFORE_REVISION = "674b43c68403"


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


def _notes(engine: Engine, customer_id: uuid.UUID) -> dict[uuid.UUID, dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM customer_potential_notes WHERE customer_id = :id"), {"id": customer_id}
        )
        return {row.id: dict(row._mapping) for row in rows}


def _without_care_call(note: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in note.items() if k != "care_call_id"}


@pytest.fixture
def seeded(migrated: None) -> Iterator[dict[str, Any]]:
    """At head: one technician note (with an order) and one note written from a care call."""
    engine = create_engine(TEST_DATABASE_URL)
    employee_id, customer_id, order_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    order_note_id, call_note_id, call_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO employees (id, code, full_name, email, username, department_id,"
                " password_hash) VALUES (:id, 'NV-MIGCARE', 'NV tạm cho test migration',"
                " 'migcare@smyou.vn', 'migcare', :dept, 'x')"
            ),
            {"id": employee_id, "dept": STANDARD_DEPARTMENT_IDS["ECONOMIC"]},
        )
        conn.execute(
            text(
                "INSERT INTO customers (id, code, type, name, phone, created_by, version)"
                " VALUES (:id, 'KH-MIGCARE', 'INDIVIDUAL', 'Khách test migration', '0918000998',"
                " :by, 1)"
            ),
            {"id": customer_id, "by": employee_id},
        )
        conn.execute(
            text(
                "INSERT INTO orders (id, code, created_by, customer_id, status, version, total)"
                " VALUES (:id, 'DH2501-0951', :by, :customer, 'IN_PROGRESS', 1, 0)"
            ),
            {"id": order_id, "by": employee_id, "customer": customer_id},
        )
        conn.execute(
            text(
                "INSERT INTO customer_care_calls (id, customer_id, caller_id, offered, customer_request)"
                " VALUES (:id, :customer, :by, 'Camera IP 4MP', 'Báo giá 6 camera kho')"
            ),
            {"id": call_id, "customer": customer_id, "by": employee_id},
        )
        conn.execute(
            text(
                "INSERT INTO customer_potential_notes (id, customer_id, order_id, care_call_id, author_id,"
                " note, created_at) VALUES"
                " (:order_note, :customer, :order, NULL, :by, 'Muốn lắp thêm 4 camera kho',"
                " '2026-10-01T03:00:00Z'),"
                " (:call_note, :customer, NULL, :call, :by, 'Báo giá 6 camera kho', '2026-11-05T03:00:00Z')"
            ),
            {
                "order_note": order_note_id,
                "call_note": call_note_id,
                "customer": customer_id,
                "order": order_id,
                "call": call_id,
                "by": employee_id,
            },
        )
    config = _alembic_config()
    try:
        yield {
            "engine": engine,
            "config": config,
            "employee_id": employee_id,
            "customer_id": customer_id,
            "order_id": order_id,
            "order_note_id": order_note_id,
            "call_note_id": call_note_id,
            "before": _notes(engine, customer_id),
        }
    finally:
        command.upgrade(config, "head")
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM customer_potential_notes WHERE customer_id = :id"), {"id": customer_id}
            )
            conn.execute(text("DELETE FROM customer_care_calls WHERE customer_id = :id"), {"id": customer_id})
            conn.execute(text("DELETE FROM orders WHERE id = :id"), {"id": order_id})
            conn.execute(text("DELETE FROM customers WHERE id = :id"), {"id": customer_id})
            conn.execute(text("DELETE FROM employees WHERE id = :id"), {"id": employee_id})
        engine.dispose()


def _insert_orderless_note(engine: Engine, seeded: dict[str, Any]) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO customer_potential_notes (customer_id, order_id, author_id, note)"
                " VALUES (:customer, NULL, :by, 'Không gắn đơn')"
            ),
            {"customer": seeded["customer_id"], "by": seeded["employee_id"]},
        )


@pytest.mark.ac("AC-CUS-069")
def test_downgrade_drops_call_notes_and_restores_not_null_then_upgrade_keeps_data(
    seeded: dict[str, Any],
) -> None:
    engine: Engine = seeded["engine"]
    order_note_id = seeded["order_note_id"]

    command.downgrade(seeded["config"], _BEFORE_REVISION)

    after_down = _notes(engine, seeded["customer_id"])
    assert list(after_down) == [order_note_id]
    assert after_down[order_note_id] == _without_care_call(seeded["before"][order_note_id])
    with pytest.raises(IntegrityError):
        _insert_orderless_note(engine, seeded)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT to_regclass('customer_care_calls')")).scalar_one() is None

    command.upgrade(seeded["config"], "head")

    after_up = _notes(engine, seeded["customer_id"])
    assert after_up == {order_note_id: seeded["before"][order_note_id]}


@pytest.mark.ac("AC-CUS-069")
def test_note_needs_exactly_one_of_order_or_care_call(seeded: dict[str, Any]) -> None:
    with pytest.raises(IntegrityError):
        _insert_orderless_note(seeded["engine"], seeded)
    engine: Engine = seeded["engine"]
    with engine.connect() as conn:
        call_id = conn.execute(
            text("SELECT id FROM customer_care_calls WHERE customer_id = :id"), {"id": seeded["customer_id"]}
        ).scalar_one()
    with pytest.raises(IntegrityError), engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO customer_potential_notes (customer_id, order_id, care_call_id, author_id, note)"
                " VALUES (:customer, :order, :call, :by, 'Cả hai')"
            ),
            {
                "customer": seeded["customer_id"],
                "order": seeded["order_id"],
                "call": call_id,
                "by": seeded["employee_id"],
            },
        )
