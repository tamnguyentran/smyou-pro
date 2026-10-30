"""M17-02b (AC-EMP-052): migration backfills `employees.department` (enum cũ) sang `department_id`
đúng phòng ban seed ở M17-02a, và downgrade trả lại enum cũ. Chạy riêng như
test_order_division_migration.py (DDL commit thật) — nhân viên tạm riêng, tự dọn dẹp.
"""

import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]
# M17-02a migration (departments table + seed); the M17-02b migration sits right after it.
_DEPARTMENTS_REVISION = "02466fd5936d"
EXPECTED = {
    "TECHNICAL": ("d3333333-3333-4333-8333-333333333333", "Kỹ thuật"),
    "SALES": ("d2222222-2222-4222-8222-222222222222", "Kinh doanh"),
    "MANAGEMENT": ("d1111111-1111-4111-8111-111111111111", "Ban quản lý"),
}


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


@pytest.mark.ac("AC-EMP-052")
def test_department_backfill_and_downgrade(migrated: None) -> None:
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    people = {dept: uuid.uuid4() for dept in EXPECTED}

    command.downgrade(config, _DEPARTMENTS_REVISION)
    try:
        with engine.begin() as conn:
            for n, (dept, employee_id) in enumerate(people.items()):
                conn.execute(
                    text(
                        "INSERT INTO employees (id, code, full_name, email, department, password_hash)"
                        " VALUES (:id, :code, 'NV tạm cho test migration', :email, :dept, 'x')"
                    ),
                    {
                        "id": employee_id,
                        "code": f"NV-MIGDEPT-{n}",
                        "email": f"migdept{n}@smyou.vn",
                        "dept": dept,
                    },
                )

        command.upgrade(config, "head")

        with engine.connect() as conn:
            for dept, employee_id in people.items():
                row = conn.execute(
                    text(
                        "SELECT e.department_id, d.name FROM employees e"
                        " JOIN departments d ON d.id = e.department_id WHERE e.id = :id"
                    ),
                    {"id": employee_id},
                ).one()
                assert (str(row.department_id), row.name) == EXPECTED[dept]
            assert (
                conn.execute(text("SELECT count(*) FROM employees WHERE department_id IS NULL")).scalar_one()
                == 0
            )

        command.downgrade(config, _DEPARTMENTS_REVISION)

        with engine.connect() as conn:
            for dept, employee_id in people.items():
                old = conn.execute(
                    text("SELECT department FROM employees WHERE id = :id"), {"id": employee_id}
                ).scalar_one()
                assert old == dept
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM employees WHERE id = ANY(:ids)"), {"ids": list(people.values())})
        command.upgrade(config, "head")
        engine.dispose()
