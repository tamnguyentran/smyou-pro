"""M15-08: lịch sử giá bán/giá vốn catalog + cost_price_snapshot trên dòng hàng (AC-CAT-081…086)."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection

from tests.integration.conftest import AN, Person, login, seed
from tests.integration.test_products_api import LCD, insert_product
from tests.integration.test_services_api import BOMMUC, insert_service

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.username, person.password)
    assert res.status_code == 200, res.text
    return client


def problem(res, status: int, code: str) -> dict[str, object]:
    assert res.status_code == status, res.text
    body: dict[str, object] = res.json()
    assert body["code"] == code
    return body


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA)}


@pytest.mark.ac("AC-CAT-081")
def test_update_price_records_history(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    product_id = insert_product(db, {**LCD, "price": 5_000_000}, cost_price=4_200_000)
    an = client_as(app, AN)

    res = an.patch(
        f"/api/v1/products/{product_id}",
        json={"version": 1, "price": 5_200_000, "cost_price": 4_200_000},
    )
    assert res.status_code == 200, res.text

    history = an.get(f"/api/v1/products/{product_id}/price-history")
    assert history.status_code == 200, history.text
    rows = history.json()
    assert len(rows) == 1
    assert (rows[0]["old_price"], rows[0]["new_price"]) == (5_000_000, 5_200_000)
    assert (rows[0]["old_cost_price"], rows[0]["new_cost_price"]) == (4_200_000, 4_200_000)
    assert rows[0]["changed_by"]["code"] == "NV001"


@pytest.mark.ac("AC-CAT-082")
def test_update_without_price_change_no_history_row(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    product_id = insert_product(db, LCD, cost_price=2_100_000)
    an = client_as(app, AN)

    res = an.patch(f"/api/v1/products/{product_id}", json={"version": 1, "name": "Tên mới"})
    assert res.status_code == 200, res.text

    history = an.get(f"/api/v1/products/{product_id}/price-history")
    assert history.status_code == 200, history.text
    assert history.json() == []


@pytest.mark.ac("AC-CAT-083")
def test_list_history_newest_first(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    product_id = insert_product(db, LCD, cost_price=2_100_000)
    an = client_as(app, AN)

    version = 1
    for new_price in (2_900_000, 3_000_000, 3_100_000):
        res = an.patch(f"/api/v1/products/{product_id}", json={"version": version, "price": new_price})
        assert res.status_code == 200, res.text
        version += 1

    history = an.get(f"/api/v1/products/{product_id}/price-history")
    assert history.status_code == 200, history.text
    rows = history.json()
    assert len(rows) == 3
    assert [r["new_price"] for r in rows] == [3_100_000, 3_000_000, 2_900_000]


@pytest.mark.ac("AC-CAT-084")
def test_list_history_forbidden_for_sale(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    product_id = insert_product(db, LCD, cost_price=2_100_000)
    hoa = client_as(app, HOA)
    problem(hoa.get(f"/api/v1/products/{product_id}/price-history"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CAT-081")
def test_service_update_price_records_history(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    service_id = insert_service(db, {**BOMMUC, "price": 790_000}, cost_price=500_000)
    an = client_as(app, AN)

    res = an.patch(
        f"/api/v1/services/{service_id}",
        json={"version": 1, "price": 850_000, "cost_price": 500_000},
    )
    assert res.status_code == 200, res.text

    history = an.get(f"/api/v1/services/{service_id}/price-history")
    assert history.status_code == 200, history.text
    rows = history.json()
    assert len(rows) == 1
    assert (rows[0]["old_price"], rows[0]["new_price"]) == (790_000, 850_000)


@pytest.mark.ac("AC-CAT-084")
def test_service_list_history_forbidden_for_sale(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    service_id = insert_service(db, BOMMUC, cost_price=500_000)
    hoa = client_as(app, HOA)
    problem(hoa.get(f"/api/v1/services/{service_id}/price-history"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CAT-085")
def test_add_line_snapshots_cost_price(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    product_id = insert_product(db, {**LCD, "price": 5_200_000, "price_fixed": False}, cost_price=4_200_000)
    an = client_as(app, AN)
    order = an.post("/api/v1/orders", json={}).json()

    res = an.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(product_id),
            "quantity": "1",
            "unit_price": 5_200_000,
            "vat_rate": "8",
        },
    )
    assert res.status_code == 201, res.text
    line = res.json()["lines"][0]
    assert line["cost_price_snapshot"] == 4_200_000


@pytest.mark.ac("AC-CAT-086")
def test_cost_price_snapshot_survives_catalog_change(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    product_id = insert_product(db, {**LCD, "price": 5_200_000, "price_fixed": False}, cost_price=4_200_000)
    an = client_as(app, AN)
    order = an.post("/api/v1/orders", json={}).json()
    order = an.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(product_id),
            "quantity": "1",
            "unit_price": 5_200_000,
            "vat_rate": "8",
        },
    ).json()

    res = an.patch(f"/api/v1/products/{product_id}", json={"version": 1, "cost_price": 4_500_000})
    assert res.status_code == 200, res.text

    detail = an.get(f"/api/v1/orders/{order['id']}").json()
    assert detail["lines"][0]["cost_price_snapshot"] == 4_200_000
