"""M17-02b: employees pick a department from `departments` instead of the old fixed enum
(AC-EMP-053…059). The migration backfill (AC-EMP-052) lives in test_employee_department_migration.py.
"""

import uuid
from collections.abc import Iterator

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.orm import sessionmaker

from app import cli
from tests.integration.conftest import AN, KHOA, Person, login, seed

# UUIDs seeded by the M17-02a migration.
MANAGEMENT = "d1111111-1111-4111-8111-111111111111"
SALES = "d2222222-2222-4222-8222-222222222222"
TECHNICAL = "d3333333-3333-4333-8333-333333333333"
ECONOMIC = "d4444444-4444-4444-8444-444444444444"
ACCOUNTING = "d6666666-6666-4666-8666-666666666666"

BINH = Person("binh.le@smyou.vn", "Binh@SmYou26", ("SALE",), "NV002", "Lê Văn Bình", "SALES")
TU = Person("tu.pham@smyou.vn", "Tu@SmYou2026", ("TECHNICIAN",), "NV030", "Phạm Minh Tú", "TECHNICAL")
NEW = {"full_name": "Trần Thị Mai", "email": "mai.tran@smyou.vn", "roles": ["SALE"]}


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


def deactivate(db: Connection, department_id: str) -> None:
    db.execute(text("UPDATE departments SET is_active = false WHERE id = :id"), {"id": department_id})


def field_error(res: httpx.Response, code: str) -> None:
    assert res.status_code == 422, res.text
    body = res.json()
    assert body["code"] == code
    assert "department_id" in {e["field"] for e in body["errors"]}


@pytest.mark.ac("AC-EMP-053")
def test_create_with_active_department(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    res = client_as(app, AN).post("/api/v1/employees", json={**NEW, "department_id": ACCOUNTING})

    assert res.status_code == 201, res.text
    assert res.json()["employee"]["department"] == {
        "id": ACCOUNTING,
        "name": "Kế Toán - tài chính",
        "is_active": True,
    }


@pytest.mark.ac("AC-EMP-054")
def test_create_with_inactive_department_is_rejected(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    deactivate(db, SALES)
    res = client_as(app, AN).post("/api/v1/employees", json={**NEW, "department_id": SALES})

    field_error(res, "DEPARTMENT_INACTIVE")


@pytest.mark.ac("AC-EMP-055")
def test_create_with_unknown_or_missing_department(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    an = client_as(app, AN)

    field_error(
        an.post("/api/v1/employees", json={**NEW, "department_id": str(uuid.uuid4())}), "DEPARTMENT_NOT_FOUND"
    )
    field_error(an.post("/api/v1/employees", json=NEW), "VALIDATION_ERROR")
    assert (
        db.execute(text("SELECT count(*) FROM employees WHERE email = 'mai.tran@smyou.vn'")).scalar_one() == 0
    )


@pytest.mark.ac("AC-EMP-056")
def test_keeping_an_inactive_department_while_editing_other_fields(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    binh = seed(db, BINH)
    deactivate(db, SALES)
    an = client_as(app, AN)

    res = an.patch(f"/api/v1/employees/{binh}", json={"version": 1, "phone": "0932068787"})
    assert res.status_code == 200, res.text
    res = an.patch(
        f"/api/v1/employees/{binh}", json={"version": 2, "phone": "0932068788", "department_id": SALES}
    )
    assert res.status_code == 200, res.text
    assert res.json()["department"] == {"id": SALES, "name": "Kinh doanh", "is_active": False}


@pytest.mark.ac("AC-EMP-057")
def test_moving_to_another_department_is_audited_and_must_be_active(app: FastAPI, db: Connection) -> None:
    seed(db, AN)
    binh = seed(db, BINH)
    an = client_as(app, AN)

    res = an.patch(f"/api/v1/employees/{binh}", json={"version": 1, "department_id": ECONOMIC})
    assert res.status_code == 200, res.text
    assert res.json()["department"]["name"] == "Phát Triển Kinh Tế"
    data = db.execute(
        text(
            "SELECT data FROM audit_events WHERE entity_type = 'EMPLOYEE' AND entity_id = :id"
            " AND action = 'update'"
        ),
        {"id": binh},
    ).scalar_one()
    assert data["changed_fields"] == ["department_id"]

    deactivate(db, TECHNICAL)
    res = an.patch(f"/api/v1/employees/{binh}", json={"version": 2, "department_id": TECHNICAL})
    field_error(res, "DEPARTMENT_INACTIVE")


@pytest.mark.ac("AC-EMP-058")
def test_me_returns_department_id_and_name(app: FastAPI, db: Connection) -> None:
    seed(db, TU)
    body = client_as(app, TU).get("/api/v1/me").json()

    assert body["employee"]["department"] == {"id": TECHNICAL, "name": "Kỹ thuật"}


@pytest.mark.ac("AC-EMP-059")
def test_bootstrap_manager_goes_to_management(monkeypatch: pytest.MonkeyPatch, db: Connection) -> None:
    answers: Iterator[str] = iter(["SmYou@2026", "SmYou@2026"])
    monkeypatch.setattr("getpass.getpass", lambda prompt="": next(answers))
    factory = sessionmaker(bind=db, join_transaction_mode="create_savepoint", expire_on_commit=False)
    args = ["create-manager", "--email", KHOA.email, "--full-name", "Quản lý đầu tiên", "--code", "NV900"]

    assert cli.main(args, session_factory=factory) == 0
    department_id = db.execute(
        text("SELECT department_id FROM employees WHERE email = :email"), {"email": KHOA.email}
    ).scalar_one()
    assert str(department_id) == MANAGEMENT
