"""M2-03a: catalog CSV import API (AC-CAT-033…045)."""

import uuid

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, seed
from tests.integration.test_products_api import HOA, MAYBO, TUAN, client_as, insert_product, problem
from tests.integration.test_services_api import BOMMUC
from tests.integration.test_services_api import insert_service as insert_service_row

PRODUCTS_OK_CSV = (
    "sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs\n"
    "MAYBO9101,PC SMYOU CORE I3-12100,PC,SMYOU,BO,8500000,8,true,24,I3-12100/8GB/SSD 256GB\n"
    "LCD9102,Màn hình Dell 24 inch,MONITOR,Dell,CAI,3200000,8,false,12,\n"
    "HOPMUC9103,Hộp mực Canon 325,PRINTER_SUPPLY,Canon,HOP,650000,8,true,,\n"
)

SERVICES_HEADER = "code,name,category,unit,price,vat_rate,price_fixed,default_estimated_hours,description\n"


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN)}


def csv_file(content: str) -> dict[str, tuple[str, bytes, str]]:
    return {"file": ("import.csv", content.encode("utf-8"), "text/csv")}


@pytest.mark.ac("AC-CAT-033")
def test_preview_all_valid_does_not_write_db(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    res = an.post("/api/v1/products/import/preview", files=csv_file(PRODUCTS_OK_CSV))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 3
    assert body["valid_count"] == 3
    assert body["invalid_count"] == 0
    assert [r["errors"] for r in body["rows"]] == [None, None, None]

    assert an.get("/api/v1/products", params={"q": "MAYBO9101"}).json()["total"] == 0


@pytest.mark.ac("AC-CAT-034")
def test_preview_reports_invalid_enum_per_row(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    bad = PRODUCTS_OK_CSV.replace(
        "LCD9102,Màn hình Dell 24 inch,MONITOR,", "LCD9102,Màn hình Dell 24 inch,TIVI,"
    )
    an = client_as(app, AN)
    res = an.post("/api/v1/products/import/preview", files=csv_file(bad))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["invalid_count"] == 1
    assert body["valid_count"] == 2
    assert body["rows"][0]["errors"] is None
    assert body["rows"][2]["errors"] is None
    assert body["rows"][1]["errors"] == [
        {"field": "category", "code": "invalid_enum", "message": body["rows"][1]["errors"][0]["message"]}
    ]
    assert an.get("/api/v1/products", params={"q": "MAYBO9101"}).json()["total"] == 0


@pytest.mark.ac("AC-CAT-035")
def test_commit_with_errors_returns_422_writes_nothing(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    bad = PRODUCTS_OK_CSV.replace(
        "LCD9102,Màn hình Dell 24 inch,MONITOR,", "LCD9102,Màn hình Dell 24 inch,TIVI,"
    )
    an = client_as(app, AN)
    res = an.post("/api/v1/products/import/commit", files=csv_file(bad))
    body = problem(res, 422, "IMPORT_HAS_ERRORS")
    assert len(body["rows"]) == 3
    assert body["rows"][1]["errors"] is not None
    assert an.get("/api/v1/products", params={"q": "MAYBO9101"}).json()["total"] == 0


@pytest.mark.ac("AC-CAT-036")
def test_commit_all_valid_creates_all_with_audit(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    res = an.post("/api/v1/products/import/commit", files=csv_file(PRODUCTS_OK_CSV))
    assert res.status_code == 201, res.text
    assert res.json() == {"created": 3}

    listed = an.get("/api/v1/products").json()["items"]
    by_sku = {p["sku"]: p for p in listed}
    for sku in ("MAYBO9101", "LCD9102", "HOPMUC9103"):
        assert sku in by_sku
        assert by_sku[sku]["is_active"] is True
        assert by_sku[sku]["version"] == 1

    for sku in ("MAYBO9101", "LCD9102", "HOPMUC9103"):
        product_id = by_sku[sku]["id"]
        rows = db.execute(
            text(
                "SELECT action, request_id FROM audit_events"
                " WHERE entity_type = 'PRODUCT' AND entity_id = :id"
            ),
            {"id": product_id},
        ).all()
        assert len(rows) == 1
        assert rows[0][0] == "create"

    request_ids = {
        row[0]
        for row in db.execute(
            text(
                "SELECT request_id FROM audit_events WHERE entity_type = 'PRODUCT' AND entity_id = ANY(:ids)"
            ),
            {"ids": [by_sku[s]["id"] for s in ("MAYBO9101", "LCD9102", "HOPMUC9103")]},
        ).all()
    }
    assert len(request_ids) == 1


@pytest.mark.ac("AC-CAT-037")
def test_preview_duplicate_sku_in_file(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    content = (
        "sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs\n"
        "MAYBO9101,PC A,PC,SMYOU,BO,8500000,8,true,24,\n"
        "MAYBO9101,PC B,PC,SMYOU,BO,8600000,8,true,24,\n"
    )
    an = client_as(app, AN)
    res = an.post("/api/v1/products/import/preview", files=csv_file(content))
    body = res.json()
    assert body["rows"][0]["errors"] is None
    assert body["rows"][1]["errors"] == [
        {
            "field": "sku",
            "code": "duplicate_in_file",
            "message": body["rows"][1]["errors"][0]["message"],
        }
    ]


@pytest.mark.ac("AC-CAT-038")
def test_preview_and_commit_sku_taken_in_db(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    insert_product(db, MAYBO)  # sku MAYBO3551 already exists
    content = (
        "sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs\n"
        "MAYBO3551,PC A,PC,SMYOU,BO,8500000,8,true,24,\n"
    )
    an = client_as(app, AN)
    preview = an.post("/api/v1/products/import/preview", files=csv_file(content)).json()
    assert preview["rows"][0]["errors"] == [
        {"field": "sku", "code": "taken", "message": preview["rows"][0]["errors"][0]["message"]}
    ]

    commit = problem(
        an.post("/api/v1/products/import/commit", files=csv_file(content)), 422, "IMPORT_HAS_ERRORS"
    )
    assert commit["rows"][0]["errors"][0]["code"] == "taken"


@pytest.mark.ac("AC-CAT-039")
def test_preview_empty_file(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    header_only = "sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs\n"
    problem(an.post("/api/v1/products/import/preview", files=csv_file(header_only)), 422, "EMPTY_FILE")


@pytest.mark.ac("AC-CAT-040")
def test_preview_missing_required_column(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    missing_price = (
        "sku,name,category,brand,unit,vat_rate,price_fixed,warranty_months,specs\n"
        "MAYBO9101,PC A,PC,SMYOU,BO,8,true,24,\n"
    )
    body = problem(
        an.post("/api/v1/products/import/preview", files=csv_file(missing_price)), 422, "MISSING_COLUMNS"
    )
    assert "price" in body["detail"]


@pytest.mark.ac("AC-CAT-041")
def test_preview_too_many_rows(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    header = "sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs\n"
    rows = "\n".join(f"SKU{i},Sản phẩm {i},PC,SMYOU,BO,100000,8,true,12," for i in range(501))
    problem(
        an.post("/api/v1/products/import/preview", files=csv_file(header + rows + "\n")),
        422,
        "TOO_MANY_ROWS",
    )


@pytest.mark.ac("AC-CAT-041")
def test_preview_exactly_max_rows_succeeds(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    header = "sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs\n"
    rows = "\n".join(f"SKU{i},Sản phẩm {i},PC,SMYOU,BO,100000,8,true,12," for i in range(500))
    res = an.post("/api/v1/products/import/preview", files=csv_file(header + rows + "\n"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 500
    assert body["invalid_count"] == 0


@pytest.mark.ac("AC-CAT-042")
def test_preview_invalid_file_and_file_too_large(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    not_utf8 = b"\x80\x81\x82\x83" * 20
    problem(
        an.post("/api/v1/products/import/preview", files={"file": ("bad.csv", not_utf8, "text/csv")}),
        422,
        "INVALID_FILE",
    )
    too_big = b"x" * (2 * 1024 * 1024 + 10)
    problem(
        an.post("/api/v1/products/import/preview", files={"file": ("big.csv", too_big, "text/csv")}),
        422,
        "FILE_TOO_LARGE",
    )


@pytest.mark.ac("AC-CAT-039")
@pytest.mark.ac("AC-CAT-040")
@pytest.mark.ac("AC-CAT-042")
def test_services_preview_file_level_errors(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    problem(an.post("/api/v1/services/import/preview", files=csv_file(SERVICES_HEADER)), 422, "EMPTY_FILE")

    missing_price = (
        "code,name,category,unit,vat_rate,price_fixed,default_estimated_hours,description\n"
        "DV-CAIDAT,Cài đặt máy in,INSTALLATION,LAN,8,true,1,\n"
    )
    body = problem(
        an.post("/api/v1/services/import/preview", files=csv_file(missing_price)), 422, "MISSING_COLUMNS"
    )
    assert "price" in body["detail"]

    not_utf8 = b"\x80\x81\x82\x83" * 20
    problem(
        an.post("/api/v1/services/import/preview", files={"file": ("bad.csv", not_utf8, "text/csv")}),
        422,
        "INVALID_FILE",
    )
    too_big = b"x" * (2 * 1024 * 1024 + 10)
    problem(
        an.post("/api/v1/services/import/preview", files={"file": ("big.csv", too_big, "text/csv")}),
        422,
        "FILE_TOO_LARGE",
    )


@pytest.mark.ac("AC-CAT-043")
def test_import_forbidden_for_sale_and_tech_lead(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    for person in (HOA, TUAN):
        client = client_as(app, person)
        problem(
            client.post("/api/v1/products/import/preview", files=csv_file(PRODUCTS_OK_CSV)),
            403,
            "FORBIDDEN",
        )
        problem(
            client.post("/api/v1/products/import/commit", files=csv_file(PRODUCTS_OK_CSV)),
            403,
            "FORBIDDEN",
        )
        problem(
            client.post("/api/v1/services/import/preview", files=csv_file(SERVICES_HEADER)),
            403,
            "FORBIDDEN",
        )
        problem(
            client.post("/api/v1/services/import/commit", files=csv_file(SERVICES_HEADER)),
            403,
            "FORBIDDEN",
        )
    assert an_count(db) == 0


def an_count(db: Connection) -> int:
    return db.execute(text("SELECT count(*) FROM products WHERE sku = 'MAYBO9101'")).scalar_one()


@pytest.mark.ac("AC-CAT-044")
def test_services_import_preview_and_commit(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    insert_service_row(db, BOMMUC)  # code DV-BOMMUC already exists
    an = client_as(app, AN)
    with_taken = (
        SERVICES_HEADER
        + "DV-CAIDAT,Cài đặt máy in,INSTALLATION,LAN,150000,8,true,1,\n"
        + "DV-VESINH,Vệ sinh máy tính,MAINTENANCE,LAN,80000,8,true,0.5,\n"
        + "DV-BOMMUC,Bơm mực (trùng),REFILL,LAN,50000,8,true,0.5,\n"
    )
    preview = an.post("/api/v1/services/import/preview", files=csv_file(with_taken)).json()
    assert preview["rows"][2]["errors"] == [
        {"field": "code", "code": "taken", "message": preview["rows"][2]["errors"][0]["message"]}
    ]

    ok_only = (
        SERVICES_HEADER
        + "DV-CAIDAT,Cài đặt máy in,INSTALLATION,LAN,150000,8,true,1,\n"
        + "DV-VESINH,Vệ sinh máy tính,MAINTENANCE,LAN,80000,8,true,0.5,\n"
    )
    commit = an.post("/api/v1/services/import/commit", files=csv_file(ok_only))
    assert commit.status_code == 201, commit.text
    assert commit.json() == {"created": 2}

    listed = {s["code"]: s for s in an.get("/api/v1/services").json()["items"]}
    for code in ("DV-CAIDAT", "DV-VESINH"):
        service_id = listed[code]["id"]
        actions = (
            db.execute(
                text("SELECT action FROM audit_events WHERE entity_type = 'SERVICE' AND entity_id = :id"),
                {"id": service_id},
            )
            .scalars()
            .all()
        )
        assert actions == ["create"]


@pytest.mark.ac("AC-CAT-045")
def test_routes_declare_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if "/import/" in r[1]}
    assert routes == {
        ("POST", "/api/v1/products/import/preview", "catalog.manage"),
        ("POST", "/api/v1/products/import/commit", "catalog.manage"),
        ("POST", "/api/v1/services/import/preview", "catalog.manage"),
        ("POST", "/api/v1/services/import/commit", "catalog.manage"),
    }
