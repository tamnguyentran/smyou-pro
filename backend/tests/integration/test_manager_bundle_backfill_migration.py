"""UAT-02 (Q185, AC-EMP-125): data migration giving every MANAGER the rest of `MANAGER_BUNDLE`
(SALE, CUSTOMER_CARE, TECH_LEAD) — accounts saved before M15-01 (e.g. UAT's nam.nv) only had MANAGER.
Runs like test_cost_price_backfill_migration.py: real downgrade/upgrade on its own temporary rows.
"""

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.modules.departments.models import STANDARD_DEPARTMENT_IDS
from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Head right before the UAT-02 migration.
_BEFORE_REVISION = "7b3e5d1a9c42"
BUNDLE = {"MANAGER", "SALE", "CUSTOMER_CARE", "TECH_LEAD"}
# key -> roles before the migration
EMPLOYEES = {
    "manager_only": ["MANAGER"],
    "manager_partial": ["MANAGER", "SALE"],
    "manager_full": sorted(BUNDLE),
    "sale_cskh": ["SALE", "CUSTOMER_CARE"],
    "technician": ["TECHNICIAN"],
}


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


@pytest.fixture
def roles_after(migrated: None) -> Iterator[dict[str, set[str]]]:
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    ids = {key: uuid.uuid4() for key in EMPLOYEES}
    command.downgrade(config, _BEFORE_REVISION)
    try:
        with engine.begin() as conn:
            for n, (key, roles) in enumerate(EMPLOYEES.items()):
                conn.execute(
                    text(
                        "INSERT INTO employees (id, code, full_name, email, username, department_id,"
                        " password_hash) VALUES (:id, :code, :name, :email, :username, :dept, 'x')"
                    ),
                    {
                        "id": ids[key],
                        "code": f"NV-MIGMGR{n}",
                        "name": f"NV tạm {key}",
                        "email": f"migmgr{n}@smyou.vn",
                        "username": f"migmgr{n}",
                        "dept": STANDARD_DEPARTMENT_IDS["ECONOMIC"],
                    },
                )
                for role in roles:
                    conn.execute(
                        text("INSERT INTO employee_roles (employee_id, role) VALUES (:id, :role)"),
                        {"id": ids[key], "role": role},
                    )
        command.upgrade(config, "head")
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT employee_id, role FROM employee_roles WHERE employee_id = ANY(:ids)"),
                {"ids": list(ids.values())},
            ).all()
        by_id: dict[uuid.UUID, set[str]] = {}
        for employee_id, role in rows:
            by_id.setdefault(employee_id, set()).add(role)
        yield {key: by_id.get(ids[key], set()) for key in EMPLOYEES}
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM employees WHERE id = ANY(:ids)"), {"ids": list(ids.values())})
        command.upgrade(config, "head")
        engine.dispose()


@pytest.mark.ac("AC-EMP-125")
def test_every_manager_gets_the_full_bundle(roles_after: dict[str, set[str]]) -> None:
    assert roles_after["manager_only"] == BUNDLE
    assert roles_after["manager_partial"] == BUNDLE
    assert roles_after["manager_full"] == BUNDLE


@pytest.mark.ac("AC-EMP-125")
def test_non_managers_are_untouched(roles_after: dict[str, set[str]]) -> None:
    assert roles_after["sale_cskh"] == {"SALE", "CUSTOMER_CARE"}
    assert roles_after["technician"] == {"TECHNICIAN"}
