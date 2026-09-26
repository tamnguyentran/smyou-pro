"""M1-01a: first-login password change (AC-AUTH-015…017)."""

import httpx2 as httpx
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection

from app.core.authz import require
from tests.integration.conftest import KHOA, REFRESH_COOKIE, employee_row, login, seed

NEW = "Khoa@SmYou9"


def add_probe(app: FastAPI) -> None:
    @app.get("/api/v1/probe", dependencies=[Depends(require("order.read"))])
    def probe() -> dict[str, bool]:
        return {"ok": True}


def change(client: TestClient, current: str, new: str) -> httpx.Response:
    return client.post(
        "/api/v1/auth/change-password", json={"current_password": current, "new_password": new}
    )


@pytest.mark.ac("AC-AUTH-015")
def test_pending_password_change_blocks_other_routes(app: FastAPI, db: Connection) -> None:
    seed(db, KHOA, must_change_password=True)
    add_probe(app)
    client = TestClient(app, raise_server_exceptions=False)

    res = login(client, KHOA.email, KHOA.password)
    assert res.status_code == 200
    assert res.json()["must_change_password"] is True

    blocked = client.get("/api/v1/probe")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PASSWORD_CHANGE_REQUIRED"
    assert blocked.json()["detail"] == "Bạn cần đổi mật khẩu trước khi tiếp tục."


@pytest.mark.ac("AC-AUTH-016")
def test_change_password_unlocks_and_signs_out_other_sessions(app: FastAPI, db: Connection) -> None:
    khoa = seed(db, KHOA, must_change_password=True)
    add_probe(app)
    phone = TestClient(app, raise_server_exceptions=False)
    laptop = TestClient(app, raise_server_exceptions=False)
    login(phone, KHOA.email, KHOA.password)
    login(laptop, KHOA.email, KHOA.password)

    res = change(phone, KHOA.password, NEW)

    assert res.status_code == 204
    assert REFRESH_COOKIE in res.cookies
    row = employee_row(db, khoa)
    assert row["must_change_password"] is False
    assert phone.get("/api/v1/probe").status_code == 200
    assert laptop.post("/api/v1/auth/refresh").status_code == 401
    assert laptop.get("/api/v1/probe").status_code == 401
    fresh = TestClient(app, raise_server_exceptions=False)
    assert login(fresh, KHOA.email, KHOA.password).status_code == 401
    assert login(fresh, KHOA.email, NEW).status_code == 200


@pytest.mark.ac("AC-AUTH-017")
@pytest.mark.parametrize(
    ("current", "new", "field", "message"),
    [
        ("sai-mat-khau", NEW, "current_password", "Mật khẩu hiện tại không đúng."),
        (KHOA.password, "Ngan#1", "new_password", "Mật khẩu cần ít nhất 8 ký tự."),
        (KHOA.password, KHOA.password, "new_password", "Mật khẩu mới phải khác mật khẩu hiện tại."),
        (KHOA.password, "Khoa.Tran2026", "new_password", "Mật khẩu không được chứa tên email."),
    ],
    ids=["wrong-current", "too-short", "same-as-current", "contains-email-name"],
)
def test_change_password_rules(
    app: FastAPI, db: Connection, current: str, new: str, field: str, message: str
) -> None:
    khoa = seed(db, KHOA, must_change_password=True)
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)

    res = change(client, current, new)

    assert res.status_code == 422
    assert res.json()["code"] == "VALIDATION_ERROR"
    assert {"field": field, "message": message} in [
        {"field": e["field"], "message": e["message"]} for e in res.json()["errors"]
    ]
    assert employee_row(db, khoa)["must_change_password"] is True


@pytest.mark.ac("AC-AUTH-017")
def test_change_password_requires_login(api: TestClient) -> None:
    assert change(api, "x" * 8, NEW).status_code == 401
