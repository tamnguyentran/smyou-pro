"""Review M1-05: reproduce the defects and coverage gaps found by the independent reviewers."""

import json
import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, insert, text

from app.modules.audit.models import AuditEvent
from tests.integration.conftest import AN, Person, login, seed

BINH = Person("binh.le@smyou.vn", "Binh@SmYou26", ("MANAGER",), "NV002", "Lê Văn Bình", "MANAGEMENT")
HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


@pytest.mark.ac("AC-SYS-065")
@pytest.mark.ac("AC-SYS-068")
def test_events_of_one_request_are_listed_in_the_order_they_happened(app: FastAPI, db: Connection) -> None:
    """The locking attempt writes login_failed then account_locked in one transaction; newest first
    must always show account_locked above login_failed (it was a coin flip on a random UUID)."""
    seed(db, BINH)
    people = [
        seed(
            db,
            Person(f"race{n}@smyou.vn", "Race@SmYou26", ("SALE",), f"NV9{n:02d}", f"Race {n}", "SALES"),
            failed_login_count=4,
        )
        for n in range(8)
    ]
    anonymous = TestClient(app, raise_server_exceptions=False)
    for n in range(8):
        assert login(anonymous, f"race{n}@smyou.vn", "sai-mat-khau").status_code == 401

    items = client_as(app, BINH).get("/api/v1/audit-events", params={"limit": "100"}).json()["items"]
    for employee_id in people:
        actions = [i["action"] for i in items if i["entity_id"] == str(employee_id)]
        assert actions == ["account_locked", "login_failed"], (employee_id, actions)


@pytest.mark.ac("AC-SYS-058")
def test_changed_fields_lists_only_fields_whose_value_changed(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    hoa = seed(db, HOA)  # phone is NULL, department SALES
    client = client_as(app, AN)

    res = client.patch(
        f"/api/v1/employees/{hoa}",
        json={"version": 1, "full_name": None, "phone": None, "department": "TECHNICAL"},
    )
    assert res.status_code == 200, res.text

    data = db.execute(
        text("SELECT data FROM audit_events WHERE entity_id = :id AND action = 'update'"), {"id": hoa}
    ).scalar_one()
    assert data == {"changed_fields": ["department"]}


@pytest.mark.ac("AC-SYS-057")
def test_create_audit_holds_only_roles_and_never_the_temporary_password(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    res = client_as(app, AN).post(
        "/api/v1/employees",
        json={
            "full_name": "Trần Thị Mai",
            "email": "mai.tran@smyou.vn",
            "department": "SALES",
            "roles": ["SALE"],
        },
    )
    assert res.status_code == 201, res.text
    new_id = res.json()["employee"]["id"]
    row = (
        db.execute(text("SELECT * FROM audit_events WHERE entity_id = :id"), {"id": new_id}).mappings().one()
    )
    assert set(row["data"]) == {"roles"}
    assert res.json()["temporary_password"] not in json.dumps(dict(row), default=str)


@pytest.mark.ac("AC-SYS-052")
def test_absent_data_is_sql_null_not_json_null(api: TestClient, db: Connection) -> None:
    an = seed(db, AN)
    assert login(api, AN.email, AN.password).status_code == 200
    is_null = db.execute(
        text("SELECT data IS NULL FROM audit_events WHERE entity_id = :id AND action = 'login'"), {"id": an}
    ).scalar_one()
    assert is_null is True


def _insert(db: Connection, *, day: int, entity_type: str, action: str, actor: uuid.UUID) -> None:
    db.execute(
        insert(AuditEvent.__table__).values(
            occurred_at=datetime(2026, 1, day, tzinfo=UTC),
            actor_id=actor,
            entity_type=entity_type,
            entity_id=uuid.uuid4(),
            action=action,
        )
    )


@pytest.mark.ac("AC-SYS-069")
def test_entity_type_filter_excludes_other_types(app: FastAPI, db: Connection) -> None:
    an = seed(db, AN)
    _insert(db, day=1, entity_type="EMPLOYEE", action="update", actor=an)
    _insert(db, day=2, entity_type="ORDER", action="submit", actor=an)  # a later module's row
    client = client_as(app, AN)

    res = client.get("/api/v1/audit-events", params={"entity_type": "EMPLOYEE", "actor_id": str(an)})
    assert res.status_code == 200, res.text
    assert {i["entity_type"] for i in res.json()["items"]} == {"EMPLOYEE"}
    assert "submit" not in {i["action"] for i in res.json()["items"]}


@pytest.mark.ac("AC-SYS-068")
def test_limit_and_offset_slice_the_newest_first_list(app: FastAPI, db: Connection) -> None:
    an = seed(db, AN)
    for day, action in enumerate(("a", "b", "c", "d"), start=1):
        _insert(db, day=day, entity_type="EMPLOYEE", action=action, actor=an)
    client = client_as(app, AN)  # adds a "login" row, the newest
    params = {"occurred_to": "2026-01-31"}

    res = client.get("/api/v1/audit-events", params={**params, "limit": "2", "offset": "1"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 4
    assert [i["action"] for i in body["items"]] == ["c", "b"]
    for bad in ({"limit": "0"}, {"offset": "-1"}):
        assert client.get("/api/v1/audit-events", params=bad).status_code == 422


@pytest.mark.ac("AC-SYS-065")
def test_change_password_lockout_names_the_signed_in_employee_as_actor(app: FastAPI, db: Connection) -> None:
    """Round 2: the employee is authenticated on this path, so the lock is not a "Hệ thống" action."""
    khoa = seed(
        db,
        Person("khoa.tran@smyou.vn", "TamThoi#14", ("TECHNICIAN",), "NV014", "Trần Minh Khoa", "TECHNICAL"),
    )
    client = client_as(
        app, Person("khoa.tran@smyou.vn", "TamThoi#14", ("TECHNICIAN",), "NV014", "", "TECHNICAL")
    )
    body = {"new_password": "Attacker#2026x"}
    statuses = [
        client.post(
            "/api/v1/auth/change-password", json={**body, "current_password": f"doan-{i}"}
        ).status_code
        for i in range(5)
    ]
    assert statuses[-1] == 423
    actor = db.execute(
        text("SELECT actor_id FROM audit_events WHERE entity_id = :id AND action = 'account_locked'"),
        {"id": khoa},
    ).scalar_one()
    assert actor == khoa
