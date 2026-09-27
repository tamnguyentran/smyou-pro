"""M2-01a: products catalog API (AC-CAT-001…011)."""

import uuid

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quốc Tuấn", "TECHNICAL")


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


ITEM_KEYS = {
    "id",
    "sku",
    "name",
    "category",
    "brand",
    "unit",
    "price",
    "vat_rate",
    "price_fixed",
    "warranty_months",
    "specs",
    "image_attachment_id",
    "is_active",
    "version",
}

MAYBO = {
    "sku": "MAYBO3551",
    "name": "PC SMYOU CORE I5-12400 (I5-12400/16GB/SSD 512GB)",
    "category": "PC",
    "brand": "SMYOU",
    "unit": "BO",
    "price": 11_500_000,
    "vat_rate": 8,
    "price_fixed": True,
    "warranty_months": 36,
    "specs": "I5-12400/16GB/SSD 512GB",
}
LCD = {
    "sku": "LCD1137",
    "name": "Màn hình Dell 22 inch",
    "category": "MONITOR",
    "brand": "Dell",
    "unit": "CAI",
    "price": 2_800_000,
    "vat_rate": 10,
    "price_fixed": False,
    "warranty_months": 24,
    "specs": None,
}
HOPMUC = {
    "sku": "HOPMUC3053",
    "name": "Hộp mực Brother TN-2385",
    "category": "PRINTER_SUPPLY",
    "brand": "Brother",
    "unit": "HOP",
    "price": 950_000,
    "vat_rate": 8,
    "price_fixed": True,
    "warranty_months": 0,
    "specs": None,
}

# A tiny but genuine JPEG (magic bytes + EOI marker) — no Pillow needed to build or read it.
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200 + b"\xff\xd9"


def insert_product(db: Connection, product: dict[str, object], *, is_active: bool = True) -> uuid.UUID:
    product_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO products (id, sku, name, category, brand, unit, price, vat_rate, price_fixed,"
            " warranty_months, specs, is_active, version)"
            " VALUES (:id, :sku, :name, :category, :brand, :unit, :price, :vat_rate, :price_fixed,"
            " :warranty_months, :specs, :is_active, 1)"
        ),
        {"id": product_id, "is_active": is_active, **product},
    )
    return product_id


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA)}


@pytest.fixture
def products(db: Connection) -> dict[str, uuid.UUID]:
    return {
        "MAYBO3551": insert_product(db, MAYBO),
        "LCD1137": insert_product(db, LCD),
        "HOPMUC3053": insert_product(db, HOPMUC, is_active=False),
    }


def problem(res: httpx.Response, status: int, code: str) -> dict[str, object]:
    assert res.status_code == status, res.text
    body: dict[str, object] = res.json()
    assert body["code"] == code
    return body


def version_of(db: Connection, product_id: uuid.UUID) -> int:
    row = db.execute(text("SELECT version FROM products WHERE id = :id"), {"id": product_id}).mappings().one()
    version = row["version"]
    assert isinstance(version, int)
    return version


@pytest.mark.ac("AC-CAT-001")
def test_list_search_filter_and_page(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    res = an.get("/api/v1/products", params={"q": "hop", "category": "PRINTER_SUPPLY", "is_active": False})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert set(body["items"][0]) == ITEM_KEYS
    assert body["items"][0]["sku"] == "HOPMUC3053"

    res = an.get("/api/v1/products", params={"limit": 200})
    assert res.status_code == 422, res.text


@pytest.mark.ac("AC-CAT-002")
def test_read_scope_sale_techlead_ok_technician_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    product_id = products["MAYBO3551"]
    for person in (HOA, TUAN):
        client = client_as(app, person)
        assert client.get("/api/v1/products").status_code == 200
        assert client.get(f"/api/v1/products/{product_id}").status_code == 200

    khoa = client_as(app, KHOA)
    assert khoa.get("/api/v1/products").status_code == 403
    assert khoa.get(f"/api/v1/products/{product_id}").status_code == 403


@pytest.mark.ac("AC-CAT-003")
def test_create_product(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    body = {**MAYBO, "sku": "MAYBO3552", "name": "PC SMYOU CORE I5-13400"}
    res = an.post("/api/v1/products", json=body)
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["is_active"] is True
    assert created["version"] == 1

    for person in (HOA, TUAN):
        forbidden = client_as(app, person).post("/api/v1/products", json={**body, "sku": "MAYBO3553"})
        assert forbidden.status_code == 403


@pytest.mark.ac("AC-CAT-004")
def test_create_validation_and_conflict(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    assert an.post("/api/v1/products", json=MAYBO).status_code == 201

    problem(an.post("/api/v1/products", json={**LCD, "sku": "maybo3551"}), 409, "CONFLICT")

    for bad in (
        {**LCD, "price": -1},
        {**LCD, "vat_rate": 101},
        {**LCD, "vat_rate": 8.123},
        {**LCD, "category": "NOT_A_CATEGORY"},
        {**LCD, "unit": "NOT_A_UNIT"},
        {**LCD, "name": ""},
    ):
        res = an.post("/api/v1/products", json=bad)
        assert res.status_code == 422, (bad, res.text)


@pytest.mark.ac("AC-CAT-005")
def test_update_optimistic_lock_and_sku_immutable(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    product_id = products["LCD1137"]
    an = client_as(app, AN)
    res = an.patch(f"/api/v1/products/{product_id}", json={"version": 1, "name": "Màn hình Dell 22in FHD"})
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2

    problem(
        an.patch(f"/api/v1/products/{product_id}", json={"version": 1, "name": "Khác"}), 409, "STALE_VERSION"
    )
    assert (
        an.patch(f"/api/v1/products/{product_id}", json={"version": 2, "sku": "LCD9999"}).status_code == 422
    )


@pytest.mark.ac("AC-CAT-005")
def test_update_vat_rate_null_is_validation_error_not_crash(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    product_id = products["LCD1137"]
    an = client_as(app, AN)
    body = problem(
        an.patch(f"/api/v1/products/{product_id}", json={"version": 1, "vat_rate": None}),
        422,
        "VALIDATION_ERROR",
    )
    assert body["errors"][0]["field"] == "vat_rate"


@pytest.mark.ac("AC-CAT-006")
def test_deactivate_activate_invalid_transition(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    product_id = products["HOPMUC3053"]  # seeded inactive
    an = client_as(app, AN)

    problem(
        an.post(f"/api/v1/products/{product_id}/deactivate", json={"version": 1}), 409, "INVALID_TRANSITION"
    )
    res = an.post(f"/api/v1/products/{product_id}/activate", json={"version": 1})
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is True

    problem(
        an.post(f"/api/v1/products/{product_id}/activate", json={"version": 2}), 409, "INVALID_TRANSITION"
    )
    res = an.post(f"/api/v1/products/{product_id}/deactivate", json={"version": 2})
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is False


@pytest.mark.ac("AC-CAT-008")
def test_upload_image_then_serve(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    product_id = products["MAYBO3551"]
    an = client_as(app, AN)
    res = an.post(
        f"/api/v1/products/{product_id}/image", files={"file": ("photo.jpg", JPEG_BYTES, "image/jpeg")}
    )
    assert res.status_code == 200, res.text
    attachment_id = res.json()["image_attachment_id"]

    detail = an.get(f"/api/v1/products/{product_id}")
    assert detail.json()["image_attachment_id"] == attachment_id

    for person in (AN, HOA, TUAN):
        served = client_as(app, person).get(f"/api/v1/attachments/{attachment_id}")
        assert served.status_code == 200, served.text
        assert served.headers["content-type"] == "image/jpeg"
        assert served.content == JPEG_BYTES


@pytest.mark.ac("AC-CAT-009")
def test_upload_image_rejects_bad_magic_bytes_too_large_wrong_mime(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    product_id = products["MAYBO3551"]
    an = client_as(app, AN)

    problem(
        an.post(
            f"/api/v1/products/{product_id}/image",
            files={"file": ("photo.jpg", b"not actually an image", "image/jpeg")},
        ),
        422,
        "INVALID_FILE_TYPE",
    )
    too_big = JPEG_BYTES[:3] + b"\x00" * (11 * 1024 * 1024)
    problem(
        an.post(f"/api/v1/products/{product_id}/image", files={"file": ("big.jpg", too_big, "image/jpeg")}),
        422,
        "FILE_TOO_LARGE",
    )
    problem(
        an.post(f"/api/v1/products/{product_id}/image", files={"file": ("a.gif", JPEG_BYTES, "image/gif")}),
        422,
        "UNSUPPORTED_MEDIA_TYPE",
    )
    assert an.get(f"/api/v1/products/{product_id}").json()["image_attachment_id"] is None


@pytest.mark.ac("AC-CAT-010")
def test_serve_attachment_forbidden_and_not_found(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    product_id = products["MAYBO3551"]
    an = client_as(app, AN)
    attachment_id = an.post(
        f"/api/v1/products/{product_id}/image", files={"file": ("photo.jpg", JPEG_BYTES, "image/jpeg")}
    ).json()["image_attachment_id"]

    khoa = client_as(app, KHOA)
    assert khoa.get(f"/api/v1/attachments/{attachment_id}").status_code == 403
    problem(an.get(f"/api/v1/attachments/{uuid.uuid4()}"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-CAT-011")
def test_upload_replaces_image_keeps_old_file(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], products: dict[str, uuid.UUID]
) -> None:
    product_id = products["LCD1137"]
    an = client_as(app, AN)
    first = an.post(
        f"/api/v1/products/{product_id}/image", files={"file": ("a.jpg", JPEG_BYTES, "image/jpeg")}
    ).json()["image_attachment_id"]
    other_jpeg = JPEG_BYTES + b"\x00" * 10
    second = an.post(
        f"/api/v1/products/{product_id}/image", files={"file": ("b.jpg", other_jpeg, "image/jpeg")}
    ).json()["image_attachment_id"]

    assert second != first
    assert an.get(f"/api/v1/products/{product_id}").json()["image_attachment_id"] == second
    assert an.get(f"/api/v1/attachments/{first}").status_code == 200


@pytest.mark.ac("AC-CAT-007")
def test_routes_declare_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if "/products" in r[1] or "/attachments" in r[1]}
    assert routes == {
        ("GET", "/api/v1/products", "catalog.read"),
        ("GET", "/api/v1/products/{product_id}", "catalog.read"),
        ("POST", "/api/v1/products", "catalog.manage"),
        ("PATCH", "/api/v1/products/{product_id}", "catalog.manage"),
        ("POST", "/api/v1/products/{product_id}/deactivate", "catalog.manage"),
        ("POST", "/api/v1/products/{product_id}/activate", "catalog.manage"),
        ("POST", "/api/v1/products/{product_id}/image", "catalog.manage"),
        ("GET", "/api/v1/attachments/{attachment_id}", "catalog.read"),
    }
