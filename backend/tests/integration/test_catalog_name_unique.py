"""M10-01: product/service name uniqueness among active rows (AC-CAT-062…070)."""

import uuid

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, seed
from tests.integration.test_products_api import HOA, LCD, MAYBO, TUAN, client_as, insert_product
from tests.integration.test_services_api import BOMMUC, SUAPC, insert_service


def problem(res: httpx.Response, status: int, code: str) -> dict[str, object]:
    assert res.status_code == status, res.text
    body: dict[str, object] = res.json()
    assert body["code"] == code
    return body


def field(body: dict[str, object]) -> str:
    errors = body["errors"]
    assert isinstance(errors, list)
    return str(errors[0]["field"])


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA)}


@pytest.fixture
def products(db: Connection) -> dict[str, uuid.UUID]:
    return {"MAYBO3551": insert_product(db, MAYBO), "LCD1137": insert_product(db, LCD)}


@pytest.fixture
def services(db: Connection) -> dict[str, uuid.UUID]:
    return {"DV-BOMMUC": insert_service(db, BOMMUC), "DV-SUAPC": insert_service(db, SUAPC)}


VERSION_QUERIES = {
    "products": "SELECT version FROM products WHERE id = :id",
    "services": "SELECT version FROM services WHERE id = :id",
}


def version_of(db: Connection, table: str, row_id: uuid.UUID) -> int:
    row = db.execute(text(VERSION_QUERIES[table]), {"id": row_id}).mappings().one()
    version = row["version"]
    assert isinstance(version, int)
    return version


@pytest.mark.ac("AC-CAT-062")
def test_create_product_duplicate_name_rejected(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    body = problem(
        an.post(
            "/api/v1/products",
            json={**LCD, "sku": "LCD1138", "name": "  màn hình dell 22 inch  "},
        ),
        409,
        "CONFLICT",
    )
    assert field(body) == "name"
    assert body["detail"] == "Tên sản phẩm đã được dùng cho sản phẩm khác đang kinh doanh."


@pytest.mark.ac("AC-CAT-063")
def test_create_product_same_name_as_inactive_allowed(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    insert_product(db, LCD, is_active=False)
    an = client_as(app, AN)
    res = an.post("/api/v1/products", json={**LCD, "sku": "LCD1138"})
    assert res.status_code == 201, res.text


@pytest.mark.ac("AC-CAT-064")
def test_patch_product_rename_to_duplicate_rejected(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    maybo_id = products["MAYBO3551"]
    an = client_as(app, AN)
    body = problem(
        an.patch(f"/api/v1/products/{maybo_id}", json={"version": 1, "name": "Màn Hình Dell 22 Inch"}),
        409,
        "CONFLICT",
    )
    assert field(body) == "name"
    assert version_of(db, "products", maybo_id) == 1


@pytest.mark.ac("AC-CAT-065")
def test_patch_product_rename_case_only_self_allowed(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    lcd_id = products["LCD1137"]
    an = client_as(app, AN)
    res = an.patch(f"/api/v1/products/{lcd_id}", json={"version": 1, "name": "MÀN HÌNH DELL 22 INCH"})
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2


@pytest.mark.ac("AC-CAT-066")
def test_activate_product_blocked_by_name_now_taken(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    lcd_id = insert_product(db, LCD, is_active=False)
    insert_product(db, {**LCD, "sku": "LCD1139"})  # took the name while LCD1137 was inactive
    an = client_as(app, AN)
    body = problem(an.post(f"/api/v1/products/{lcd_id}/activate", json={"version": 1}), 409, "CONFLICT")
    assert field(body) == "name"
    res = an.get(f"/api/v1/products/{lcd_id}")
    assert res.json()["is_active"] is False


@pytest.mark.ac("AC-CAT-067")
def test_create_service_duplicate_name_rejected(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], services: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    body = problem(
        an.post("/api/v1/services", json={**SUAPC, "code": "DV-SUAPC2", "name": "  sửa chữa pc  "}),
        409,
        "CONFLICT",
    )
    assert field(body) == "name"
    assert body["detail"] == "Tên dịch vụ đã được dùng cho dịch vụ khác đang kinh doanh."


@pytest.mark.ac("AC-CAT-068")
def test_patch_service_rename_to_duplicate_rejected(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], services: dict[str, uuid.UUID]
) -> None:
    bommuc_id = services["DV-BOMMUC"]
    an = client_as(app, AN)
    body = problem(
        an.patch(f"/api/v1/services/{bommuc_id}", json={"version": 1, "name": "Sửa Chữa PC"}),
        409,
        "CONFLICT",
    )
    assert field(body) == "name"
    assert version_of(db, "services", bommuc_id) == 1


@pytest.mark.ac("AC-CAT-069")
def test_activate_service_blocked_by_name_now_taken(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    suapc_id = insert_service(db, SUAPC, is_active=False)
    insert_service(db, {**SUAPC, "code": "DV-SUAPC2"})
    an = client_as(app, AN)
    body = problem(an.post(f"/api/v1/services/{suapc_id}/activate", json={"version": 1}), 409, "CONFLICT")
    assert field(body) == "name"


@pytest.mark.ac("AC-CAT-070")
def test_product_and_service_may_share_name(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    res = an.post(
        "/api/v1/services",
        json={
            "code": "DV-MH01",
            "name": LCD["name"],
            "category": "OTHER",
            "unit": "LAN",
            "price": 0,
            "cost_price": 0,
            "vat_rate": 8,
            "price_fixed": False,
        },
    )
    assert res.status_code == 201, res.text
