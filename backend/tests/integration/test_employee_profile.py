"""M17-03a: personal profile fields on employees, email optional (AC-EMP-064…068)."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, Person, login, seed

SALES = "d2222222-2222-4222-8222-222222222222"
BINH = Person("binh.le@smyou.vn", "Binh@SmYou26", ("SALE",), "NV002", "Lê Văn Bình", "SALES")
BASE = {"full_name": "Nguyễn Lê Kim Yến", "phone": "0932068787", "department_id": SALES, "roles": ["SALE"]}
PROFILE = {
    "birth_date": "1985-07-30",
    "birth_place": "An Giang",
    "gender": "FEMALE",
    "address": "12 Trần Hưng Đạo, Long Xuyên, An Giang",
    "id_number": "089185000565",
    "id_issued_date": "2018-10-08",
    "id_issued_place": "Cục Cảnh sát QLHC về TTXH",
    "marital_status": "MARRIED",
}
FIELDS = tuple(PROFILE)


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


def tomorrow() -> str:
    return (datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date() + timedelta(days=1)).isoformat()


@pytest.mark.ac("AC-EMP-064")
def test_create_with_every_profile_field(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    an = client_as(app, AN)
    res = an.post("/api/v1/employees", json={**BASE, "email": "kimyen@gmail.com", **PROFILE})

    assert res.status_code == 201, res.text
    created = res.json()["employee"]
    fetched = an.get(f"/api/v1/employees/{created['id']}").json()
    for field, value in PROFILE.items():
        assert created[field] == value, field
        assert fetched[field] == value, field
    assert fetched["email"] == "kimyen@gmail.com"


@pytest.mark.ac("AC-EMP-065")
def test_create_without_profile_fields_or_email(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    an = client_as(app, AN)
    res = an.post("/api/v1/employees", json=BASE)

    assert res.status_code == 201, res.text
    fetched = an.get(f"/api/v1/employees/{res.json()['employee']['id']}").json()
    assert fetched["email"] is None
    assert {f: fetched[f] for f in FIELDS} == dict.fromkeys(FIELDS)

    # Blank strings are trimmed to null too (§4); several employees may have no email (unique allows NULLs).
    blank = {"email": "  ", "birth_place": " ", "address": "", "id_number": "", "id_issued_place": " "}
    res = an.post("/api/v1/employees", json={**BASE, "full_name": "Trần Văn Lợi", **blank})
    assert res.status_code == 201, res.text
    body = res.json()["employee"]
    assert {f: body[f] for f in blank} == dict.fromkeys(blank)


INVALID = [
    ({"id_number": "12AB"}, "id_number"),
    ({"id_number": "1234567890"}, "id_number"),
    ({"id_number": "12345678"}, "id_number"),
    ({"id_number": "1234567890123"}, "id_number"),
    ({"birth_date": "FUTURE"}, "birth_date"),
    ({"id_issued_date": "FUTURE"}, "id_issued_date"),
    ({"gender": "X"}, "gender"),
    ({"marital_status": "ENGAGED"}, "marital_status"),
    ({"birth_place": "x" * 121}, "birth_place"),
    ({"id_issued_place": "x" * 121}, "id_issued_place"),
    ({"address": "x" * 256}, "address"),
]


@pytest.mark.ac("AC-EMP-066")
@pytest.mark.parametrize(("change", "field"), INVALID)
def test_create_profile_validation(app: FastAPI, db: Connection, change: dict[str, str], field: str) -> None:
    seed(db, AN)
    body = {**BASE, **{k: tomorrow() if v == "FUTURE" else v for k, v in change.items()}}
    res = client_as(app, AN).post("/api/v1/employees", json=body)

    assert res.status_code == 422, res.text
    assert field in [e["field"] for e in res.json()["errors"]]
    assert db.execute(text("SELECT count(*) FROM employees WHERE code <> 'NV001'")).scalar_one() == 0


@pytest.mark.ac("AC-EMP-066")
def test_nine_digit_id_and_today_are_accepted(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat()
    res = client_as(app, AN).post(
        "/api/v1/employees", json={**BASE, "id_number": "351234567", "id_issued_date": today}
    )

    assert res.status_code == 201, res.text
    assert res.json()["employee"]["id_number"] == "351234567"


@pytest.mark.ac("AC-EMP-066")
@pytest.mark.parametrize(("change", "field"), INVALID)
def test_patch_profile_validation(app: FastAPI, db: Connection, change: dict[str, str], field: str) -> None:
    seed(db, AN)
    binh = seed(db, BINH)
    body = {"version": 1, **{k: tomorrow() if v == "FUTURE" else v for k, v in change.items()}}
    res = client_as(app, AN).patch(f"/api/v1/employees/{binh}", json=body)

    assert res.status_code == 422, res.text
    assert field in [e["field"] for e in res.json()["errors"]]
    assert db.execute(text("SELECT version FROM employees WHERE id = :id"), {"id": binh}).scalar_one() == 1


@pytest.mark.ac("AC-EMP-067")
def test_duplicate_email_is_still_a_conflict(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    an = client_as(app, AN)
    assert an.post("/api/v1/employees", json={**BASE, "email": "kimyen@gmail.com"}).status_code == 201

    res = an.post("/api/v1/employees", json={**BASE, "full_name": "Kim Yến 2", "email": "KimYen@gmail.com"})
    assert res.status_code == 409, res.text
    assert res.json()["errors"] == [
        {"field": "email", "code": "taken", "message": "Email đã được dùng cho nhân viên khác."}
    ]


@pytest.mark.ac("AC-EMP-068")
def test_patch_profile_fields_is_audited(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    binh = seed(db, BINH)
    an = client_as(app, AN)

    res = an.patch(
        f"/api/v1/employees/{binh}",
        json={"version": 1, "address": "45 Lý Thái Tổ, Long Xuyên", "marital_status": "SINGLE"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["address"] == "45 Lý Thái Tổ, Long Xuyên"
    assert res.json()["marital_status"] == "SINGLE"
    data = db.execute(
        text(
            "SELECT data FROM audit_events WHERE entity_type = 'EMPLOYEE' AND entity_id = :id"
            " AND action = 'update'"
        ),
        {"id": binh},
    ).scalar_one()
    assert data["changed_fields"] == ["address", "marital_status"]

    # null clears an optional field, email included (§4)
    res = an.patch(f"/api/v1/employees/{binh}", json={"version": 2, "address": None, "email": None})
    assert res.status_code == 200, res.text
    assert res.json()["address"] is None
    assert res.json()["email"] is None


@pytest.mark.ac("AC-EMP-072")
def test_me_returns_own_profile_fields(app: FastAPI, db: Connection) -> None:
    binh = seed(db, BINH)
    db.execute(
        text(
            "UPDATE employees SET phone = '0932068787', birth_date = :bd, birth_place = :bp,"
            " gender = :g, address = :a, id_number = :n, id_issued_date = :d,"
            " id_issued_place = :ip, marital_status = :m WHERE id = :id"
        ),
        {
            "bd": date(1985, 7, 30),
            "bp": PROFILE["birth_place"],
            "g": PROFILE["gender"],
            "a": PROFILE["address"],
            "n": PROFILE["id_number"],
            "d": date(2018, 10, 8),
            "ip": PROFILE["id_issued_place"],
            "m": PROFILE["marital_status"],
            "id": binh,
        },
    )
    res = client_as(app, BINH).get("/api/v1/me")

    assert res.status_code == 200, res.text
    employee = res.json()["employee"]
    assert employee["phone"] == "0932068787"
    assert {f: employee[f] for f in FIELDS} == PROFILE


@pytest.mark.ac("AC-EMP-068")
def test_profile_columns_enforce_checks_in_the_database(db: Connection) -> None:
    binh = seed(db, BINH)
    db.execute(
        text("UPDATE employees SET birth_date = :d, gender = 'MALE' WHERE id = :id"),
        {"d": date(1990, 1, 2), "id": binh},
    )
    for check, sql in (
        ("ck_employees_id_number", "UPDATE employees SET id_number = '12AB' WHERE id = :id"),
        ("ck_employees_gender", "UPDATE employees SET gender = 'X' WHERE id = :id"),
        ("ck_employees_marital_status", "UPDATE employees SET marital_status = 'ENGAGED' WHERE id = :id"),
    ):
        with pytest.raises(Exception, match=check), db.begin_nested():
            db.execute(text(sql), {"id": binh})
