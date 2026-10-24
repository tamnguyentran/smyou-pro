"""M16-02a: báo cáo "Chi phí quà tặng KH" API (AC-GFT-030…035)."""

import uuid

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection

from tests.integration.conftest import AN, KHOA, Person, seed
from tests.integration.test_customer_gifts_api import client_as, gift_body, insert_customer

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, KHOA)}


@pytest.fixture
def two_customers(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    return {
        "KH00001": insert_customer(db, created_by=people["NV005"], code="KH00001"),
        "KH00002": insert_customer(db, created_by=people["NV005"], code="KH00002"),
    }


def create_gift(app: FastAPI, people: dict[str, uuid.UUID], customer: uuid.UUID, **overrides: object) -> None:
    hoa = client_as(app, HOA)
    res = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer, **overrides))
    assert res.status_code == 201, res.text


@pytest.fixture
def two_customer_gifts(
    app: FastAPI, people: dict[str, uuid.UUID], two_customers: dict[str, uuid.UUID]
) -> dict[str, uuid.UUID]:
    # KH00001: 2 bản ghi (1.000.000 + 500.000 = 1.500.000); KH00002: 1 bản ghi (500.000) — spec §3.
    # `performed_date` nằm trong tháng hiện tại của FakeClock (2026-09-26, xem conftest.py) để khớp
    # mặc định "đầu tháng → hôm nay" khi gọi báo cáo không filter (AC-GFT-030).
    create_gift(
        app,
        people,
        two_customers["KH00001"],
        performed_date="2026-09-10",
        unit_price=500000,
        other_cost=0,
        quantity=2,
    )
    create_gift(
        app,
        people,
        two_customers["KH00001"],
        performed_date="2026-09-15",
        unit_price=500000,
        other_cost=0,
        quantity=1,
    )
    create_gift(
        app,
        people,
        two_customers["KH00002"],
        performed_date="2026-09-20",
        unit_price=500000,
        other_cost=0,
        quantity=1,
    )
    return two_customers


def problem(res, status: int, code: str) -> dict:
    assert res.status_code == status, res.text
    body = res.json()
    assert body["code"] == code
    return body


@pytest.mark.ac("AC-GFT-030")
def test_report_groups_by_customer(
    app: FastAPI, db: Connection, two_customer_gifts: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)

    res = an.get("/api/v1/reports/customer-gifts")

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["items"][0]["customer_code"] == "KH00001"
    assert body["items"][0]["gift_count"] == 2
    assert body["items"][0]["total_cost"] == 1500000
    assert body["items"][1]["customer_code"] == "KH00002"
    assert body["items"][1]["gift_count"] == 1
    assert body["items"][1]["total_cost"] == 500000


@pytest.mark.ac("AC-GFT-031")
def test_report_filters_by_customer(
    app: FastAPI, db: Connection, two_customer_gifts: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)

    res = an.get(f"/api/v1/reports/customer-gifts?customer_id={two_customer_gifts['KH00001']}")

    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["customer_code"] == "KH00001"


@pytest.mark.ac("AC-GFT-032")
def test_report_sale_sees_all_customers(
    app: FastAPI, db: Connection, two_customer_gifts: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)

    res = hoa.get("/api/v1/reports/customer-gifts")

    assert res.status_code == 200, res.text
    assert len(res.json()["items"]) == 2


@pytest.mark.ac("AC-GFT-033")
def test_report_forbidden_for_technician(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    khoa = client_as(app, KHOA)

    res = khoa.get("/api/v1/reports/customer-gifts")

    assert res.status_code == 403, res.text


@pytest.mark.ac("AC-GFT-034")
def test_drilldown_items(app: FastAPI, db: Connection, two_customer_gifts: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)

    res = an.get(f"/api/v1/reports/customer-gifts/{two_customer_gifts['KH00001']}/items")

    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) == 2
    assert {item["total_amount"] for item in items} == {1000000, 500000}


@pytest.mark.ac("AC-GFT-035")
def test_export_csv(app: FastAPI, db: Connection, two_customer_gifts: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)

    res = an.get("/api/v1/reports/customer-gifts/export")

    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert "chi-phi-qua-tang-kh-" in res.headers["content-disposition"]
    assert res.content.startswith("﻿".encode())
