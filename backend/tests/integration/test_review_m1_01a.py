"""Review M1-01a: change-password guessing is limited like login; sharper evidence for other ACs."""

import logging
from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, event, text
from sqlalchemy.orm import sessionmaker
from starlette.types import Message, Receive, Scope, Send

from app.core.authz import Actor, require
from app.core.config import Settings
from app.modules.identity import service
from app.modules.identity.models import Employee
from tests.integration.conftest import AN, KHOA, FakeClock, employee_row, login, seed


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


# ---- test-auditor findings: sharper evidence for existing ACs ----


@pytest.mark.ac("AC-AUTH-019")
def test_new_password_hashes_are_argon2id(app: FastAPI, db: Connection) -> None:
    khoa = seed(db, KHOA, must_change_password=True)
    seeded_hash = employee_row(db, khoa)["password_hash"]
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)

    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": KHOA.password, "new_password": "Khoa@SmYou9"},
    )

    assert res.status_code == 204
    new_hash = str(employee_row(db, khoa)["password_hash"])
    assert new_hash != seeded_hash
    assert new_hash.startswith("$argon2id$")


@pytest.mark.ac("AC-AUTH-019")
def test_logs_exist_but_hold_no_secret_and_422_bodies_do_not_echo(
    app: FastAPI, db: Connection, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    seed(db, KHOA, must_change_password=True)
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)
    body = client.post(
        "/api/v1/auth/change-password", json={"current_password": KHOA.password, "new_password": "ngan-LEAK"}
    ).text

    assert "login succeeded" in caplog.text
    assert "ngan-LEAK" not in body
    assert KHOA.password not in body
    assert KHOA.password not in caplog.text


@pytest.mark.ac("AC-AUTH-004")
def test_fifth_failure_body_is_the_generic_one(api: TestClient, db: Connection) -> None:
    seed(db, KHOA, failed_login_count=4)
    res = login(api, KHOA.email, "sai")
    assert res.status_code == 401
    assert res.json()["code"] == "INVALID_CREDENTIALS"
    assert res.json()["detail"] == "Email hoặc mật khẩu không đúng."


@pytest.mark.ac("AC-AUTH-004")
def test_successful_login_resets_a_nonzero_counter(api: TestClient, db: Connection, clock: FakeClock) -> None:
    khoa = seed(db, KHOA, failed_login_count=4)
    login(api, KHOA.email, "sai")
    clock.advance(minutes=16)
    login(api, KHOA.email, "sai")
    assert employee_row(db, khoa)["failed_login_count"] == 1
    assert login(api, KHOA.email, KHOA.password).status_code == 200
    assert employee_row(db, khoa)["failed_login_count"] == 0


@pytest.mark.ac("AC-AUTH-016")
def test_current_session_keeps_working_after_password_change(app: FastAPI, db: Connection) -> None:
    seed(db, KHOA, must_change_password=True)
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)
    body = {"current_password": KHOA.password, "new_password": "Khoa@SmYou9"}
    assert client.post("/api/v1/auth/change-password", json=body).status_code == 204
    assert client.post("/api/v1/auth/refresh").status_code == 200


@pytest.mark.ac("AC-AUTH-010")
def test_missing_refresh_cookie_also_clears_cookies(api: TestClient) -> None:
    res = api.post("/api/v1/auth/refresh")
    assert res.status_code == 401
    cleared = [h for h in res.headers.get_list("set-cookie") if "max-age=0" in h.lower()]
    assert len(cleared) == 2


@pytest.mark.ac("AC-AUTH-007")
@pytest.mark.parametrize(
    ("payload", "status"),
    [
        ({"email": "", "password": "x"}, 422),
        ({"email": "khoa.tran@smyou.vn", "password": ""}, 422),
        ({"email": "khoa.tran@smyou.vn", "password": "x" * 128}, 401),
    ],
    ids=["empty-email", "empty-password", "128-chars-accepted"],
)
def test_login_payload_edges(api: TestClient, db: Connection, payload: dict[str, str], status: int) -> None:
    seed(db, KHOA)
    assert api.post("/api/v1/auth/login", json=payload).status_code == status


@pytest.mark.ac("AC-AUTH-014")
def test_role_holding_the_capability_passes(app: FastAPI, db: Connection) -> None:
    seed(db, AN)

    @app.get("/api/v1/probe-catalog", dependencies=[Depends(require("catalog.manage"))])
    def probe() -> dict[str, bool]:
        return {"ok": True}

    client = TestClient(app, raise_server_exceptions=False)
    login(client, AN.email, AN.password)
    assert client.get("/api/v1/probe-catalog").status_code == 200


@pytest.mark.ac("AC-AUTH-015")
def test_refresh_and_logout_work_while_password_change_is_pending(app: FastAPI, db: Connection) -> None:
    seed(db, KHOA, must_change_password=True)
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)
    assert client.post("/api/v1/auth/refresh").status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204


# ---- code-review findings ----


@pytest.mark.ac("AC-AUTH-016")
def test_transaction_commits_before_the_response_is_sent(app: FastAPI, db: Connection) -> None:
    """Else a client acting on new cookies races the commit, or keeps cookies the DB never saved."""
    seed(db, KHOA)
    events: list[str] = []
    event.listen(app.state.session_factory, "after_commit", lambda _session: events.append("commit"))

    async def recording(scope: Scope, receive: Receive, send: Send) -> None:
        async def spy(message: Message) -> None:
            if message["type"] == "http.response.start":
                events.append("response-start")
            await send(message)

        await app(scope, receive, spy)

    res = login(TestClient(recording), KHOA.email, KHOA.password)

    assert res.status_code == 200
    assert events.index("commit") < events.index("response-start"), events


# ---- AC-AUTH-020 (Q25): change-password guessing limit, approved after security review ----


def _probe(app: FastAPI) -> None:
    @app.get("/api/v1/probe-020", dependencies=[Depends(require("order.read"))])
    def probe() -> dict[str, bool]:
        return {"ok": True}


@pytest.mark.ac("AC-AUTH-020")
def test_queued_change_after_lockout_is_refused(api: TestClient, db: Connection, clock: FakeClock) -> None:
    """A request that authenticated before the lock-out committed must not change the password afterwards."""
    khoa = seed(db, KHOA)
    login(api, KHOA.email, KHOA.password)
    family = db.execute(
        text("SELECT family_id FROM auth_sessions WHERE employee_id = :id"), {"id": khoa}
    ).scalar_one()
    # The 5th wrong guess commits: account locked, every session revoked.
    db.execute(
        text("UPDATE employees SET locked_until = :until WHERE id = :id"),
        {"until": clock() + timedelta(minutes=15), "id": khoa},
    )
    db.execute(
        text("UPDATE auth_sessions SET revoked_at = :now WHERE employee_id = :id"),
        {"now": clock(), "id": khoa},
    )
    before = employee_row(db, khoa)["password_hash"]

    session = sessionmaker(bind=db, join_transaction_mode="create_savepoint")()
    actor = Actor(id=khoa, roles=frozenset({"TECHNICIAN"}), must_change_password=False, session_family=family)
    with session.begin():
        result = service.change_password(
            session,
            actor,
            current_password=KHOA.password,
            new_password="Attacker#Owns1",
            now=clock(),
            settings=Settings(),
            user_agent="queued",
        )

    assert result == service.Failure.UNAUTHENTICATED
    assert employee_row(db, khoa)["password_hash"] == before


@pytest.mark.ac("AC-AUTH-020")
def test_login_lockout_does_not_sign_out_sessions_in_use(app: FastAPI, db: Connection) -> None:
    seed(db, KHOA)
    _probe(app)
    phone = TestClient(app, raise_server_exceptions=False)
    login(phone, KHOA.email, KHOA.password)

    stranger = TestClient(app, raise_server_exceptions=False)
    assert [login(stranger, KHOA.email, f"sai-{i}").status_code for i in range(5)] == [401] * 5

    assert phone.get("/api/v1/probe-020").status_code == 200
    assert phone.post("/api/v1/auth/refresh").status_code == 200


@pytest.mark.ac("AC-AUTH-020")
def test_successful_change_resets_the_counter(app: FastAPI, db: Connection) -> None:
    khoa = seed(db, KHOA)
    client = TestClient(app, raise_server_exceptions=False)
    login(client, KHOA.email, KHOA.password)
    assert guess(client, "doan-1") == 422
    assert guess(client, "doan-2") == 422
    body = {"current_password": KHOA.password, "new_password": "Khoa@SmYou9"}
    assert client.post("/api/v1/auth/change-password", json=body).status_code == 204
    assert employee_row(db, khoa)["failed_login_count"] == 0


@pytest.mark.ac("AC-AUTH-020")
def test_change_password_documents_423(app: FastAPI) -> None:
    responses = app.openapi()["paths"]["/api/v1/auth/change-password"]["post"]["responses"]
    assert {"401", "422", "423"} <= set(responses)


@pytest.mark.ac("AC-AUTH-020")
def test_row_lock_reads_the_committed_counter_even_if_the_employee_is_cached(
    api: TestClient, db: Connection, clock: FakeClock
) -> None:
    """Security review round 3: FOR UPDATE must refresh an Employee already held by the session."""
    khoa = seed(db, KHOA)
    login(api, KHOA.email, KHOA.password)
    family = db.execute(
        text("SELECT family_id FROM auth_sessions WHERE employee_id = :id"), {"id": khoa}
    ).scalar_one()
    session = sessionmaker(bind=db, join_transaction_mode="create_savepoint")()
    with session.begin():
        cached = session.get(Employee, khoa)  # e.g. loaded earlier in the same request
        assert cached is not None
        db.execute(text("UPDATE employees SET failed_login_count = 4 WHERE id = :id"), {"id": khoa})
        actor = Actor(
            id=khoa, roles=frozenset({"TECHNICIAN"}), must_change_password=False, session_family=family
        )
        result = service.change_password(
            session,
            actor,
            current_password="doan-sai",
            new_password="Attacker#Owns1",
            now=clock(),
            settings=Settings(),
            user_agent="cached",
        )
    assert result == service.Failure.ACCOUNT_LOCKED


# ---- code review round 3: one lock order everywhere (employees before auth_sessions) ----


def _locked_tables(db: Connection, run: Callable[[], object]) -> list[str]:
    statements: list[str] = []

    def spy(_conn: object, _cursor: object, statement: str, *_args: object) -> None:
        if "FOR UPDATE" in statement:
            statements.append("employees" if "FROM employees" in statement else "auth_sessions")

    event.listen(db, "before_cursor_execute", spy)
    try:
        run()
    finally:
        event.remove(db, "before_cursor_execute", spy)
    return statements


@pytest.mark.ac("AC-AUTH-020")
def test_refresh_locks_the_employee_before_the_session_row(api: TestClient, db: Connection) -> None:
    """refresh ↔ change-password took the same rows in opposite order → Postgres deadlock (500)."""
    seed(db, KHOA)
    login(api, KHOA.email, KHOA.password)

    order = _locked_tables(db, lambda: api.post("/api/v1/auth/refresh"))

    assert order[:1] == ["employees"], order


@pytest.mark.ac("AC-AUTH-020")
def test_fifth_wrong_guess_signs_out_every_device_and_clears_cookies(app: FastAPI, db: Connection) -> None:
    seed(db, KHOA)
    phone = TestClient(app, raise_server_exceptions=False)
    laptop = TestClient(app, raise_server_exceptions=False)
    login(phone, KHOA.email, KHOA.password)
    login(laptop, KHOA.email, KHOA.password)

    for i in range(4):
        assert guess(phone, f"doan-{i}") == 422
    body = {"current_password": "doan-5", "new_password": "Attacker#2026x"}
    res = phone.post("/api/v1/auth/change-password", json=body)

    assert res.status_code == 423
    cleared = [h for h in res.headers.get_list("set-cookie") if "max-age=0" in h.lower()]
    assert len(cleared) == 2
    assert laptop.post("/api/v1/auth/refresh").status_code == 401
