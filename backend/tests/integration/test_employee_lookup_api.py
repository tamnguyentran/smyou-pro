"""M16-11: GET /employees/lookup — slim employee search for pickers (e.g. "Người nhận doanh số")."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quốc Tuấn", "TECHNICAL")
LAN = Person("lan.vo@smyou.vn", "Lan@SmYou26", ("CUSTOMER_CARE",), "NV020", "Võ Thị Lan", "SALES")

LOOKUP_KEYS = {"id", "code", "full_name", "phone", "is_active"}


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, LAN, KHOA)}


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


@pytest.mark.ac("AC-EMP-030")
def test_every_order_screen_role_can_look_up_employees(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    for person in (AN, HOA, TUAN, LAN):
        res = client_as(app, person).get("/api/v1/employees/lookup", params={"q": "khoa"})
        assert res.status_code == 200, (person.code, res.text)
        (khoa,) = res.json()
        assert set(khoa) == LOOKUP_KEYS
        assert (khoa["code"], khoa["full_name"]) == ("NV014", "Trần Minh Khoa")

    res = client_as(app, KHOA).get("/api/v1/employees/lookup")
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN"


@pytest.mark.ac("AC-EMP-031")
def test_lookup_search_active_filter_and_limit(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    db.execute(text("UPDATE employees SET is_active = false WHERE code = 'NV014'"))
    hoa = client_as(app, HOA)

    def codes(**params: str) -> list[str]:
        res = hoa.get("/api/v1/employees/lookup", params=params)
        assert res.status_code == 200, res.text
        return [e["code"] for e in res.json()]

    assert codes(q="tuan") == ["NV010"]  # no diacritics needed
    assert codes(q="NV01") == ["NV010", "NV014"]
    assert codes(q="NV01", include_inactive="false") == ["NV010"]
    assert codes(limit="2") == ["NV001", "NV005"]
    body = str(hoa.get("/api/v1/employees/lookup").json())
    assert "email" not in body
    assert "roles" not in body
    assert hoa.get("/api/v1/employees/lookup", params={"limit": "51"}).status_code == 422
