"""M1-01a: secrets never leak — argon2id hashes, hashed refresh tokens, clean logs (AC-AUTH-019)."""

import hashlib
import logging
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import ACCESS_COOKIE, AN, KHOA, REFRESH_COOKIE, employee_row, login, seed


@pytest.mark.ac("AC-AUTH-019")
def test_passwords_are_argon2id(db: Connection, api: TestClient) -> None:
    khoa = seed(db, KHOA, must_change_password=True)
    login(api, KHOA.email, KHOA.password)
    api.post(
        "/api/v1/auth/change-password",
        json={"current_password": KHOA.password, "new_password": "Khoa@SmYou9"},
    )

    assert str(employee_row(db, khoa)["password_hash"]).startswith("$argon2id$")


@pytest.mark.ac("AC-AUTH-019")
def test_refresh_tokens_stored_only_as_sha256(db: Connection, api: TestClient) -> None:
    seed(db, AN)
    raw = login(api, AN.email, AN.password).cookies[REFRESH_COOKIE]

    stored = db.execute(text("SELECT token_hash FROM auth_sessions")).scalars().all()

    assert stored == [hashlib.sha256(raw.encode()).hexdigest()]
    assert re.fullmatch(r"[0-9a-f]{64}", stored[0])


@pytest.mark.ac("AC-AUTH-019")
def test_no_secret_in_logs_or_error_bodies(
    db: Connection, api: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    seed(db, AN)
    bodies = [
        login(api, AN.email, "sai-mat-khau-bi-mat").text,
        api.post("/api/v1/auth/login", json={"email": AN.email, "password": "p" * 129 + "LEAK"}).text,
    ]
    ok = login(api, AN.email, AN.password)
    secrets = [
        "sai-mat-khau-bi-mat",
        "LEAK",
        AN.password,
        ok.cookies[ACCESS_COOKIE],
        ok.cookies[REFRESH_COOKIE],
    ]
    api.post("/api/v1/auth/refresh")
    api.post("/api/v1/auth/logout")

    for secret in secrets:
        assert secret not in caplog.text
    for body in bodies:
        assert "sai-mat-khau-bi-mat" not in body
        assert "LEAK" not in body
