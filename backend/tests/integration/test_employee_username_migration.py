"""M17-03b (AC-AUTH-069): the migration backfills `employees.username` with the same rule as the
service (duplicates numbered by `created_at`), and downgrade drops the column. Runs real DDL commits
like test_employee_department_migration.py — temporary employees, cleaned up afterwards.
"""

import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]
# M17-03a migration (profile fields); the M17-03b migration sits right after it.
_PROFILE_REVISION = "7c3e9a41d2b8"
# (full name, created_at) → expected username; the second Tú was created later, so gets the number.
PEOPLE = [
    ("Nguyễn Văn An", "2026-01-01T00:00:00+00", "an.nv"),
    ("Lê Văn Bình", "2026-01-02T00:00:00+00", "binh.lv"),
    ("Phạm Minh Tú", "2026-01-04T00:00:00+00", "tu.pm2"),
    ("Phạm Minh Tú", "2026-01-03T00:00:00+00", "tu.pm"),
]


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


@pytest.mark.ac("AC-AUTH-069")
def test_username_backfill_and_downgrade(migrated: None) -> None:
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    ids = [uuid.uuid4() for _ in PEOPLE]

    command.downgrade(config, _PROFILE_REVISION)
    try:
        with engine.begin() as conn:
            for n, (employee_id, (name, created_at, _)) in enumerate(zip(ids, PEOPLE, strict=True)):
                conn.execute(
                    text(
                        "INSERT INTO employees (id, code, full_name, email, department_id, password_hash,"
                        " created_at) VALUES (:id, :code, :name, :email,"
                        " 'd1111111-1111-4111-8111-111111111111', 'x', :created_at)"
                    ),
                    {
                        "id": employee_id,
                        "code": f"NV-MIGUSER-{n}",
                        "name": name,
                        "email": f"miguser{n}@smyou.vn",
                        "created_at": created_at,
                    },
                )

        command.upgrade(config, "head")

        with engine.connect() as conn:
            for employee_id, (_, _, expected) in zip(ids, PEOPLE, strict=True):
                username = conn.execute(
                    text("SELECT username FROM employees WHERE id = :id"), {"id": employee_id}
                ).scalar_one()
                assert username == expected
            column = next(c for c in inspect(conn).get_columns("employees") if c["name"] == "username")
            assert column["nullable"] is False

        command.downgrade(config, _PROFILE_REVISION)

        with engine.connect() as conn:
            assert "username" not in {c["name"] for c in inspect(conn).get_columns("employees")}
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM employees WHERE id = ANY(:ids)"), {"ids": ids})
        command.upgrade(config, "head")
        engine.dispose()
