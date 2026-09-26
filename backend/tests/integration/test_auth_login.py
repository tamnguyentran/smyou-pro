"""M1-01a: login — credentials, lock-out, disabled accounts, validation (AC-AUTH-001…007)."""

from collections.abc import Callable
from datetime import timedelta

import argon2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection

from tests.integration.conftest import (
    ACCESS_COOKIE,
    AN,
    KHOA,
    REFRESH_COOKIE,
    FakeClock,
    cookie_attrs,
    employee_row,
    login,
    seed,
    set_cookies,
)

INVALID = {"code": "INVALID_CREDENTIALS", "detail": "Email hoặc mật khẩu không đúng."}


def problem(body: dict[str, object]) -> dict[str, object]:
    return {"status": body["status"], "code": body["code"], "detail": body["detail"]}


@pytest.mark.ac("AC-AUTH-001")
def test_login_success_sets_session_cookies(api: TestClient, db: Connection) -> None:
    an = seed(db, AN, failed_login_count=2)

    res = login(api, AN.email, AN.password)

    assert res.status_code == 200
    body = res.json()
    assert body == {
        "employee": {"id": str(an), "code": "NV001", "full_name": "Nguyễn Văn An", "roles": ["MANAGER"]},
        "must_change_password": False,
    }
    assert "password" not in res.text
    cookies = set_cookies(res)
    access, refresh = cookie_attrs(cookies[ACCESS_COOKIE]), cookie_attrs(cookies[REFRESH_COOKIE])
    for attrs in (access, refresh):
        assert "httponly" in attrs
        assert attrs["samesite"].lower() == "lax"
        assert "secure" not in attrs  # COOKIE_SECURE is off in dev/test
    assert access["path"] == "/"
    assert access["max-age"] == "900"
    assert refresh["path"] == "/api/v1/auth"
    assert refresh["max-age"] == str(7 * 24 * 3600)
    assert employee_row(db, an)["failed_login_count"] == 0


@pytest.mark.ac("AC-AUTH-001")
def test_cookies_follow_base_path_and_secure_flag(auth_app: Callable[..., FastAPI], db: Connection) -> None:
    seed(db, AN)
    client = TestClient(auth_app(base_path="/smyoutask", cookie_secure="true"), base_url="https://testserver")

    res = login(client, AN.email, AN.password)

    cookies = set_cookies(res)
    access, refresh = cookie_attrs(cookies[ACCESS_COOKIE]), cookie_attrs(cookies[REFRESH_COOKIE])
    assert access["path"] == "/smyoutask/"
    assert refresh["path"] == "/smyoutask/api/v1/auth"
    assert "secure" in access
    assert "secure" in refresh


@pytest.mark.ac("AC-AUTH-002")
def test_wrong_password_is_rejected_and_counted(api: TestClient, db: Connection) -> None:
    an = seed(db, AN)

    res = login(api, AN.email, "sai-mat-khau")

    assert res.status_code == 401
    assert problem(res.json()) == {"status": 401, **INVALID}
    assert "set-cookie" not in res.headers
    assert employee_row(db, an)["failed_login_count"] == 1


@pytest.mark.ac("AC-AUTH-003")
def test_unknown_email_looks_exactly_like_wrong_password(
    api: TestClient, db: Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    seed(db, AN)
    calls: list[str] = []
    original = argon2.PasswordHasher.verify

    def spy(self: argon2.PasswordHasher, hash_: str, password: str) -> bool:
        calls.append("verify")
        return original(self, hash_, password)

    wrong = login(api, AN.email, "sai-mat-khau")
    monkeypatch.setattr(argon2.PasswordHasher, "verify", spy)
    unknown = login(api, "ai.do@smyou.vn", "sai-mat-khau")

    assert unknown.status_code == wrong.status_code == 401
    assert problem(unknown.json()) == problem(wrong.json())
    assert set(unknown.json()) == set(wrong.json())
    assert calls, "no argon2 verification ran for an unknown email (timing leak)"


@pytest.mark.ac("AC-AUTH-004")
def test_fifth_failure_locks_for_15_minutes(api: TestClient, db: Connection, clock: FakeClock) -> None:
    an = seed(db, AN, failed_login_count=4)

    fifth = login(api, AN.email, "sai-mat-khau")
    assert fifth.status_code == 401
    assert employee_row(db, an)["locked_until"] == clock.now + timedelta(minutes=15)

    clock.advance(minutes=14, seconds=59)
    locked = login(api, AN.email, AN.password)
    assert locked.status_code == 423
    assert problem(locked.json()) == {
        "status": 423,
        "code": "ACCOUNT_LOCKED",
        "detail": "Tài khoản tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau 15 phút.",
    }
    assert "set-cookie" not in locked.headers

    clock.advance(seconds=2)
    ok = login(api, AN.email, AN.password)
    assert ok.status_code == 200
    assert employee_row(db, an)["failed_login_count"] == 0


@pytest.mark.ac("AC-AUTH-005")
def test_disabled_account(api: TestClient, db: Connection) -> None:
    seed(db, KHOA, is_active=False)

    right = login(api, KHOA.email, KHOA.password)
    assert right.status_code == 403
    assert problem(right.json()) == {
        "status": 403,
        "code": "ACCOUNT_DISABLED",
        "detail": "Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản lý.",
    }
    assert "set-cookie" not in right.headers

    wrong = login(api, KHOA.email, "sai-mat-khau")
    assert wrong.status_code == 401
    assert problem(wrong.json()) == {"status": 401, **INVALID}


@pytest.mark.ac("AC-AUTH-006")
def test_email_is_case_insensitive_and_trimmed(api: TestClient, db: Connection) -> None:
    seed(db, AN)
    assert login(api, "  An.Nguyen@SMYOU.vn ", AN.password).status_code == 200


@pytest.mark.ac("AC-AUTH-007")
@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"password": "SmYou@2026"}, "email"),
        ({"email": "an.nguyen@smyou.vn"}, "password"),
        ({"email": "khong-phai-email", "password": "SmYou@2026"}, "email"),
        ({"email": "an.nguyen@smyou.vn", "password": "x" * 129}, "password"),
    ],
)
def test_invalid_payload_is_422_and_not_counted(
    api: TestClient, db: Connection, payload: dict[str, str], field: str
) -> None:
    an = seed(db, AN)

    res = api.post("/api/v1/auth/login", json=payload)

    assert res.status_code == 422
    assert res.json()["code"] == "VALIDATION_ERROR"
    assert field in [e["field"] for e in res.json()["errors"]]
    assert employee_row(db, an)["failed_login_count"] == 0
