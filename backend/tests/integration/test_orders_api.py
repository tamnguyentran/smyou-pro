"""M3-02a: draft orders + lines + pricing API (AC-ORD-001…023)."""

import re
import uuid
from decimal import Decimal

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
HA = Person("ha.pham@smyou.vn", "Ha@SmYou26", ("SALE", "TECHNICIAN"), "NV007", "Phạm Thu Hà", "SALES")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quốc Tuấn", "TECHNICAL")

CODE_RE = re.compile(r"DH\d{4}-\d{4}")

KH00001: dict[str, object] = {
    "code": "KH00001",
    "type": "COMPANY",
    "name": "Cty Sáng Tạo Mới",
    "contact_person": None,
    "phone": "0909123456",
    "email": None,
    "tax_code": "0312345678",
    "address": "12 Lê Lợi, Q1, TP.HCM",
    "note": None,
}

PC_I5 = {
    "sku": "PC-I5-12400",
    "name": "PC SMYOU CORE I5-12400",
    "category": "PC",
    "unit": "BO",
    "price": 11_980_000,
    "vat_rate": Decimal("0"),
    "price_fixed": False,
}
LCD = {
    "sku": "LCD-DELL22",
    "name": "Màn hình Dell 22 inch",
    "category": "MONITOR",
    "unit": "CAI",
    "price": 2_500_000,
    "vat_rate": Decimal("8"),
    "price_fixed": True,
}
CAM = {
    "sku": "CAM-IMOU-2M",
    "name": "Camera IMOU 2MP",
    "category": "CAMERA",
    "unit": "CAI",
    "price": 1_000_000,
    "vat_rate": Decimal("8"),
    "price_fixed": False,
    "is_active": False,
}
DV_BOMMUC = {
    "code": "DV-BOMMUC",
    "name": "Bơm mực máy in",
    "category": "REFILL",
    "unit": "LAN",
    "price": 790_000,
    "vat_rate": Decimal("8"),
    "price_fixed": True,
}


def insert_customer(db: Connection, customer: dict[str, object], *, created_by: uuid.UUID) -> uuid.UUID:
    customer_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO customers (id, code, type, name, contact_person, phone, email, tax_code,"
            " address, note, created_by, version)"
            " VALUES (:id, :code, :type, :name, :contact_person, :phone, :email, :tax_code,"
            " :address, :note, :created_by, 1)"
        ),
        {"id": customer_id, "created_by": created_by, **customer},
    )
    return customer_id


def insert_product(db: Connection, product: dict[str, object]) -> uuid.UUID:
    product_id = uuid.uuid4()
    row = {"is_active": True, **product}
    db.execute(
        text(
            "INSERT INTO products (id, sku, name, category, unit, price, vat_rate, price_fixed,"
            " is_active, version)"
            " VALUES (:id, :sku, :name, :category, :unit, :price, :vat_rate, :price_fixed,"
            " :is_active, 1)"
        ),
        {"id": product_id, **row},
    )
    return product_id


def insert_service(db: Connection, service: dict[str, object]) -> uuid.UUID:
    service_id = uuid.uuid4()
    row = {"is_active": True, **service}
    db.execute(
        text(
            "INSERT INTO services (id, code, name, category, unit, price, vat_rate, price_fixed,"
            " is_active, version)"
            " VALUES (:id, :code, :name, :category, :unit, :price, :vat_rate, :price_fixed,"
            " :is_active, 1)"
        ),
        {"id": service_id, **row},
    )
    return service_id


def insert_order(db: Connection, *, created_by: uuid.UUID, status: str) -> uuid.UUID:
    order_id = uuid.uuid4()
    code = f"DH0000-{uuid.uuid4().hex[:4]}"
    db.execute(
        text(
            "INSERT INTO orders (id, code, status, created_by, version) VALUES"
            " (:id, :code, :status, :created_by, 1)"
        ),
        {"id": order_id, "code": code, "status": status, "created_by": created_by},
    )
    return order_id


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


def problem(res: httpx.Response, status: int, code: str) -> dict[str, object]:
    assert res.status_code == status, res.text
    body: dict[str, object] = res.json()
    assert body["code"] == code
    return body


def error_fields(body: dict[str, object]) -> list[str]:
    errors = body["errors"]
    assert isinstance(errors, list)
    return [str(e["field"]) for e in errors]


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, HA, TUAN, KHOA)}


@pytest.fixture
def kh00001(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    return insert_customer(db, KH00001, created_by=people["NV005"])


@pytest.fixture
def catalog(db: Connection) -> dict[str, uuid.UUID]:
    return {
        "PC-I5-12400": insert_product(db, PC_I5),
        "LCD-DELL22": insert_product(db, LCD),
        "CAM-IMOU-2M": insert_product(db, CAM),
        "DV-BOMMUC": insert_service(db, DV_BOMMUC),
    }


@pytest.mark.ac("AC-ORD-001")
def test_create_with_existing_customer(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], kh00001: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)

    res = hoa.post(
        "/api/v1/orders",
        json={
            "customer_id": str(kh00001),
            "division": "OFFICE_EQUIPMENT",
            "service_address": "12 Lê Lợi, Q1",
            "work_description": "Lắp PC mới",
            "priority": "NORMAL",
            "requested_date": "2026-10-05",
        },
    )

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "DRAFT"
    assert CODE_RE.fullmatch(body["code"])
    assert body["version"] == 1
    assert (body["customer_name"], body["customer_phone"]) == ("Cty Sáng Tạo Mới", "0909123456")
    assert (body["subtotal"], body["discount_amount"], body["vat_amount"], body["total"]) == (0, 0, 0, 0)
    assert body["lines"] == []
    assert body["created_by"] == str(people["NV005"])


@pytest.mark.ac("AC-ORD-002")
def test_create_empty_draft_allowed(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)

    res = hoa.post("/api/v1/orders", json={})

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["priority"] == "NORMAL"
    assert body["payment_status"] == "UNPAID"
    assert body["division"] is None


@pytest.mark.ac("AC-ORD-003")
def test_create_walk_in_customer(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)

    res = hoa.post("/api/v1/orders", json={"customer_name": "Anh Long", "customer_phone": "0977888999"})

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["customer_id"] is None
    assert (body["customer_name"], body["customer_phone"]) == ("Anh Long", "0977888999")


@pytest.mark.ac("AC-ORD-004")
@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"customer_id": str(uuid.uuid4())}, "customer_id"),
        ({"priority": "WRONG"}, "priority"),
        ({"division": "WRONG"}, "division"),
        ({"payment_status": "PAID"}, "payment_method"),
        ({"requested_date": "not-a-date"}, "requested_date"),
    ],
)
def test_create_validation_errors(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], change: dict[str, object], field: str
) -> None:
    hoa = client_as(app, HOA)

    body = problem(hoa.post("/api/v1/orders", json=change), 422, "VALIDATION_ERROR")

    assert field in error_fields(body)


@pytest.mark.ac("AC-ORD-005")
def test_create_rbac(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    for person in (AN, HOA):
        client = client_as(app, person)
        assert client.post("/api/v1/orders", json={}).status_code == 201

    khoa = client_as(app, KHOA)
    problem(khoa.post("/api/v1/orders", json={}), 403, "FORBIDDEN")


@pytest.mark.ac("AC-ORD-006")
def test_update_scope_own_vs_manager(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    ha = client_as(app, HA)
    problem(
        ha.patch(f"/api/v1/orders/{order['id']}", json={"version": 1, "work_description": "sửa"}),
        404,
        "NOT_FOUND",
    )

    an = client_as(app, AN)
    res = an.patch(f"/api/v1/orders/{order['id']}", json={"version": 1, "work_description": "sửa"})
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2


@pytest.mark.ac("AC-ORD-007")
def test_update_switch_to_walk_in_and_stale_version(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], kh00001: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={"customer_id": str(kh00001)}).json()

    res = hoa.patch(
        f"/api/v1/orders/{order['id']}",
        json={
            "version": 1,
            "customer_id": None,
            "customer_name": "Chị Lan",
            "customer_phone": "0933111222",
        },
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["version"] == 2
    assert body["customer_id"] is None
    assert (body["customer_name"], body["customer_phone"]) == ("Chị Lan", "0933111222")

    stale = hoa.patch(f"/api/v1/orders/{order['id']}", json={"version": 1, "work_description": "x"})
    problem(stale, 409, "STALE_VERSION")


@pytest.mark.ac("AC-ORD-007")
def test_update_walk_in_partial_patch_keeps_other_customer_fields(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post(
        "/api/v1/orders",
        json={
            "customer_name": "Anh Long",
            "customer_phone": "0977888999",
            "customer_tax_code": "0311111111",
        },
    ).json()

    res = hoa.patch(
        f"/api/v1/orders/{order['id']}",
        json={"version": order["version"], "customer_phone": "0900000000"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["customer_phone"] == "0900000000"
    assert body["customer_name"] == "Anh Long"
    assert body["customer_tax_code"] == "0311111111"


@pytest.mark.ac("AC-ORD-034")
def test_update_clears_optional_text_fields_without_500(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    """The UI (M3-02b) sends `null` for a Section 1 field the user left blank — service_address and
    work_description are NOT NULL columns (default ""), so PATCH must coerce null to "" instead of
    letting it hit the DB as a literal NULL (regression: this 500'd before this fix)."""
    hoa = client_as(app, HOA)
    order = hoa.post(
        "/api/v1/orders",
        json={"service_address": "12 Lê Lợi, Q1", "work_description": "Lắp máy in"},
    ).json()
    assert order["service_address"] == "12 Lê Lợi, Q1"

    res = hoa.patch(
        f"/api/v1/orders/{order['id']}",
        json={"version": order["version"], "service_address": None, "work_description": None},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["service_address"] == ""
    assert body["work_description"] == ""


@pytest.mark.ac("AC-ORD-008")
def test_add_line_product_fixed_price(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "2",
            "unit_price": 2_500_000,
            "vat_rate": "8",
        },
    )

    assert res.status_code == 201, res.text
    body = res.json()
    line = body["lines"][0]
    assert line["price_fixed"] is True
    assert line["catalog_price_snapshot"] == 2_500_000
    assert (line["line_gross"], line["line_discount"], line["line_vat"], line["line_total"]) == (
        5_000_000,
        0,
        400_000,
        5_400_000,
    )
    assert (body["subtotal"], body["vat_amount"], body["total"]) == (5_000_000, 400_000, 5_400_000)
    assert body["version"] == order["version"] + 1


@pytest.mark.ac("AC-ORD-009")
def test_add_line_price_fixed_rejects_mismatch(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "1",
            "unit_price": 2_600_000,
            "vat_rate": "8",
        },
    )

    body = problem(res, 422, "PRICE_FIXED")
    assert error_fields(body)[0] == "unit_price"

    refreshed = hoa.get(f"/api/v1/orders/{order['id']}").json()
    assert refreshed["version"] == order["version"]
    assert refreshed["lines"] == []


@pytest.mark.ac("AC-ORD-010")
def test_add_line_gift_forces_zero_price(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "1",
            "unit_price": 9_999_999,
            "vat_rate": "8",
            "is_gift": True,
        },
    )

    assert res.status_code == 201, res.text
    line = res.json()["lines"][0]
    assert line["unit_price"] == 0
    assert (line["line_gross"], line["line_vat"], line["line_total"]) == (0, 0, 0)


@pytest.mark.ac("AC-ORD-011")
def test_add_line_service_matches_real_invoice(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "SERVICE",
            "service_id": str(catalog["DV-BOMMUC"]),
            "quantity": "1",
            "unit_price": 790_000,
            "vat_rate": "8",
        },
    )

    assert res.status_code == 201, res.text
    line = res.json()["lines"][0]
    assert (line["line_gross"], line["line_vat"], line["line_total"]) == (790_000, 63_200, 853_200)


@pytest.mark.ac("AC-ORD-012")
def test_add_line_discount_and_zero_vat_matches_real_invoice(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["PC-I5-12400"]),
            "quantity": "1",
            "unit_price": 11_980_000,
            "vat_rate": "0",
            "line_discount": 180_000,
        },
    )

    assert res.status_code == 201, res.text
    line = res.json()["lines"][0]
    assert (line["line_gross"], line["line_discount"], line["line_vat"], line["line_total"]) == (
        11_980_000,
        180_000,
        0,
        11_800_000,
    )


@pytest.mark.ac("AC-ORD-013")
def test_add_line_custom_item(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "CUSTOM",
            "name": "Công tháo dỡ tủ mạng cũ",
            "unit": "LAN",
            "quantity": "1",
            "unit_price": 500_000,
            "vat_rate": "10",
        },
    )

    assert res.status_code == 201, res.text
    line = res.json()["lines"][0]
    assert (line["product_id"], line["service_id"], line["sku_snapshot"]) == (None, None, None)
    assert line["price_fixed"] is False
    assert line["name_snapshot"] == "Công tháo dỡ tủ mạng cũ"

    missing_vat = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": res.json()["version"],
            "item_type": "CUSTOM",
            "name": "Việc khác",
            "unit": "LAN",
            "quantity": "1",
            "unit_price": 100_000,
        },
    )
    body = problem(missing_vat, 422, "VALIDATION_ERROR")
    assert "vat_rate" in error_fields(body)


@pytest.mark.ac("AC-ORD-014")
@pytest.mark.parametrize(
    ("change", "status", "code", "field"),
    [
        ({"quantity": "0"}, 422, "VALIDATION_ERROR", "quantity"),
        ({"quantity": "-1"}, 422, "VALIDATION_ERROR", "quantity"),
        ({"line_discount": 3_000_000}, 422, "DISCOUNT_EXCEEDS_GROSS", "line_discount"),
        ({"vat_rate": "101"}, 422, "VALIDATION_ERROR", "vat_rate"),
        ({"vat_rate": "8.125"}, 422, "VALIDATION_ERROR", "vat_rate"),
        ({"product_id": "__CAM__"}, 422, "ITEM_INACTIVE", "product_id"),
        ({"product_id": None}, 422, "VALIDATION_ERROR", "product_id"),
    ],
)
def test_add_line_validation_errors(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    catalog: dict[str, uuid.UUID],
    change: dict[str, object],
    status: int,
    code: str,
    field: str,
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()
    payload = {
        "version": order["version"],
        "item_type": "PRODUCT",
        "product_id": str(catalog["LCD-DELL22"]),
        "quantity": "1",
        "unit_price": 2_500_000,
        "vat_rate": "8",
        **change,
    }
    if payload.get("product_id") == "__CAM__":
        payload["product_id"] = str(catalog["CAM-IMOU-2M"])

    body = problem(hoa.post(f"/api/v1/orders/{order['id']}/lines", json=payload), status, code)

    assert field in error_fields(body)


@pytest.mark.ac("AC-ORD-015")
def test_add_line_stale_version(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()
    first = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "1",
            "unit_price": 2_500_000,
            "vat_rate": "8",
        },
    ).json()

    stale = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "1",
            "unit_price": 2_500_000,
            "vat_rate": "8",
        },
    )

    problem(stale, 409, "STALE_VERSION")
    assert len(first["lines"]) == 1


@pytest.mark.ac("AC-ORD-016")
def test_mutations_rejected_when_not_draft(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="PENDING_DISPATCH")
    hoa = client_as(app, HOA)
    fake_line_id = uuid.uuid4()

    problem(
        hoa.patch(f"/api/v1/orders/{order_id}", json={"version": 1, "work_description": "x"}),
        409,
        "ORDER_NOT_DRAFT",
    )
    problem(
        hoa.post(
            f"/api/v1/orders/{order_id}/lines",
            json={
                "version": 1,
                "item_type": "CUSTOM",
                "name": "x",
                "unit": "CAI",
                "quantity": "1",
                "unit_price": 1000,
                "vat_rate": "8",
            },
        ),
        409,
        "ORDER_NOT_DRAFT",
    )
    problem(
        hoa.patch(f"/api/v1/orders/{order_id}/lines/{fake_line_id}", json={"version": 1, "quantity": "2"}),
        409,
        "ORDER_NOT_DRAFT",
    )
    problem(
        hoa.post(f"/api/v1/orders/{order_id}/lines/{fake_line_id}/remove", json={"version": 1}),
        409,
        "ORDER_NOT_DRAFT",
    )


@pytest.mark.ac("AC-ORD-017")
def test_update_line_recomputes_totals(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()
    with_line = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "2",
            "unit_price": 2_500_000,
            "vat_rate": "8",
        },
    ).json()
    line_id = with_line["lines"][0]["id"]

    res = hoa.patch(
        f"/api/v1/orders/{order['id']}/lines/{line_id}",
        json={"version": with_line["version"], "quantity": "3"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    line = body["lines"][0]
    assert (line["line_gross"], line["line_vat"], line["line_total"]) == (7_500_000, 600_000, 8_100_000)
    assert (body["subtotal"], body["vat_amount"], body["total"]) == (7_500_000, 600_000, 8_100_000)


@pytest.mark.ac("AC-ORD-018")
def test_remove_line(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()
    with_line = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "1",
            "unit_price": 2_500_000,
            "vat_rate": "8",
        },
    ).json()
    line_id = with_line["lines"][0]["id"]

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines/{line_id}/remove", json={"version": with_line["version"]}
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["lines"] == []
    assert (body["subtotal"], body["vat_amount"], body["total"]) == (0, 0, 0)

    problem(
        hoa.post(f"/api/v1/orders/{order['id']}/lines/{line_id}/remove", json={"version": body["version"]}),
        404,
        "NOT_FOUND",
    )


@pytest.mark.ac("AC-ORD-018")
def test_add_line_position_not_reused_after_remove(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    def add_line(version: int) -> dict:
        return hoa.post(
            f"/api/v1/orders/{order['id']}/lines",
            json={
                "version": version,
                "item_type": "PRODUCT",
                "product_id": str(catalog["LCD-DELL22"]),
                "quantity": "1",
                "unit_price": 2_500_000,
                "vat_rate": "8",
            },
        ).json()

    first = add_line(order["version"])
    second = add_line(first["version"])
    first_line_id = second["lines"][0]["id"]

    after_remove = hoa.post(
        f"/api/v1/orders/{order['id']}/lines/{first_line_id}/remove",
        json={"version": second["version"]},
    ).json()

    third = add_line(after_remove["version"])

    positions = sorted(line["position"] for line in third["lines"])
    assert positions == sorted(set(positions)), positions


@pytest.mark.ac("AC-ORD-019")
def test_get_order_totals_across_lines(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], catalog: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()
    after_lcd = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "2",
            "unit_price": 2_500_000,
            "vat_rate": "8",
        },
    ).json()
    hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": after_lcd["version"],
            "item_type": "SERVICE",
            "service_id": str(catalog["DV-BOMMUC"]),
            "quantity": "1",
            "unit_price": 790_000,
            "vat_rate": "8",
        },
    )

    res = hoa.get(f"/api/v1/orders/{order['id']}")

    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["subtotal"], body["discount_amount"], body["vat_amount"], body["total"]) == (
        5_790_000,
        0,
        463_200,
        6_253_200,
    )
    assert [line["position"] for line in body["lines"]] == sorted(line["position"] for line in body["lines"])
    assert len(body["lines"]) == 2


@pytest.mark.ac("AC-ORD-020")
def test_read_scope_all_vs_technician_404(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    for person in (HOA, HA, AN, TUAN):
        client = client_as(app, person)
        assert client.get(f"/api/v1/orders/{order['id']}").status_code == 200

    khoa = client_as(app, KHOA)
    problem(khoa.get(f"/api/v1/orders/{order['id']}"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-ORD-023")
def test_routes_declare_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if "/orders" in r[1]}
    assert routes == {
        ("POST", "/api/v1/orders", "order.create"),
        ("GET", "/api/v1/orders/{order_id}", "order.read"),
        ("PATCH", "/api/v1/orders/{order_id}", "order.edit_draft"),
        ("POST", "/api/v1/orders/{order_id}/lines", "order.edit_draft"),
        ("PATCH", "/api/v1/orders/{order_id}/lines/{line_id}", "order.edit_draft"),
        ("POST", "/api/v1/orders/{order_id}/lines/{line_id}/remove", "order.edit_draft"),
    }


def test_mutations_write_audit_events(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    """CLAUDE.md rule 8: every state-changing command appends to audit_events."""
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()
    hoa.patch(f"/api/v1/orders/{order['id']}", json={"version": 1, "work_description": "cập nhật"})
    with_line = hoa.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": 2,
            "item_type": "CUSTOM",
            "name": "Việc",
            "unit": "LAN",
            "quantity": "1",
            "unit_price": 100_000,
            "vat_rate": "8",
        },
    ).json()
    line_id = with_line["lines"][0]["id"]
    hoa.patch(
        f"/api/v1/orders/{order['id']}/lines/{line_id}",
        json={"version": with_line["version"], "quantity": "2"},
    )
    hoa.post(
        f"/api/v1/orders/{order['id']}/lines/{line_id}/remove", json={"version": with_line["version"] + 1}
    )

    actions = (
        db.execute(
            text(
                "SELECT action FROM audit_events WHERE entity_type = 'ORDER' AND entity_id = :id"
                " ORDER BY occurred_at, seq"
            ),
            {"id": order["id"]},
        )
        .scalars()
        .all()
    )
    assert actions == ["create", "update", "add_line", "update_line", "remove_line"]
