"""M1-05: audit_events written by employees/service.py commands (Q38) and the framework's
atomicity guarantee (AC-SYS-052…053, AC-SYS-057…061).
"""

import json
import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.engine import Row

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


def audit_rows(db: Connection, entity_id: uuid.UUID) -> list[Row]:
    return db.execute(
        text("SELECT * FROM audit_events WHERE entity_id = :id ORDER BY occurred_at, id"), {"id": entity_id}
    ).all()


def audit_count(db: Connection) -> int:
    return db.execute(text("SELECT count(*) FROM audit_events")).scalar_one()


@pytest.mark.ac("AC-SYS-052")
def test_record_participates_in_the_callers_transaction_and_carries_the_request_id(
    app: FastAPI, db: Connection
) -> None:
    an = seed(db, AN)
    hoa = seed(db, HOA)
    client = client_as(app, AN)

    res = client.patch(
        f"/api/v1/employees/{hoa}",
        json={"version": 1, "phone": "0932068787"},
        headers={"X-Request-Id": "test-req-1"},
    )
    assert res.status_code == 200, res.text

    [row] = audit_rows(db, hoa)
    assert row.actor_id == an
    assert row.action == "update"
    assert row.request_id == "test-req-1"
    assert abs((row.occurred_at.replace(tzinfo=UTC) - datetime.now(UTC)).total_seconds()) < 10


@pytest.mark.ac("AC-SYS-053")
def test_failed_create_writes_no_audit_row(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    seed(db, HOA)
    client = client_as(app, AN)  # logging in itself audits a "login" row (AC-SYS-062)
    baseline = audit_count(db)

    res = client.post(
        "/api/v1/employees",
        json={
            "full_name": "Trùng Email",
            "email": HOA.email.upper(),
            "department": "SALES",
            "roles": ["SALE"],
        },
    )

    assert res.status_code == 409, res.text
    assert audit_count(db) == baseline


@pytest.mark.ac("AC-SYS-057")
def test_create_employee_audits_create(app: FastAPI, db: Connection) -> None:
    an = seed(db, AN)
    client = client_as(app, AN)

    res = client.post(
        "/api/v1/employees",
        json={
            "full_name": "Trần Thị Mai",
            "email": "mai.tran@smyou.vn",
            "department": "SALES",
            "roles": ["SALE"],
        },
    )
    assert res.status_code == 201, res.text
    new_id = uuid.UUID(res.json()["employee"]["id"])

    [row] = audit_rows(db, new_id)
    assert row.entity_type == "EMPLOYEE"
    assert row.action == "create"
    assert row.actor_id == an
    assert row.from_status is None
    assert row.to_status is None
    payload = row.data if isinstance(row.data, dict) else json.loads(row.data)
    assert payload["roles"] == ["SALE"]
    dumped = json.dumps(dict(row._mapping), default=str)
    assert "password" not in dumped.lower()


@pytest.mark.ac("AC-SYS-058")
def test_update_employee_audits_changed_fields(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    hoa = seed(db, HOA)
    client = client_as(app, AN)

    res = client.patch(
        f"/api/v1/employees/{hoa}", json={"version": 1, "phone": "0932068787", "department": "TECHNICAL"}
    )
    assert res.status_code == 200, res.text

    [row] = audit_rows(db, hoa)
    assert row.action == "update"
    payload = row.data if isinstance(row.data, dict) else json.loads(row.data)
    assert sorted(payload["changed_fields"]) == ["department", "phone"]


@pytest.mark.ac("AC-SYS-059")
def test_set_roles_audits_before_and_after(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    hoa = seed(db, HOA)
    client = client_as(app, AN)

    res = client.post(f"/api/v1/employees/{hoa}/roles", json={"version": 1, "roles": ["SALE", "TECHNICIAN"]})
    assert res.status_code == 200, res.text

    [row] = audit_rows(db, hoa)
    assert row.action == "roles"
    payload = row.data if isinstance(row.data, dict) else json.loads(row.data)
    assert payload == {"roles_before": ["SALE"], "roles_after": ["SALE", "TECHNICIAN"]}


@pytest.mark.ac("AC-SYS-060")
def test_deactivate_then_activate_audits_status_transitions(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    khoa = seed(db, KHOA)
    client = client_as(app, AN)

    deactivate = client.post(f"/api/v1/employees/{khoa}/deactivate", json={"version": 1})
    assert deactivate.status_code == 200, deactivate.text
    activate = client.post(f"/api/v1/employees/{khoa}/activate", json={"version": 2})
    assert activate.status_code == 200, activate.text

    rows = audit_rows(db, khoa)
    assert len(rows) == 2
    by_action = {row.action: row for row in rows}
    assert by_action["deactivate"].from_status == "ACTIVE"
    assert by_action["deactivate"].to_status == "INACTIVE"
    assert by_action["activate"].from_status == "INACTIVE"
    assert by_action["activate"].to_status == "ACTIVE"


@pytest.mark.ac("AC-SYS-061")
def test_reset_password_audit_never_contains_a_password(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    khoa = seed(db, KHOA)
    client = client_as(app, AN)

    res = client.post(f"/api/v1/employees/{khoa}/reset-password", json={"version": 1})
    assert res.status_code == 200, res.text
    temporary_password = res.json()["temporary_password"]

    [row] = audit_rows(db, khoa)
    assert row.action == "reset-password"
    assert row.data is None
    dumped = json.dumps(dict(row._mapping), default=str)
    assert temporary_password not in dumped


@pytest.mark.ac("AC-SYS-055")
def test_only_get_methods_exist_on_audit_routes(app: FastAPI) -> None:
    audit_routes = [(m, p) for m, p, _cap in declared_routes(app) if p.startswith("/api/v1/audit-events")]
    assert audit_routes, "expected the audit-events route to be registered"
    assert {m for m, _p in audit_routes} == {"GET"}


@pytest.mark.ac("AC-SYS-056")
def test_audit_events_route_declares_audit_read(app: FastAPI) -> None:
    routes = declared_routes(app)
    assert ("GET", "/api/v1/audit-events", "audit.read") in routes
