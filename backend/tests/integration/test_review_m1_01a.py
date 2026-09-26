"""Review M1-01a: guessing the current password on change-password is limited like login (AC-AUTH-004/017)."""

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection

from app.core.authz import require
from tests.integration.conftest import KHOA, employee_row, login, seed


def guess(client: TestClient, current: str) -> int:
    body = {"current_password": current, "new_password": "Attacker#2026x"}
    return client.post("/api/v1/auth/change-password", json=body).status_code


@pytest.mark.ac("AC-AUTH-004")
def test_wrong_current_passwords_lock_the_account_and_end_sessions(app: FastAPI, db: Connection) -> None:
    khoa = seed(db, KHOA)

    @app.get("/api/v1/probe", dependencies=[Depends(require("order.read"))])
    def probe() -> dict[str, bool]:
        return {"ok": True}

    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)

    assert [guess(client, f"doan-{i}") for i in range(4)] == [422, 422, 422, 422]
    assert guess(client, "doan-5") == 423
    assert employee_row(db, khoa)["locked_until"] is not None
    assert client.get("/api/v1/probe").status_code == 401
    assert guess(client, KHOA.password) == 401
    assert login(TestClient(app), KHOA.email, KHOA.password).status_code == 423


@pytest.mark.ac("AC-AUTH-004")
def test_login_and_change_password_failures_share_one_counter(app: FastAPI, db: Connection) -> None:
    khoa = seed(db, KHOA, failed_login_count=3)
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)  # success resets the counter to 0
    for i in range(3):
        login(TestClient(app), KHOA.email, f"sai-{i}")
    assert employee_row(db, khoa)["failed_login_count"] == 3

    assert guess(client, "doan-1") == 422
    assert guess(client, "doan-2") == 423
