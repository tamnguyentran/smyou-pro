"""M20-07: deactivating a department while an employee is being moved into it (AC-EMP-096).

Runs real, committed, parallel transactions (not the rolled-back test transaction), so it creates
and deletes its own rows.
"""

import threading
import time
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.authz import Actor
from app.core.errors import AppError
from app.modules.departments import service as departments
from app.modules.employees import service as employees
from app.modules.employees.schemas import EmployeeUpdate
from tests.conftest import TEST_DATABASE_URL

NOW = datetime(2026, 11, 1, 2, 0, tzinfo=UTC)
ECONOMIC = "d4444444-4444-4444-8444-444444444444"
CLEANUP = (
    "DELETE FROM audit_events WHERE entity_id IN"
    " (SELECT id FROM employees WHERE email LIKE '%@race-dept.smyou.vn')"
    " OR entity_id IN (SELECT id FROM departments WHERE name = 'Kho vận race')",
    "DELETE FROM employees WHERE email LIKE '%@race-dept.smyou.vn'",
    "DELETE FROM departments WHERE name = 'Kho vận race'",
)


@pytest.fixture
def engine(migrated: None) -> Iterator[Engine]:
    engine = create_engine(TEST_DATABASE_URL, pool_size=4)
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            for statement in CLEANUP:
                conn.execute(text(statement))
        engine.dispose()


def wait_until_blocked_on_lock(engine: Engine) -> None:
    with engine.connect() as conn:
        for _ in range(100):
            waiting = conn.execute(
                text("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'")
            ).scalar_one()
            if waiting:
                return
            time.sleep(0.05)


@pytest.mark.ac("AC-EMP-096")
def test_move_into_department_racing_its_deactivation_is_rejected(engine: Engine) -> None:
    manager_id, mover_id, department_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    with engine.begin() as conn:
        for statement in CLEANUP:
            conn.execute(text(statement))
        conn.execute(
            text("INSERT INTO departments (id, name) VALUES (:id, 'Kho vận race')"),
            {"id": department_id},
        )
        for n, employee_id in enumerate((manager_id, mover_id), start=1):
            conn.execute(
                text(
                    "INSERT INTO employees (id, code, full_name, email, username, department_id,"
                    " password_hash) VALUES (:id, :code, :name, :email, :username, :dept, 'x')"
                ),
                {
                    "id": employee_id,
                    "code": f"RACED{n}",
                    "name": f"Race {n}",
                    "email": f"r{n}@race-dept.smyou.vn",
                    "username": f"raced{n}",
                    "dept": ECONOMIC,
                },
            )
        conn.execute(
            text("INSERT INTO employee_roles (employee_id, role) VALUES (:id, 'MANAGER')"),
            {"id": manager_id},
        )
    factory = sessionmaker(bind=engine)
    actor = Actor(manager_id, frozenset({"MANAGER"}), False, capability="employee.manage", scopes=("all",))
    outcome: list[str] = []

    def move() -> None:
        try:
            with factory() as session, session.begin():
                employees.update_employee(
                    session,
                    actor,
                    mover_id,
                    EmployeeUpdate(version=1, department_id=department_id),
                    now=NOW,
                )
            outcome.append("ok")
        except AppError as exc:
            outcome.append(exc.code)

    # Deactivation holds the department row lock (empty → allowed) while the move starts.
    with factory() as session, session.begin():
        departments.set_active(session, actor, department_id, active=False, version=1)
        session.flush()
        mover = threading.Thread(target=move)
        mover.start()
        wait_until_blocked_on_lock(engine)
    mover.join(timeout=30)

    with engine.connect() as conn:
        stranded = conn.execute(
            text(
                "SELECT count(*) FROM employees e JOIN departments d ON d.id = e.department_id"
                " WHERE e.is_active AND NOT d.is_active AND e.email LIKE '%@race-dept.smyou.vn'"
            )
        ).scalar_one()
    assert outcome == ["DEPARTMENT_INACTIVE"]
    assert stranded == 0
