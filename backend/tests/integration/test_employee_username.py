"""M17-03b: generated usernames, login by username, birth-date temporary password (AC-AUTH-065…078)."""

import re
import uuid
from datetime import timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, FakeClock, Person, employee_row, login, seed

SALES = "d2222222-2222-4222-8222-222222222222"
TAM = Person("tam@smyou.vn", "Tam@SmYou26", ("SALE",), "NV010", "Nguyễn Trần Tâm", "SALES", "tam.nt")
TAM2 = Person("tam2@smyou.vn", "Tam@SmYou26", ("SALE",), "NV011", "Nguyễn Văn Tâm", "SALES", "tam.nt2")
BINH = Person("binh.le@smyou.vn", "Binh@SmYou26", ("SALE",), "NV002", "Lê Văn Bình", "SALES", "binh.lv")
TU = Person("tu.pham@smyou.vn", "TuPham@2026", ("SALE",), "NV003", "Phạm Minh Tú", "SALES", "tu.pm")
YEN = Person("yen@smyou.vn", "Yen@SmYou26", ("SALE",), "NV004", "Nguyễn Lê Kim Yến", "SALES", "yen.nlk")
NEW = {"phone": "0932068787", "department_id": SALES, "roles": ["SALE"]}
INVALID = {"code": "INVALID_CREDENTIALS"}


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.username, person.password)
    assert res.status_code == 200, res.text
    return client


def set_birth_date(db: Connection, employee_id: uuid.UUID, value: str) -> None:
    db.execute(text("UPDATE employees SET birth_date = :d WHERE id = :id"), {"d": value, "id": employee_id})


@pytest.mark.ac("AC-AUTH-065")
def test_duplicate_username_counts_inactive_and_gets_next_number(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    seed(db, TAM)
    seed(db, TAM2, is_active=False)

    res = client_as(app, AN).post("/api/v1/employees", json={**NEW, "full_name": "Nguyễn Thị Tâm"})

    assert res.status_code == 201, res.text
    assert res.json()["employee"]["username"] == "tam.nt3"


@pytest.mark.ac("AC-AUTH-066")
def test_login_by_username_is_case_insensitive(api: TestClient, db: Connection) -> None:
    seed(db, TAM)

    res = login(api, "Tam.NT", TAM.password)

    assert res.status_code == 200, res.text
    assert res.json()["employee"]["full_name"] == "Nguyễn Trần Tâm"


@pytest.mark.ac("AC-AUTH-067")
def test_login_by_email_is_refused(api: TestClient, db: Connection) -> None:
    seed(db, TAM)

    res = login(api, "tam@smyou.vn", TAM.password)

    assert res.status_code == 401
    assert res.json()["code"] == INVALID["code"]
    assert "set-cookie" not in res.headers


@pytest.mark.ac("AC-AUTH-068")
def test_repeated_wrong_passwords_lock_the_username(
    app: FastAPI, api: TestClient, db: Connection, clock: FakeClock
) -> None:
    tam = seed(db, TAM)
    for _ in range(app.state.settings.login_max_failed):
        assert login(api, "tam.nt", "sai-mat-khau").status_code == 401

    locked = login(api, "tam.nt", TAM.password)

    assert locked.status_code == 423
    assert locked.json()["code"] == "ACCOUNT_LOCKED"
    assert employee_row(db, tam)["locked_until"] == clock.now + timedelta(
        minutes=app.state.settings.login_lock_minutes
    )
    assert login(api, "TAM.NT", TAM.password).status_code == 423


@pytest.mark.ac("AC-AUTH-070")
def test_manager_edits_username(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    binh = seed(db, BINH)
    seed(db, TU)
    an = client_as(app, AN)

    res = an.patch(f"/api/v1/employees/{binh}", json={"version": 1, "username": "binh.le"})
    assert res.status_code == 200, res.text
    assert res.json()["username"] == "binh.le"
    data = db.execute(
        text(
            "SELECT data FROM audit_events WHERE entity_type = 'EMPLOYEE' AND entity_id = :id"
            " AND action = 'update'"
        ),
        {"id": binh},
    ).scalar_one()
    assert "username" in data["changed_fields"]
    assert login(TestClient(app), "binh.le", BINH.password).status_code == 200

    taken = an.patch(f"/api/v1/employees/{binh}", json={"version": 2, "username": "TU.PM"})
    assert taken.status_code == 409
    assert taken.json()["code"] == "USERNAME_TAKEN"

    for bad in ("Binh Le", "bi", "binh..le", ".binh", "b" * 51):
        res = an.patch(f"/api/v1/employees/{binh}", json={"version": 2, "username": bad})
        assert res.status_code == 422, bad
        assert "username" in [e["field"] for e in res.json()["errors"]], bad


@pytest.mark.ac("AC-AUTH-070")
def test_renaming_does_not_change_username(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    binh = seed(db, BINH)

    res = client_as(app, AN).patch(
        f"/api/v1/employees/{binh}", json={"version": 1, "full_name": "Trần Văn Bình"}
    )

    assert res.status_code == 200, res.text
    assert res.json()["username"] == "binh.lv"


@pytest.mark.ac("AC-AUTH-071")
def test_me_returns_username(app: FastAPI, db: Connection) -> None:
    seed(db, TU)

    res = client_as(app, TU).get("/api/v1/me")

    assert res.status_code == 200, res.text
    assert res.json()["employee"]["username"] == "tu.pm"


@pytest.mark.ac("AC-AUTH-075")
def test_temporary_password_is_birth_date(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    res = client_as(app, AN).post(
        "/api/v1/employees", json={**NEW, "full_name": "Nguyễn Lê Kim Yến", "birth_date": "1985-07-30"}
    )
    assert res.status_code == 201, res.text
    assert res.json()["temporary_password"] == "30071985"
    assert res.json()["employee"]["username"] == "yen.nlk"

    first = login(TestClient(app), "yen.nlk", "30071985")

    assert first.status_code == 200, first.text
    assert first.json()["must_change_password"] is True


@pytest.mark.ac("AC-AUTH-076")
def test_without_birth_date_temporary_password_is_random(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    an = client_as(app, AN)
    created = an.post("/api/v1/employees", json={**NEW, "full_name": "Trần Văn Lợi"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert not re.fullmatch(r"\d{8}", body["temporary_password"])
    assert len(body["temporary_password"]) == 10
    assert body["employee"]["must_change_password"] is True

    employee = body["employee"]
    reset = an.post(
        f"/api/v1/employees/{employee['id']}/reset-password", json={"version": employee["version"]}
    )
    assert reset.status_code == 200, reset.text
    assert not re.fullmatch(r"\d{8}", reset.json()["temporary_password"])
    assert reset.json()["temporary_password"] != body["temporary_password"]
    assert reset.json()["employee"]["must_change_password"] is True


@pytest.mark.ac("AC-AUTH-077")
def test_reset_password_uses_birth_date(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    yen = seed(db, YEN)
    set_birth_date(db, yen, "1985-07-30")

    res = client_as(app, AN).post(f"/api/v1/employees/{yen}/reset-password", json={"version": 1})

    assert res.status_code == 200, res.text
    assert res.json()["temporary_password"] == "30071985"
    assert res.json()["employee"]["must_change_password"] is True
    assert employee_row(db, yen)["must_change_password"] is True
    assert login(TestClient(app), "yen.nlk", "30071985").status_code == 200


@pytest.mark.ac("AC-AUTH-078")
def test_new_password_cannot_be_birth_date(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    res = client_as(app, AN).post(
        "/api/v1/employees", json={**NEW, "full_name": "Nguyễn Lê Kim Yến", "birth_date": "1985-07-30"}
    )
    assert res.status_code == 201, res.text
    yen = TestClient(app, raise_server_exceptions=False)
    assert login(yen, "yen.nlk", "30071985").status_code == 200

    changed = yen.post(
        "/api/v1/auth/change-password", json={"current_password": "30071985", "new_password": "30071985"}
    )
    assert changed.status_code == 422
    messages = [e["message"] for e in changed.json()["errors"]]
    assert "Mật khẩu mới không được trùng ngày sinh." in messages

    ok = yen.post(
        "/api/v1/auth/change-password", json={"current_password": "30071985", "new_password": "KimYen@2026"}
    )
    assert ok.status_code == 204, ok.text


@pytest.mark.ac("AC-AUTH-078")
def test_birth_date_check_skipped_without_birth_date(app: FastAPI, db: Connection) -> None:
    seed(db, TU)
    res = client_as(app, TU).post(
        "/api/v1/auth/change-password", json={"current_password": TU.password, "new_password": "30071985"}
    )
    assert res.status_code == 204, res.text
