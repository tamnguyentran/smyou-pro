"""M1-04a: two Managers demoting / deactivating each other at the same moment (AC-EMP-008).

Runs real, committed, parallel transactions (not the rolled-back test transaction), so it creates
and deletes its own rows.
"""

import threading
import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.authz import Actor
from app.core.errors import AppError
from app.modules.employees import service
from tests.conftest import TEST_DATABASE_URL

NOW = datetime(2026, 9, 26, 2, 0, tzinfo=UTC)


@pytest.fixture
def engine(migrated: None) -> Iterator[Engine]:
    engine = create_engine(TEST_DATABASE_URL, pool_size=4)
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM employees WHERE email LIKE '%@race.smyou.vn'"))
        engine.dispose()


def two_managers(engine: Engine) -> tuple[uuid.UUID, uuid.UUID]:
    ids = (uuid.uuid4(), uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM employees WHERE email LIKE '%@race.smyou.vn'"))
        for n, employee_id in enumerate(ids, start=1):
            conn.execute(
                text(
                    "INSERT INTO employees (id, code, full_name, email, department, password_hash)"
                    " VALUES (:id, :code, :name, :email, 'MANAGEMENT', 'x')"
                ),
                {
                    "id": employee_id,
                    "code": f"RACE{n}",
                    "name": f"Manager {n}",
                    "email": f"m{n}@race.smyou.vn",
                },
            )
            conn.execute(
                text("INSERT INTO employee_roles (employee_id, role) VALUES (:id, 'MANAGER')"),
                {"id": employee_id},
            )
    return ids


def race(engine: Engine, attempt: Callable[[Session, Actor, uuid.UUID], object]) -> list[str]:
    """Each manager acts on the other at the same moment; returns 'ok' or the error code per side."""
    a, b = two_managers(engine)
    factory = sessionmaker(bind=engine)
    barrier = threading.Barrier(2)
    results: list[str] = []
    lock = threading.Lock()

    def run(me: uuid.UUID, other: uuid.UUID) -> None:
        # capability/scopes as require("employee.manage") would set them (MANAGER: all)
        actor = Actor(me, frozenset({"MANAGER"}), False, capability="employee.manage", scopes=("all",))
        outcome = "ok"
        barrier.wait()
        try:
            with factory() as session, session.begin():
                attempt(session, actor, other)
        except AppError as exc:
            outcome = exc.code
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=run, args=pair) for pair in ((a, b), (b, a))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    with engine.connect() as conn:
        active_managers = conn.execute(
            text(
                "SELECT count(*) FROM employees e JOIN employee_roles r ON r.employee_id = e.id"
                " WHERE r.role = 'MANAGER' AND e.is_active AND e.email LIKE '%@race.smyou.vn'"
            )
        ).scalar_one()
    assert active_managers == 1, results
    return sorted(results)


@pytest.mark.ac("AC-EMP-008")
@pytest.mark.parametrize("round_", range(5))
def test_mutual_demotion_leaves_exactly_one_manager(engine: Engine, round_: int) -> None:
    results = race(
        engine,
        lambda session, actor, other: service.set_roles(
            session, actor, other, version=1, roles=["SALE"], now=NOW
        ),
    )
    assert results == ["LAST_MANAGER", "ok"]


@pytest.mark.ac("AC-EMP-008")
@pytest.mark.parametrize("round_", range(5))
def test_mutual_deactivation_leaves_exactly_one_manager(engine: Engine, round_: int) -> None:
    results = race(
        engine,
        lambda session, actor, other: service.deactivate(session, actor, other, version=1, now=NOW),
    )
    assert results == ["LAST_MANAGER", "ok"]
