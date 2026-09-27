"""M1-05: audit_events written by identity/service.py's login and change_password (Q23,
AC-SYS-062…067). Reuses the exact scenarios already proven by M1-01a (AC-AUTH-001/002/004/005,
AC-AUTH-020's wrong-current-password lockout)."""

import json
import uuid
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.engine import Row

from tests.integration.conftest import AN, KHOA, employee_row, login, seed


def audit_rows(db: Connection, entity_id: uuid.UUID) -> list[Row]:
    return db.execute(
        text("SELECT * FROM audit_events WHERE entity_id = :id ORDER BY occurred_at, id"), {"id": entity_id}
    ).all()


def audit_count(db: Connection) -> int:
    return db.execute(text("SELECT count(*) FROM audit_events")).scalar_one()


def data_of(row: Row) -> dict[str, Any] | None:
    return row.data if row.data is None or isinstance(row.data, dict) else json.loads(row.data)


def guess_current_password(client: TestClient, current: str) -> int:
    body = {"current_password": current, "new_password": "Attacker#2026x"}
    return client.post("/api/v1/auth/change-password", json=body).status_code


@pytest.mark.ac("AC-SYS-062")
def test_login_success_audits_login(api: TestClient, db: Connection) -> None:
    an = seed(db, AN)

    res = login(api, AN.email, AN.password)
    assert res.status_code == 200, res.text

    [row] = audit_rows(db, an)
    assert row.action == "login"
    assert row.actor_id == an


@pytest.mark.ac("AC-SYS-063")
def test_wrong_password_audits_login_failed_with_null_actor(api: TestClient, db: Connection) -> None:
    an = seed(db, AN)

    res = login(api, AN.email, "sai-mat-khau")
    assert res.status_code == 401, res.text

    [row] = audit_rows(db, an)
    assert row.action == "login_failed"
    assert row.actor_id is None
    assert data_of(row) == {"reason": "invalid_password"}


@pytest.mark.ac("AC-SYS-064")
def test_unknown_email_writes_no_audit_row(api: TestClient, db: Connection) -> None:
    seed(db, AN)

    res = login(api, "khong-ton-tai@smyou.vn", "bat-ky")
    assert res.status_code == 401, res.text

    assert audit_count(db) == 0


@pytest.mark.ac("AC-SYS-065")
def test_fifth_login_failure_audits_account_locked_with_login_source(api: TestClient, db: Connection) -> None:
    an = seed(db, AN, failed_login_count=4)

    res = login(api, AN.email, "sai-mat-khau")
    assert res.status_code == 401, res.text

    rows = audit_rows(db, an)
    locked = [r for r in rows if r.action == "account_locked"]
    assert len(locked) == 1
    assert data_of(locked[0]) == {"failed_login_count": 5, "source": "login"}


@pytest.mark.ac("AC-SYS-065")
def test_fifth_wrong_current_password_audits_account_locked_with_change_password_source(
    app: FastAPI, db: Connection
) -> None:
    khoa = seed(db, KHOA)
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)

    statuses = [guess_current_password(client, f"doan-{i}") for i in range(4)]
    assert statuses == [422, 422, 422, 422]
    assert guess_current_password(client, "doan-5") == 423

    rows = audit_rows(db, khoa)
    locked = [r for r in rows if r.action == "account_locked"]
    assert len(locked) == 1
    assert data_of(locked[0]) == {"failed_login_count": 5, "source": "change_password"}


@pytest.mark.ac("AC-SYS-066")
def test_login_to_disabled_account_audits_login_refused(api: TestClient, db: Connection) -> None:
    khoa = seed(db, KHOA, is_active=False)

    res = login(api, KHOA.email, KHOA.password)
    assert res.status_code == 403, res.text

    [row] = audit_rows(db, khoa)
    assert row.action == "login_refused"
    assert data_of(row) == {"reason": "account_disabled"}


@pytest.mark.ac("AC-SYS-067")
def test_change_password_success_audits_password_changed(app: FastAPI, db: Connection) -> None:
    khoa = seed(db, KHOA)
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)

    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": KHOA.password, "new_password": "Khoa@SmYou9"},
    )
    assert res.status_code == 204, res.text

    rows = [r for r in audit_rows(db, khoa) if r.action == "password_changed"]
    assert len(rows) == 1
    row = rows[0]
    assert row.actor_id == khoa
    dumped = str(dict(row._mapping))
    assert "Khoa@SmYou9" not in dumped
    assert KHOA.password not in dumped
    assert employee_row(db, khoa)["password_changed_at"] is not None
