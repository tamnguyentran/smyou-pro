"""M20-07 (AC-EMP-091…095): migration gộp "Phòng ban" về 3 phòng chuẩn của M17-02a.
Chạy riêng như test_consolidate_groups_migration.py (downgrade/upgrade commit thật) — dữ liệu tạm
riêng (6 nhân viên, 1 phòng tự thêm, audit cũ), tự dọn dẹp. Fixture `consolidated` phải đứng trước
`api`/`db` trong tham số test để được dọn **sau** khi transaction của `db` đã rollback.
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

from app.modules.departments.models import LEGACY_DEPARTMENT_IDS
from app.modules.employees.domain import MANAGER_BUNDLE
from tests.conftest import TEST_DATABASE_URL
from tests.integration.conftest import Person, seed
from tests.integration.test_departments_api import client_as, problem

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Head right before the M20-07 migration (M20-06 consolidate_product_service_groups).
_BEFORE_REVISION = "7c2d9e4b1a05"

ECONOMIC = "d4444444-4444-4444-8444-444444444444"
HR = "d5555555-5555-4555-8555-555555555555"
ACCOUNTING = "d6666666-6666-4666-8666-666666666666"
STANDARD = {ACCOUNTING: "Kế Toán - Tài chính", HR: "Nhân sự/Marketing", ECONOMIC: "Phát Triển Kinh Tế"}
LEGACY = {
    "MANAGEMENT": "Ban quản lý",
    "SALES": "Kinh doanh",
    "TECHNICAL": "Kỹ thuật",
}

# Caller for the API checks; lives in a standard department so seeding it never re-creates legacy rows.
MGR = Person("mig.mgr@smyou.vn", "SmYou@2026", ("MANAGER",), "NV-MIGMGR", "Quản lý kiểm thử", "ECONOMIC")

# key -> (full name, role, department key, is_active, version)
# A MANAGER always holds the whole MANAGER_BUNDLE (UAT-02 backfill enforces it at head).
EMPLOYEES = {
    "an": ("Nguyễn Văn An", "MANAGER", "MANAGEMENT", True, 2),
    "binh": ("Lê Văn Bình", "SALE", "SALES", True, 1),
    "tu": ("Phạm Minh Tú", "TECHNICIAN", "TECHNICAL", True, 1),
    "thu": ("Đỗ Thu", "CUSTOMER_CARE", "CSKH", True, 1),
    "khoa": ("Trần Văn Khoa", "TECHNICIAN", "TECHNICAL", False, 1),
    "lan": ("Vũ Thị Lan", "MANAGER", "ACCOUNTING", True, 1),
}
MOVED = ("an", "binh", "tu", "thu", "khoa")
_AUDIT_MARKER = '{"fixture": "M20-07"}'


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


def _audit_count(engine: Engine) -> int:
    with engine.connect() as conn:
        return int(conn.execute(text("SELECT count(*) FROM audit_events")).scalar_one())


def _employees(engine: Engine, ids: dict[str, uuid.UUID]) -> dict[str, dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT e.*, array_agg(r.role ORDER BY r.role) AS roles FROM employees e"
                " LEFT JOIN employee_roles r ON r.employee_id = e.id WHERE e.id = ANY(:ids) GROUP BY e.id"
            ),
            {"ids": list(ids.values())},
        )
        by_id = {row.id: dict(row._mapping) for row in rows}
    return {key: by_id[employee_id] for key, employee_id in ids.items()}


def _departments(engine: Engine) -> dict[str, dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, name, is_active, version FROM departments"))
        return {str(row.id): dict(row._mapping) for row in rows}


def _restore_standard(engine: Engine) -> None:
    with engine.begin() as conn:
        for department_id, name in STANDARD.items():
            conn.execute(
                text("UPDATE departments SET name = :name, is_active = true WHERE id = :id"),
                {"id": department_id, "name": name},
            )


@pytest.fixture
def consolidated(migrated: None) -> Iterator[dict[str, Any]]:
    """DB in the spec's "Dữ liệu chung" state, migrated to head; yields ids + pre-migration snapshots."""
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    cskh = uuid.uuid4()
    dept_ids = {**{k: str(v) for k, v in LEGACY_DEPARTMENT_IDS.items()}, "CSKH": str(cskh)}
    dept_ids |= {"ECONOMIC": ECONOMIC, "HR": HR, "ACCOUNTING": ACCOUNTING}
    employee_ids = {key: uuid.uuid4() for key in EMPLOYEES}
    old_departments = [dept_ids[k] for k in ("MANAGEMENT", "SALES", "TECHNICAL", "CSKH")]

    command.downgrade(config, _BEFORE_REVISION)
    try:
        with engine.begin() as conn:
            for key, name in LEGACY.items():
                conn.execute(
                    text(
                        "INSERT INTO departments (id, name, is_active) VALUES (:id, :name, true)"
                        " ON CONFLICT (id) DO UPDATE SET name = :name, is_active = true"
                    ),
                    {"id": dept_ids[key], "name": name},
                )
            conn.execute(
                text("INSERT INTO departments (id, name, is_active) VALUES (:id, 'CSKH', true)"), {"id": cskh}
            )
            conn.execute(
                text("UPDATE departments SET name = 'Nhân sự/marketing', is_active = true WHERE id = :id"),
                {"id": HR},
            )
            conn.execute(
                text("UPDATE departments SET name = 'Kế Toán - tài chính', is_active = false WHERE id = :id"),
                {"id": ACCOUNTING},
            )
            for department_id in old_departments:
                conn.execute(
                    text(
                        "INSERT INTO audit_events (entity_type, entity_id, action, data)"
                        " VALUES ('DEPARTMENT', :id, 'create', CAST(:marker AS jsonb))"
                    ),
                    {"id": department_id, "marker": _AUDIT_MARKER},
                )
            for key, (name, role, dept, active, version) in EMPLOYEES.items():
                conn.execute(
                    text(
                        "INSERT INTO employees (id, code, full_name, email, username, department_id,"
                        " password_hash, is_active, version) VALUES (:id, :code, :name, :email, :username,"
                        " :dept, 'x', :active, :version)"
                    ),
                    {
                        "id": employee_ids[key],
                        "code": f"NV-MIGDEP-{key}",
                        "name": name,
                        "email": f"migdep.{key}@smyou.vn",
                        "username": f"migdep.{key}",
                        "dept": dept_ids[dept],
                        "active": active,
                        "version": version,
                    },
                )
                roles = sorted(MANAGER_BUNDLE) if role == "MANAGER" else [role]
                conn.execute(
                    text("INSERT INTO employee_roles (employee_id, role) VALUES (:id, :role)"),
                    [{"id": employee_ids[key], "role": r} for r in roles],
                )

        before = {
            "employees": _employees(engine, employee_ids),
            "audit": _audit_count(engine),
        }
        command.upgrade(config, "head")
        yield {
            "config": config,
            "engine": engine,
            "employee_ids": employee_ids,
            "old_departments": old_departments,
            "before": before,
        }
    finally:
        with engine.begin() as conn:
            ids = list(employee_ids.values())
            conn.execute(text("DELETE FROM employee_roles WHERE employee_id = ANY(:ids)"), {"ids": ids})
            conn.execute(text("DELETE FROM employees WHERE id = ANY(:ids)"), {"ids": ids})
            conn.execute(text("DELETE FROM departments WHERE id = :id"), {"id": cskh})
            # Committed rows of a shared test DB: other tests count audit_events.
            conn.execute(
                text("DELETE FROM audit_events WHERE data = CAST(:marker AS jsonb)"),
                {"marker": _AUDIT_MARKER},
            )
        _restore_standard(engine)
        command.upgrade(config, "head")
        engine.dispose()


@pytest.mark.ac("AC-EMP-091")
def test_only_three_standard_departments_active(
    consolidated: dict[str, Any], app: FastAPI, db: Connection
) -> None:
    seed(db, MGR)

    res = client_as(app, MGR).get("/api/v1/departments", params={"is_active": "true"})

    assert res.status_code == 200, res.text
    assert [(item["id"], item["name"]) for item in res.json()["items"]] == list(STANDARD.items())


@pytest.mark.ac("AC-EMP-092")
def test_employees_of_old_departments_moved_to_economic(consolidated: dict[str, Any]) -> None:
    after = _employees(consolidated["engine"], consolidated["employee_ids"])
    before = consolidated["before"]["employees"]

    for key in MOVED:
        assert str(after[key]["department_id"]) == ECONOMIC, key
        assert after[key]["version"] == before[key]["version"] + 1, key
        kept = {"is_active", "roles", "username", "email", "password_hash", "must_change_password"}
        assert {k: after[key][k] for k in kept} == {k: before[key][k] for k in kept}, key
    assert after["an"]["version"] == 3
    assert after["khoa"]["is_active"] is False


@pytest.mark.ac("AC-EMP-093")
def test_employee_of_standard_department_untouched(consolidated: dict[str, Any]) -> None:
    after = _employees(consolidated["engine"], consolidated["employee_ids"])

    assert str(after["lan"]["department_id"]) == ACCOUNTING
    assert after["lan"]["version"] == 1
    assert _departments(consolidated["engine"])[ACCOUNTING]["name"] == "Kế Toán - Tài chính"


@pytest.mark.ac("AC-EMP-094")
def test_old_departments_deleted_but_audit_kept(
    consolidated: dict[str, Any], app: FastAPI, db: Connection
) -> None:
    departments = _departments(consolidated["engine"])
    assert not set(consolidated["old_departments"]) & set(departments)
    with consolidated["engine"].connect() as conn:
        kept = conn.execute(
            text(
                "SELECT count(*) FROM audit_events WHERE entity_type = 'DEPARTMENT' AND entity_id = ANY(:ids)"
            ),
            {"ids": [uuid.UUID(d) for d in consolidated["old_departments"]]},
        ).scalar_one()
    assert kept >= 4

    seed(db, MGR)
    mgr = client_as(app, MGR)
    listed = mgr.get("/api/v1/departments").json()
    assert [item["name"] for item in listed["items"]] == list(STANDARD.values())
    assert listed["total"] == 3
    problem(mgr.get(f"/api/v1/departments/{LEGACY_DEPARTMENT_IDS['TECHNICAL']}"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-EMP-095")
def test_no_audit_events_and_rerun_is_noop(consolidated: dict[str, Any]) -> None:
    engine = consolidated["engine"]
    assert _audit_count(engine) == consolidated["before"]["audit"]
    departments = _departments(engine)
    employees = _employees(engine, consolidated["employee_ids"])

    command.downgrade(consolidated["config"], _BEFORE_REVISION)
    command.upgrade(consolidated["config"], "head")

    assert _departments(engine) == departments
    assert _employees(engine, consolidated["employee_ids"]) == employees
    assert _audit_count(engine) == consolidated["before"]["audit"]


@pytest.mark.ac("AC-EMP-091")
def test_upgrade_restores_missing_standard_department(migrated: None) -> None:
    """A standard row deleted by hand, or its name held by a custom active department."""
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    custom = uuid.uuid4()

    command.downgrade(config, _BEFORE_REVISION)
    try:
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE employees SET department_id = :economic WHERE department_id = :hr"),
                {"economic": ECONOMIC, "hr": HR},
            )
            conn.execute(text("DELETE FROM departments WHERE id = :id"), {"id": HR})
            conn.execute(
                text("INSERT INTO departments (id, name, is_active) VALUES (:id, 'Nhân sự/Marketing', true)"),
                {"id": custom},
            )

        command.upgrade(config, "head")

        departments = _departments(engine)
        assert {d: v["name"] for d, v in departments.items() if v["is_active"]} == STANDARD
        assert str(custom) not in departments
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM departments WHERE id = :id"), {"id": custom})
            conn.execute(
                text("INSERT INTO departments (id, name) VALUES (:id, 'tmp') ON CONFLICT (id) DO NOTHING"),
                {"id": HR},
            )
        _restore_standard(engine)
        command.upgrade(config, "head")
        engine.dispose()
