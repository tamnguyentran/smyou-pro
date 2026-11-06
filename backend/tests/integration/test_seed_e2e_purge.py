"""M21-07: `seed_e2e` purges the employees that e2e runs create (AC-SYS-148..153).

Every test first runs the real `seed_e2e.main()` on the rolled-back test transaction, so the E2E
fixtures (accounts E2E01-E2E16, order E2E-DH-M501…) exist exactly as `make e2e` leaves them.
"""

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.orm import Session, sessionmaker

from app.modules.departments.models import STANDARD_DEPARTMENT_IDS
from scripts import seed_e2e
from tests.integration.conftest import FakeClock, login

E2E_MANAGER = ("an.e2e", "E2e@SmYou2026")
FIXTURE_EMAILS = [email for email, *_ in seed_e2e.ACCOUNTS]
ECONOMIC = str(STANDARD_DEPARTMENT_IDS["ECONOMIC"])


@pytest.fixture
def session_factory(db: Connection) -> sessionmaker[Session]:
    return sessionmaker(bind=db, join_transaction_mode="create_savepoint", expire_on_commit=False)


@pytest.fixture
def seeded(
    db: Connection,
    session_factory: sessionmaker[Session],
    clock: FakeClock,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    assert seed_e2e.main(session_factory=session_factory) == 0
    # seed_e2e stamps password_changed_at with the real time; sign in after it
    clock.now = datetime.now(UTC) + timedelta(minutes=1)


@pytest.fixture
def manager(api: TestClient, seeded: None) -> TestClient:
    assert login(api, *E2E_MANAGER).status_code == 200
    return api


def create(client: TestClient, full_name: str, role: str, **extra: str) -> uuid.UUID:
    res = client.post(
        "/api/v1/employees",
        json={"full_name": full_name, "department_id": ECONOMIC, "roles": [role], **extra},
    )
    assert res.status_code == 201, res.text
    return uuid.UUID(res.json()["employee"]["id"])


def employee_ids(db: Connection) -> set[uuid.UUID]:
    return set(db.execute(text("SELECT id FROM employees")).scalars())


def count(db: Connection, sql: str, ids: list[uuid.UUID]) -> int:
    return int(db.execute(text(sql), {"ids": ids}).scalar_one())


def fixture_id(db: Connection, email: str) -> uuid.UUID:
    return db.execute(text("SELECT id FROM employees WHERE email = :e"), {"e": email}).scalar_one()


def purge(session_factory: sessionmaker[Session]) -> seed_e2e.PurgeResult:
    with session_factory() as session, session.begin():
        return seed_e2e.purge_test_employees(session)


def three_test_employees(db: Connection, client: TestClient) -> list[uuid.UUID]:
    kpi = create(client, "Nhân viên KPI mobile 17", "SALE")
    khoa = create(client, "Phạm Văn Khoa desktop 1730000000000", "TECHNICIAN", phone="0912345678")
    qa = create(client, "QA mobile", "SALE", email="qa.mobile.1730000000000@smyou.vn")
    an_id = fixture_id(db, "an.e2e@smyou.vn")
    db.execute(
        text(
            "INSERT INTO employee_kpi_targets (employee_id, month, net_revenue_target, updated_by)"
            " VALUES (:id, date_trunc('month', now())::date, 50000000, :by)"
        ),
        {"id": kpi, "by": an_id},
    )
    now = datetime.now(UTC)
    db.execute(
        text(
            "INSERT INTO auth_sessions (employee_id, family_id, token_hash, password_changed_at,"
            " created_at, expires_at) VALUES (:id, :fam, :hash, :now, :now, :exp)"
        ),
        {"id": qa, "fam": uuid.uuid4(), "hash": uuid.uuid4().hex, "now": now, "exp": now + timedelta(days=1)},
    )
    db.execute(
        text(
            "INSERT INTO notifications (recipient_id, type, title, body, entity_type, entity_id)"
            " VALUES (:id, 'ORDER_SUBMITTED', 'Đơn mới', 'Đơn DH2611-0001 chờ điều phối', 'ORDER', :e)"
        ),
        {"id": qa, "e": uuid.uuid4()},
    )
    return [kpi, khoa, qa]


@pytest.mark.ac("AC-SYS-148")
def test_purges_employees_created_by_e2e_accounts_with_dependents(
    db: Connection, manager: TestClient, session_factory: sessionmaker[Session]
) -> None:
    ids = three_test_employees(db, manager)
    dependents = [
        "SELECT count(*) FROM employee_roles WHERE employee_id = ANY(:ids)",
        "SELECT count(*) FROM auth_sessions WHERE employee_id = ANY(:ids)",
        "SELECT count(*) FROM notifications WHERE recipient_id = ANY(:ids)",
        "SELECT count(*) FROM employee_kpi_targets WHERE employee_id = ANY(:ids)",
        "SELECT count(*) FROM audit_events WHERE entity_type = 'EMPLOYEE' AND entity_id = ANY(:ids)",
    ]
    for sql in dependents:
        assert count(db, sql, ids) > 0, f"precondition: {sql}"

    result = purge(session_factory)

    assert (result.purged, result.kept) == (3, 0)
    assert employee_ids(db).isdisjoint(ids)
    for sql in dependents:
        assert count(db, sql, ids) == 0, sql


@pytest.mark.ac("AC-SYS-149")
def test_keeps_every_fixture_account(
    db: Connection, manager: TestClient, session_factory: sessionmaker[Session]
) -> None:
    three_test_employees(db, manager)
    hoa = fixture_id(db, "hoa.e2e@smyou.vn")
    an_id = fixture_id(db, "an.e2e@smyou.vn")
    # worst case: a fixture that an e2e test edited/"created" through the API
    db.execute(
        text(
            "INSERT INTO audit_events (actor_id, entity_type, entity_id, action)"
            " VALUES (:a, 'EMPLOYEE', :e, 'create')"
        ),
        {"a": an_id, "e": hoa},
    )
    db.execute(
        text(
            "INSERT INTO employee_kpi_targets (employee_id, month, net_revenue_target, updated_by)"
            " VALUES (:id, date_trunc('month', now())::date, 80000000, :by)"
        ),
        {"id": hoa, "by": an_id},
    )
    before = db.execute(
        text(
            "SELECT e.email, e.id, r.role FROM employees e JOIN employee_roles r ON r.employee_id = e.id"
            " WHERE e.email = ANY(:emails) ORDER BY e.email, r.role"
        ),
        {"emails": FIXTURE_EMAILS},
    ).all()

    purge(session_factory)

    after = db.execute(
        text(
            "SELECT e.email, e.id, r.role FROM employees e JOIN employee_roles r ON r.employee_id = e.id"
            " WHERE e.email = ANY(:emails) ORDER BY e.email, r.role"
        ),
        {"emails": FIXTURE_EMAILS},
    ).all()
    assert after == before
    assert {row.email for row in after} == set(FIXTURE_EMAILS)
    assert count(db, "SELECT count(*) FROM employee_kpi_targets WHERE employee_id = ANY(:ids)", [hoa]) == 1


@pytest.mark.ac("AC-SYS-150")
def test_keeps_employees_not_created_by_e2e_accounts(
    db: Connection, seeded: None, session_factory: sessionmaker[Session]
) -> None:
    owner_manager, hung, be = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    for emp_id, code, name, email in [
        (owner_manager, "NV900", "Nguyễn Thanh Tâm", "tam.manager@smyou.vn"),
        (hung, "NV901", "Nguyễn Văn Hùng", "kythuat1@smyou.vn"),
        (be, "NV902", "Trần Thị Bé", None),
    ]:
        db.execute(
            text(
                "INSERT INTO employees (id, code, full_name, email, username, department_id, password_hash)"
                " VALUES (:id, :code, :name, :email, :username, :dept, 'x')"
            ),
            {
                "id": emp_id,
                "code": code,
                "name": name,
                "email": email,
                "username": code.lower(),
                "dept": ECONOMIC,
            },
        )
    db.execute(
        text(
            "INSERT INTO audit_events (actor_id, entity_type, entity_id, action)"
            " VALUES (:a, 'EMPLOYEE', :e, 'create')"
        ),
        {"a": owner_manager, "e": hung},
    )

    result = purge(session_factory)

    assert result.purged == 0
    assert {owner_manager, hung, be} <= employee_ids(db)
    assert count(db, "SELECT count(*) FROM audit_events WHERE entity_id = ANY(:ids)", [hung]) == 1


@pytest.mark.ac("AC-SYS-151")
def test_keeps_test_employee_still_referenced(
    db: Connection, manager: TestClient, session_factory: sessionmaker[Session]
) -> None:
    others = three_test_employees(db, manager)
    kim = create(manager, "Kim Yến desktop 1730000000001", "TECHNICIAN")
    assignment = db.execute(
        text(
            "SELECT a.id FROM assignments a JOIN tasks t ON t.id = a.task_id"
            " JOIN orders o ON o.id = t.order_id WHERE o.code = 'E2E-DH-M501' LIMIT 1"
        )
    ).scalar_one()
    db.execute(text("UPDATE assignments SET employee_id = :k WHERE id = :a"), {"k": kim, "a": assignment})

    result = purge(session_factory)

    assert (result.purged, result.kept) == (3, 1)
    assert kim in employee_ids(db)
    assert employee_ids(db).isdisjoint(others)
    assert (
        db.execute(text("SELECT employee_id FROM assignments WHERE id = :a"), {"a": assignment}).scalar_one()
        == kim
    )


@pytest.mark.ac("AC-SYS-152")
def test_second_purge_is_a_no_op(
    db: Connection, manager: TestClient, session_factory: sessionmaker[Session]
) -> None:
    three_test_employees(db, manager)
    purge(session_factory)
    before = employee_ids(db)

    result = purge(session_factory)

    assert (result.purged, result.kept) == (0, 0)
    assert employee_ids(db) == before


@pytest.mark.ac("AC-SYS-153")
def test_main_reports_purge_and_is_idempotent(
    db: Connection,
    manager: TestClient,
    session_factory: sessionmaker[Session],
    capsys: pytest.CaptureFixture[str],
) -> None:
    three_test_employees(db, manager)
    total_before = len(employee_ids(db))
    capsys.readouterr()

    assert seed_e2e.main(session_factory=session_factory) == 0
    first = capsys.readouterr().out
    total_after = len(employee_ids(db))
    assert seed_e2e.main(session_factory=session_factory) == 0
    second = capsys.readouterr().out

    assert "seed_e2e: purged 3 test employees (kept 0 still referenced)" in first
    assert "seed_e2e: purged 0 test employees (kept 0 still referenced)" in second
    assert total_after < total_before
    assert len(employee_ids(db)) == total_after
