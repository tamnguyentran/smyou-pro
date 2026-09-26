"""M1-01a: refresh rotation, reuse detection, logout, and require() authentication (AC-AUTH-008…014)."""

import hashlib

import httpx2 as httpx
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import require
from tests.integration.conftest import (
    ACCESS_COOKIE,
    AN,
    KHOA,
    REFRESH_COOKIE,
    FakeClock,
    cookie_attrs,
    login,
    seed,
    set_cookies,
)


def refresh(client: TestClient) -> httpx.Response:
    return client.post("/api/v1/auth/refresh")


def session_row(db: Connection, raw_token: str) -> dict[str, object]:
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    row = db.execute(text("SELECT * FROM auth_sessions WHERE token_hash = :h"), {"h": token_hash})
    return dict(row.mappings().one())


def assert_cookies_cleared(response: httpx.Response) -> None:
    cookies = set_cookies(response)
    for name, path in ((ACCESS_COOKIE, "/"), (REFRESH_COOKIE, "/api/v1/auth")):
        attrs = cookie_attrs(cookies[name])
        assert attrs["max-age"] == "0", name
        assert attrs["path"] == path, name


def add_probe(app: FastAPI, capability: str) -> None:
    @app.get("/api/v1/probe", dependencies=[Depends(require(capability))])
    def probe() -> dict[str, bool]:
        return {"ok": True}


@pytest.mark.ac("AC-AUTH-008")
def test_refresh_rotates_the_token(api: TestClient, db: Connection) -> None:
    seed(db, AN)
    first = login(api, AN.email, AN.password)
    r1 = first.cookies[REFRESH_COOKIE]

    res = refresh(api)

    assert res.status_code == 200
    assert res.json()["employee"]["code"] == "NV001"
    r2 = res.cookies[REFRESH_COOKIE]
    assert r2 != r1
    assert res.cookies[ACCESS_COOKIE] != first.cookies[ACCESS_COOKIE]
    old = session_row(db, r1)
    assert old["revoked_at"] is not None
    assert old["replaced_by_id"] == session_row(db, r2)["id"]


@pytest.mark.ac("AC-AUTH-009")
def test_reusing_a_rotated_token_revokes_the_whole_session(
    app: FastAPI, api: TestClient, db: Connection
) -> None:
    seed(db, AN)
    r1 = login(api, AN.email, AN.password).cookies[REFRESH_COOKIE]
    r2 = refresh(api).cookies[REFRESH_COOKIE]

    thief = TestClient(app, raise_server_exceptions=False, cookies={REFRESH_COOKIE: r1})
    res = refresh(thief)

    assert res.status_code == 401
    assert res.json()["code"] == "SESSION_REVOKED"
    assert_cookies_cleared(res)
    assert session_row(db, r2)["revoked_at"] is not None
    assert refresh(api).status_code == 401


@pytest.mark.ac("AC-AUTH-010")
def test_missing_or_expired_refresh(api: TestClient, db: Connection, clock: FakeClock) -> None:
    missing = refresh(api)
    assert missing.status_code == 401
    assert missing.json()["code"] == "UNAUTHENTICATED"

    seed(db, AN)
    login(api, AN.email, AN.password)
    clock.advance(days=7, seconds=1)
    expired = refresh(api)
    assert expired.status_code == 401
    assert expired.json()["code"] == "UNAUTHENTICATED"
    assert_cookies_cleared(expired)


@pytest.mark.ac("AC-AUTH-011")
@pytest.mark.parametrize(
    "change",
    [
        "UPDATE employees SET is_active = false WHERE id = :id",
        "UPDATE employees SET password_changed_at = password_changed_at + interval '1 second' WHERE id = :id",
    ],
    ids=["deactivated", "password-changed"],
)
def test_refresh_refused_after_deactivation_or_password_change(
    api: TestClient, db: Connection, change: str
) -> None:
    an = seed(db, AN)
    login(api, AN.email, AN.password)
    db.execute(text(change), {"id": an})

    res = refresh(api)

    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHENTICATED"


@pytest.mark.ac("AC-AUTH-012")
def test_logout_revokes_and_clears(api: TestClient, db: Connection) -> None:
    seed(db, AN)
    r1 = login(api, AN.email, AN.password).cookies[REFRESH_COOKIE]

    res = api.post("/api/v1/auth/logout")

    assert res.status_code == 204
    assert_cookies_cleared(res)
    assert session_row(db, r1)["revoked_at"] is not None
    stale = TestClient(api.app, raise_server_exceptions=False, cookies={REFRESH_COOKIE: r1})
    assert refresh(stale).status_code == 401


@pytest.mark.ac("AC-AUTH-012")
def test_logout_without_session_is_idempotent(api: TestClient) -> None:
    assert api.post("/api/v1/auth/logout").status_code == 204


@pytest.mark.ac("AC-AUTH-013")
def test_require_authenticates_access_cookie(app: FastAPI, db: Connection, clock: FakeClock) -> None:
    an = seed(db, AN)
    add_probe(app, "order.read")
    client = TestClient(app, raise_server_exceptions=False)

    assert client.get("/api/v1/probe").status_code == 401  # no cookie
    login(client, AN.email, AN.password)
    assert client.get("/api/v1/probe").status_code == 200

    token = client.cookies[ACCESS_COOKIE]
    tampered = TestClient(app, raise_server_exceptions=False, cookies={ACCESS_COOKIE: token[:-2] + "xx"})
    res = tampered.get("/api/v1/probe")
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHENTICATED"
    assert res.json()["detail"] == "Vui lòng đăng nhập."

    clock.advance(minutes=15, seconds=1)
    assert client.get("/api/v1/probe").status_code == 401  # expired access token

    clock.advance(minutes=-15, seconds=-1)
    db.execute(text("UPDATE employees SET is_active = false WHERE id = :id"), {"id": an})
    assert client.get("/api/v1/probe").status_code == 401  # deactivated


@pytest.mark.ac("AC-AUTH-013")
def test_logout_invalidates_access_token_immediately(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    add_probe(app, "order.read")
    client = TestClient(app, raise_server_exceptions=False)
    login(client, AN.email, AN.password)
    access = client.cookies[ACCESS_COOKIE]

    client.post("/api/v1/auth/logout")

    replay = TestClient(app, raise_server_exceptions=False, cookies={ACCESS_COOKIE: access})
    assert replay.get("/api/v1/probe").status_code == 401


@pytest.mark.ac("AC-AUTH-014")
def test_missing_capability_is_403(app: FastAPI, db: Connection) -> None:
    seed(db, KHOA)
    add_probe(app, "catalog.manage")
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)

    res = client.get("/api/v1/probe")

    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN"
