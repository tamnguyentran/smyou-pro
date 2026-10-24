"""M16-08 (AC-ORD-197): migration backfills `orders.division` (enum cũ) sang `division_id`
đúng nhóm đã seed ở M16-07 — chạy riêng (không dùng fixture `db` transaction-rollback thường,
vì migration là DDL) giống `test_migrations.py`. Dùng 1 nhân viên/đơn tạm riêng (không qua
fixture `AN`/`seed` chung) và tự dọn dẹp, vì các bước downgrade/upgrade ở đây commit thật.
"""

import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]

_SECURITY_GROUP_ID = "a2222222-2222-4222-8222-222222222222"


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


@pytest.mark.ac("AC-ORD-197")
def test_division_backfill_maps_old_enum_to_seeded_group(migrated: None) -> None:
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    employee_id = uuid.uuid4()
    order_id = uuid.uuid4()

    # Downgrade past the M16-08 migration: `orders.division` (old VARCHAR) exists again,
    # `product_service_groups` (M16-07, revision e921b4f854cb) is still seeded.
    command.downgrade(config, "e921b4f854cb")
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO employees (id, code, full_name, email, department, password_hash,"
                    " must_change_password, is_active, failed_login_count)"
                    " VALUES (:id, 'NV-MIGTEST', 'NV tạm cho test migration', 'migtest@smyou.vn',"
                    " 'MANAGEMENT', 'x', false, true, 0)"
                ),
                {"id": employee_id},
            )
            conn.execute(
                text(
                    "INSERT INTO orders (id, code, created_by, division)"
                    " VALUES (:id, 'DH-MIGTEST-01', :created_by, 'SECURITY')"
                ),
                {"id": order_id, "created_by": employee_id},
            )

        command.upgrade(config, "head")

        with engine.connect() as conn:
            row = conn.execute(text("SELECT division_id FROM orders WHERE id = :id"), {"id": order_id}).one()
            assert str(row.division_id) == _SECURITY_GROUP_ID
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM orders WHERE id = :id"), {"id": order_id})
            conn.execute(text("DELETE FROM employees WHERE id = :id"), {"id": employee_id})
        command.upgrade(config, "head")
        engine.dispose()
