import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, text
from sqlalchemy.exc import IntegrityError

from tests.conftest import TEST_DATABASE_URL
from tests.integration.conftest import AN, seed

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


@pytest.mark.ac("AC-SYS-012")
def test_migrations_upgrade_downgrade_upgrade_and_no_drift() -> None:
    config = _alembic_config()

    command.upgrade(config, "head")
    command.downgrade(config, "-1")
    command.upgrade(config, "head")
    command.check(config)  # raises if models and migrations disagree


@pytest.mark.ac("AC-ORD-179")
def test_orders_status_check_constraint_accepts_dispatched(db: Connection) -> None:
    created_by = seed(db, AN)
    order_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO orders (id, code, status, created_by) "
            "VALUES (:id, 'DH-TEST-179', 'DISPATCHED', :created_by)"
        ),
        {"id": order_id, "created_by": created_by},
    )
    status = db.execute(text("SELECT status FROM orders WHERE id = :id"), {"id": order_id}).scalar_one()
    assert status == "DISPATCHED"

    with pytest.raises(IntegrityError):
        db.execute(text("UPDATE orders SET status = 'FOO' WHERE id = :id"), {"id": order_id})
