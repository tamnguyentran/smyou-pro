"""M3-02a: draft orders + lines + pricing API (AC-ORD-001…023).
M3-03a: submit/recall/cancel, list, allowed_commands, history (AC-ORD-040…060).
"""

import re
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.engine import Row

from app.core.authz import declared_routes, undeclared_routes
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


def insert_order(
    db: Connection,
    *,
    created_by: uuid.UUID,
    status: str,
    customer_name: str | None = None,
    customer_phone: str | None = None,
    service_address: str | None = None,
    work_description: str | None = None,
    created_at: datetime | None = None,
) -> uuid.UUID:
    order_id = uuid.uuid4()
    code = f"DH0000-{uuid.uuid4().hex[:4]}"
    columns = ["id", "code", "status", "created_by"]
    params: dict[str, object] = {"id": order_id, "code": code, "status": status, "created_by": created_by}
    extra = {
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "service_address": service_address,
        "work_description": work_description,
        "created_at": created_at,
    }
    for column, value in extra.items():
        if value is not None:
            columns.append(column)
            params[column] = value
    placeholders = ", ".join(f":{c}" for c in columns)
    query = f"INSERT INTO orders ({', '.join(columns)}, version) VALUES ({placeholders}, 1)"  # noqa: S608  # column names are literal strings from the fixed set above, not user input
    db.execute(text(query), params)
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


def audit_rows(db: Connection, entity_id: uuid.UUID) -> list[Row]:
    return db.execute(
        text("SELECT * FROM audit_events WHERE entity_id = :id ORDER BY occurred_at, seq"), {"id": entity_id}
    ).all()


def submittable_order(client: TestClient, *, customer_id: uuid.UUID, product_id: uuid.UUID) -> dict:
    order = client.post(
        "/api/v1/orders",
        json={"customer_id": str(customer_id), "service_address": "12 Lê Lợi, Q1"},
    ).json()
    return client.post(
        f"/api/v1/orders/{order['id']}/lines",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(product_id),
            "quantity": "1",
            "unit_price": 2_500_000,
            "vat_rate": "8",
        },
    ).json()


def submitted_order(client: TestClient, *, customer_id: uuid.UUID, product_id: uuid.UUID) -> dict:
    """M3-04a fixture: a PENDING_DISPATCH order (1 line, LCD-DELL22 qty=1, line_total=2_700_000)."""
    draft = submittable_order(client, customer_id=customer_id, product_id=product_id)
    return client.post(f"/api/v1/orders/{draft['id']}/submit", json={"version": draft["version"]}).json()


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, HA, TUAN, KHOA)}


@pytest.fixture
def three_orders(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    """AC-ORD-054…056 fixture: 3 orders in different statuses, spaced `created_at` for deterministic sort."""
    return {
        "C": insert_order(
            db,
            created_by=people["NV001"],
            status="CANCELLED",
            customer_name="Chị Lan",
            customer_phone="0933111222",
            created_at=datetime(2026, 9, 28, tzinfo=UTC),
        ),
        "B": insert_order(
            db,
            created_by=people["NV005"],
            status="PENDING_DISPATCH",
            customer_name="Anh Long",
            customer_phone="0977888999",
            created_at=datetime(2026, 9, 29, tzinfo=UTC),
        ),
        "A": insert_order(
            db,
            created_by=people["NV005"],
            status="DRAFT",
            customer_name="Cty Sáng Tạo Mới",
            customer_phone="0909123456",
            created_at=datetime(2026, 9, 30, tzinfo=UTC),
        ),
    }


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
@pytest.mark.ac("AC-ORD-060")
@pytest.mark.ac("AC-ORD-079")
@pytest.mark.ac("AC-ORD-089")
@pytest.mark.ac("AC-CMP-010")
@pytest.mark.ac("AC-ORD-135")
def test_routes_declare_capability(app: FastAPI) -> None:
    # M4-01a's /tasks routes share the "/orders" prefix but belong to the dispatch module/router —
    # asserted separately in test_dispatch_api.py::test_routes_declare_capability (AC-DSP-014).
    routes = {r for r in declared_routes(app) if "/orders" in r[1] and "/tasks" not in r[1]}
    assert routes == {
        ("POST", "/api/v1/orders", "order.create"),
        ("GET", "/api/v1/orders", "order.read"),
        ("GET", "/api/v1/orders/{order_id}", "order.read"),
        ("PATCH", "/api/v1/orders/{order_id}", "order.edit_draft"),
        ("POST", "/api/v1/orders/{order_id}/lines", "order.edit_draft"),
        ("PATCH", "/api/v1/orders/{order_id}/lines/{line_id}", "order.edit_draft"),
        ("POST", "/api/v1/orders/{order_id}/lines/{line_id}/remove", "order.edit_draft"),
        ("POST", "/api/v1/orders/{order_id}/submit", "order.submit"),
        ("POST", "/api/v1/orders/{order_id}/recall", "order.submit"),
        ("POST", "/api/v1/orders/{order_id}/cancel", "order.cancel"),
        ("POST", "/api/v1/orders/{order_id}/complete", "order.complete"),
        ("GET", "/api/v1/orders/{order_id}/history", "order.read"),
        ("PATCH", "/api/v1/orders/{order_id}/contact", "order.edit_contact"),
        ("POST", "/api/v1/orders/{order_id}/confirmation-attachments", "order.upload_confirmation"),
        ("GET", "/api/v1/orders/{order_id}/confirmation-attachments", "order.read"),
        ("POST", "/api/v1/orders/{order_id}/lines-after-submit", "order.edit_lines_after_submit"),
        (
            "PATCH",
            "/api/v1/orders/{order_id}/lines-after-submit/{line_id}",
            "order.edit_lines_after_submit",
        ),
        (
            "POST",
            "/api/v1/orders/{order_id}/lines-after-submit/{line_id}/remove",
            "order.edit_lines_after_submit",
        ),
    }


@pytest.mark.ac("AC-CMP-010")
def test_attachments_get_is_dynamic_not_undeclared(app: FastAPI) -> None:
    """`GET /attachments/{id}` picks its capability per-record (owner_type), so it can't declare
    exactly one statically — it must be listed in `permissions.dynamic_routes` instead of tripping
    `undeclared_routes`'s "declares no capability" check, and it must NOT appear in
    `declared_routes()` (that function is only for the single-static-capability case)."""
    permissions = app.state.specs.permissions
    assert "GET /api/v1/attachments/{attachment_id}" in permissions.dynamic_routes
    assert undeclared_routes(app, permissions) == []
    assert not any(r[1] == "/api/v1/attachments/{attachment_id}" for r in declared_routes(app))


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


# ---------------- M3-03a: submit / recall / cancel / list / allowed_commands / history ----------------


@pytest.mark.ac("AC-ORD-040")
def test_submit_happy_path(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    res = hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "PENDING_DISPATCH"
    assert body["version"] == order["version"] + 1
    assert body["allowed_commands"] == ["recall", "cancel"]

    row = (
        db.execute(text("SELECT submitted_at FROM orders WHERE id = :id"), {"id": order["id"]})
        .mappings()
        .one()
    )
    assert row["submitted_at"] is not None
    events = audit_rows(db, uuid.UUID(order["id"]))
    submit_event = next(e for e in events if e.action == "submit")
    assert (submit_event.from_status, submit_event.to_status) == ("DRAFT", "PENDING_DISPATCH")
    assert submit_event.actor_id == people["NV005"]


@pytest.mark.ac("AC-ORD-041")
def test_recall_happy_path(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    submitted = hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}).json()

    res = hoa.post(f"/api/v1/orders/{order['id']}/recall", json={"version": submitted["version"]})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "DRAFT"
    assert body["version"] == submitted["version"] + 1
    assert body["allowed_commands"] == ["submit", "cancel"]
    events = audit_rows(db, uuid.UUID(order["id"]))
    recall_event = next(e for e in events if e.action == "recall")
    assert (recall_event.from_status, recall_event.to_status) == ("PENDING_DISPATCH", "DRAFT")


@pytest.mark.ac("AC-ORD-042")
def test_cancel_from_draft(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    submitted = hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}).json()
    recalled = hoa.post(f"/api/v1/orders/{order['id']}/recall", json={"version": submitted["version"]}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/cancel",
        json={"version": recalled["version"], "reason": "Khách đổi ý không mua nữa"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "CANCELLED"
    assert body["version"] == recalled["version"] + 1
    assert body["allowed_commands"] == []

    row = (
        db.execute(text("SELECT cancelled_at, cancel_reason FROM orders WHERE id = :id"), {"id": order["id"]})
        .mappings()
        .one()
    )
    assert row["cancelled_at"] is not None
    assert row["cancel_reason"] == "Khách đổi ý không mua nữa"
    cancel_event = next(e for e in audit_rows(db, uuid.UUID(order["id"])) if e.action == "cancel")
    assert (cancel_event.from_status, cancel_event.to_status) == ("DRAFT", "CANCELLED")
    payload = cancel_event.data if isinstance(cancel_event.data, dict) else {}
    assert payload["reason"] == "Khách đổi ý không mua nữa"


@pytest.mark.ac("AC-ORD-043")
def test_cancel_from_pending_dispatch(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    submitted = hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}).json()

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/cancel",
        json={"version": submitted["version"], "reason": "Lắp sai địa chỉ, tạo lại đơn mới"},
    )

    assert res.status_code == 200, res.text
    assert res.json()["status"] == "CANCELLED"
    cancel_event = next(e for e in audit_rows(db, uuid.UUID(order["id"])) if e.action == "cancel")
    assert cancel_event.from_status == "PENDING_DISPATCH"


@pytest.mark.ac("AC-ORD-044")
def test_submit_guard_customer_present(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post(
        "/api/v1/orders",
        json={"service_address": "12 Lê Lợi, Q1", "work_description": "Lắp đặt máy in"},
    ).json()

    res = hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]})

    body = problem(res, 409, "GUARD_FAILED")
    assert body["guard"] == "customer_present"
    assert hoa.get(f"/api/v1/orders/{order['id']}").json()["status"] == "DRAFT"


@pytest.mark.ac("AC-ORD-045")
def test_submit_guard_has_lines_or_description(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], kh00001: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post(
        "/api/v1/orders", json={"customer_id": str(kh00001), "service_address": "12 Lê Lợi, Q1"}
    ).json()

    body = problem(
        hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}),
        409,
        "GUARD_FAILED",
    )
    assert body["guard"] == "has_lines_or_description"


@pytest.mark.ac("AC-ORD-046")
def test_submit_guard_service_address_present(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], kh00001: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post(
        "/api/v1/orders", json={"customer_id": str(kh00001), "work_description": "Lắp đặt máy in"}
    ).json()

    body = problem(
        hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}),
        409,
        "GUARD_FAILED",
    )
    assert body["guard"] == "service_address_present"


@pytest.mark.ac("AC-ORD-047")
def test_cancel_guard_reason_present(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    no_reason = problem(
        hoa.post(f"/api/v1/orders/{order['id']}/cancel", json={"version": order["version"]}),
        409,
        "GUARD_FAILED",
    )
    assert no_reason["guard"] == "reason_present"

    too_short = problem(
        hoa.post(f"/api/v1/orders/{order['id']}/cancel", json={"version": order["version"], "reason": "abc"}),
        409,
        "GUARD_FAILED",
    )
    assert too_short["guard"] == "reason_present"

    too_short_padded = problem(
        hoa.post(
            f"/api/v1/orders/{order['id']}/cancel", json={"version": order["version"], "reason": "  ab  "}
        ),
        409,
        "GUARD_FAILED",
    )
    assert too_short_padded["guard"] == "reason_present"
    assert hoa.get(f"/api/v1/orders/{order['id']}").json()["status"] == "DRAFT"


@pytest.mark.ac("AC-ORD-048")
def test_submit_invalid_transition_already_pending(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    submitted = hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}).json()

    problem(
        hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": submitted["version"]}),
        409,
        "INVALID_TRANSITION",
    )


@pytest.mark.ac("AC-ORD-049")
def test_recall_invalid_transition_from_draft(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    order = hoa.post("/api/v1/orders", json={}).json()

    problem(
        hoa.post(f"/api/v1/orders/{order['id']}/recall", json={"version": order["version"]}),
        409,
        "INVALID_TRANSITION",
    )


@pytest.mark.ac("AC-ORD-050")
def test_all_commands_invalid_on_cancelled(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    order_id = insert_order(db, created_by=people["NV005"], status="CANCELLED")
    hoa = client_as(app, HOA)

    problem(hoa.post(f"/api/v1/orders/{order_id}/submit", json={"version": 1}), 409, "INVALID_TRANSITION")
    problem(hoa.post(f"/api/v1/orders/{order_id}/recall", json={"version": 1}), 409, "INVALID_TRANSITION")
    problem(
        hoa.post(f"/api/v1/orders/{order_id}/cancel", json={"version": 1, "reason": "Huỷ lần nữa"}),
        409,
        "INVALID_TRANSITION",
    )


@pytest.mark.ac("AC-ORD-051")
def test_recall_stale_version(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    submitted = hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}).json()

    problem(
        hoa.post(f"/api/v1/orders/{order['id']}/recall", json={"version": submitted["version"] - 1}),
        409,
        "STALE_VERSION",
    )


@pytest.mark.ac("AC-ORD-052")
def test_submit_scope(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    ha = client_as(app, HA)
    problem(
        ha.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}), 404, "NOT_FOUND"
    )

    khoa = client_as(app, KHOA)
    problem(
        khoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}),
        403,
        "FORBIDDEN",
    )

    an = client_as(app, AN)
    res = an.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]})
    assert res.status_code == 200, res.text


@pytest.mark.ac("AC-ORD-053")
def test_cancel_scope(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    ha = client_as(app, HA)
    problem(
        ha.post(
            f"/api/v1/orders/{order['id']}/cancel", json={"version": order["version"], "reason": "Huỷ thử"}
        ),
        404,
        "NOT_FOUND",
    )

    khoa = client_as(app, KHOA)
    problem(
        khoa.post(
            f"/api/v1/orders/{order['id']}/cancel", json={"version": order["version"], "reason": "Huỷ thử"}
        ),
        403,
        "FORBIDDEN",
    )

    an = client_as(app, AN)
    res = an.post(
        f"/api/v1/orders/{order['id']}/cancel", json={"version": order["version"], "reason": "Huỷ thử"}
    )
    assert res.status_code == 200, res.text


@pytest.mark.ac("AC-ORD-054")
def test_list_orders_basic(app: FastAPI, db: Connection, three_orders: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)

    res = hoa.get("/api/v1/orders?limit=20&offset=0")

    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["total"], body["limit"], body["offset"]) == (3, 20, 0)
    ids = [item["id"] for item in body["items"]]
    assert ids == [str(three_orders["A"]), str(three_orders["B"]), str(three_orders["C"])]
    assert set(body["items"][0].keys()) == {
        "id",
        "code",
        "status",
        "customer_name",
        "customer_phone",
        "division",
        "priority",
        "total",
        "requested_date",
        "created_by",
        "created_by_name",
        "created_at",
    }
    # order A was created by HOA (NV005) — M3-03b's list page needs a name, not just the UUID.
    assert body["items"][0]["created_by_name"] == "Lê Thị Hoa"


@pytest.mark.ac("AC-ORD-055")
def test_list_orders_filters(app: FastAPI, db: Connection, three_orders: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)

    by_status = hoa.get("/api/v1/orders?status=PENDING_DISPATCH").json()
    assert [item["id"] for item in by_status["items"]] == [str(three_orders["B"])]

    by_phone = hoa.get("/api/v1/orders?q=0977888999").json()
    assert [item["id"] for item in by_phone["items"]] == [str(three_orders["B"])]

    by_name = hoa.get("/api/v1/orders?q=chị lan").json()
    assert [item["id"] for item in by_name["items"]] == [str(three_orders["C"])]

    problem(hoa.get("/api/v1/orders?limit=101"), 422, "VALIDATION_ERROR")


@pytest.mark.ac("AC-ORD-056")
def test_list_orders_scope(app: FastAPI, db: Connection, three_orders: dict[str, uuid.UUID]) -> None:
    for person in (HOA, AN, TUAN):
        client = client_as(app, person)
        assert client.get("/api/v1/orders").json()["total"] == 3

    khoa = client_as(app, KHOA)
    body = khoa.get("/api/v1/orders").json()
    assert body == {"items": [], "total": 0, "limit": 20, "offset": 0}


@pytest.mark.ac("AC-ORD-057")
def test_allowed_commands_draft(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    for person in (HOA, AN):
        client = client_as(app, person)
        assert client.get(f"/api/v1/orders/{order['id']}").json()["allowed_commands"] == ["submit", "cancel"]

    ha = client_as(app, HA)
    assert ha.get(f"/api/v1/orders/{order['id']}").json()["allowed_commands"] == []

    tuan = client_as(app, TUAN)
    assert tuan.get(f"/api/v1/orders/{order['id']}").json()["allowed_commands"] == []


@pytest.mark.ac("AC-ORD-058")
def test_allowed_commands_pending_and_cancelled(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    submitted = hoa.post(f"/api/v1/orders/{order['id']}/submit", json={"version": order["version"]}).json()
    assert submitted["allowed_commands"] == ["recall", "cancel"]

    cancelled_id = insert_order(db, created_by=people["NV005"], status="CANCELLED")
    assert hoa.get(f"/api/v1/orders/{cancelled_id}").json()["allowed_commands"] == []


@pytest.mark.ac("AC-ORD-059")
def test_order_history(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order_id = insert_order(
        db,
        created_by=people["NV005"],
        status="DRAFT",
        customer_name="Anh Long",
        customer_phone="0977888999",
        service_address="12 Lê Lợi, Q1",
        work_description="Lắp đặt máy in",
    )
    hoa = client_as(app, HOA)
    submitted = hoa.post(f"/api/v1/orders/{order_id}/submit", json={"version": 1}).json()
    hoa.post(f"/api/v1/orders/{order_id}/recall", json={"version": submitted["version"]})

    res = hoa.get(f"/api/v1/orders/{order_id}/history")

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert body["items"][0]["action"] == "recall"
    assert (body["items"][0]["from_status"], body["items"][0]["to_status"]) == ("PENDING_DISPATCH", "DRAFT")
    assert body["items"][1]["action"] == "submit"
    assert body["items"][0]["actor"]["full_name"] == HOA.full_name

    ha = client_as(app, HA)
    assert ha.get(f"/api/v1/orders/{order_id}/history").status_code == 200

    khoa = client_as(app, KHOA)
    problem(khoa.get(f"/api/v1/orders/{order_id}/history"), 404, "NOT_FOUND")


# ---------------- M3-04a: sửa liên hệ / dòng hàng sau khi gửi (AC-ORD-072…092) ----------------


@pytest.mark.ac("AC-ORD-072")
def test_edit_contact_happy_path_records_diff(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    res = hoa.patch(
        f"/api/v1/orders/{order['id']}/contact",
        json={
            "version": order["version"],
            "customer_phone": "0988777666",
            "service_address": "20 Nguyễn Huệ, Q1",
        },
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["customer_phone"] == "0988777666"
    assert body["service_address"] == "20 Nguyễn Huệ, Q1"
    assert body["customer_name"] == order["customer_name"]
    assert body["version"] == order["version"] + 1

    event = next(e for e in audit_rows(db, uuid.UUID(order["id"])) if e.action == "edit_contact")
    assert event.actor_id == people["NV005"]
    assert event.data["changes"] == {
        "customer_phone": {"before": "0909123456", "after": "0988777666"},
        "service_address": {"before": "12 Lê Lợi, Q1", "after": "20 Nguyễn Huệ, Q1"},
    }


@pytest.mark.ac("AC-ORD-073")
def test_edit_contact_scope(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    ha = client_as(app, HA)
    problem(
        ha.patch(
            f"/api/v1/orders/{order['id']}/contact",
            json={"version": order["version"], "customer_phone": "0988777666"},
        ),
        404,
        "NOT_FOUND",
    )

    an = client_as(app, AN)
    res = an.patch(
        f"/api/v1/orders/{order['id']}/contact",
        json={"version": order["version"], "customer_phone": "0988777666"},
    )
    assert res.status_code == 200, res.text


@pytest.mark.ac("AC-ORD-074")
def test_edit_contact_forbidden_without_capability(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    khoa = client_as(app, KHOA)
    problem(
        khoa.patch(
            f"/api/v1/orders/{order['id']}/contact",
            json={"version": order["version"], "customer_phone": "0988777666"},
        ),
        403,
        "FORBIDDEN",
    )


@pytest.mark.ac("AC-ORD-075")
def test_edit_contact_rejects_draft(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    problem(
        hoa.patch(
            f"/api/v1/orders/{order['id']}/contact",
            json={"version": order["version"], "customer_phone": "0988777666"},
        ),
        409,
        "ORDER_NOT_SUBMITTED",
    )


@pytest.mark.ac("AC-ORD-076")
def test_edit_contact_rejects_completed_and_cancelled(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)
    for status in ("COMPLETED", "CANCELLED"):
        order_id = insert_order(db, created_by=people["NV005"], status=status)
        problem(
            hoa.patch(
                f"/api/v1/orders/{order_id}/contact",
                json={"version": 1, "customer_phone": "0988777666"},
            ),
            409,
            "ORDER_LOCKED",
        )
        refreshed = hoa.get(f"/api/v1/orders/{order_id}").json()
        assert refreshed["version"] == 1
        assert refreshed["customer_phone"] != "0988777666"


@pytest.mark.ac("AC-ORD-077")
def test_edit_contact_stale_version(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    problem(
        hoa.patch(
            f"/api/v1/orders/{order['id']}/contact",
            json={"version": order["version"] - 1, "customer_phone": "0988777666"},
        ),
        409,
        "STALE_VERSION",
    )


@pytest.mark.ac("AC-ORD-078")
def test_edit_contact_noop_still_bumps_version(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    res = hoa.patch(f"/api/v1/orders/{order['id']}/contact", json={"version": order["version"]})

    assert res.status_code == 200, res.text
    assert res.json()["version"] == order["version"] + 1
    event = next(e for e in audit_rows(db, uuid.UUID(order["id"])) if e.action == "edit_contact")
    assert event.data["changes"] == {}


@pytest.mark.ac("AC-ORD-080")
def test_add_line_after_submit_happy_path_manager(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    an = client_as(app, AN)
    res = an.post(
        f"/api/v1/orders/{order['id']}/lines-after-submit",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["PC-I5-12400"]),
            "quantity": "1",
            "unit_price": 11_980_000,
            "vat_rate": "0",
        },
    )

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["version"] == order["version"] + 1
    assert len(body["lines"]) == 2
    new_line = next(line for line in body["lines"] if line["name_snapshot"] == "PC SMYOU CORE I5-12400")
    assert new_line["line_total"] == 11_980_000
    assert body["total"] == order["total"] + 11_980_000

    event = next(e for e in audit_rows(db, uuid.UUID(order["id"])) if e.action == "add_line_after_submit")
    assert event.data == {
        "line_id": new_line["id"],
        "item": "PC SMYOU CORE I5-12400",
        "line_total": 11_980_000,
    }


@pytest.mark.ac("AC-ORD-081")
def test_add_line_after_submit_sale_owns_order(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines-after-submit",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["PC-I5-12400"]),
            "quantity": "1",
            "unit_price": 11_980_000,
            "vat_rate": "0",
        },
    )

    assert res.status_code == 201, res.text


@pytest.mark.ac("AC-ORD-082")
def test_add_line_after_submit_scope_and_capability(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    body = {
        "version": order["version"],
        "item_type": "PRODUCT",
        "product_id": str(catalog["PC-I5-12400"]),
        "quantity": "1",
        "unit_price": 11_980_000,
        "vat_rate": "0",
    }

    ha = client_as(app, HA)
    problem(ha.post(f"/api/v1/orders/{order['id']}/lines-after-submit", json=body), 404, "NOT_FOUND")

    khoa = client_as(app, KHOA)
    problem(khoa.post(f"/api/v1/orders/{order['id']}/lines-after-submit", json=body), 403, "FORBIDDEN")


@pytest.mark.ac("AC-ORD-083")
def test_update_line_after_submit_recalculates_and_diffs(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    line_id = order["lines"][0]["id"]

    an = client_as(app, AN)
    res = an.patch(
        f"/api/v1/orders/{order['id']}/lines-after-submit/{line_id}",
        json={"version": order["version"], "quantity": "3"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    line = body["lines"][0]
    assert line["line_gross"] == 7_500_000
    assert line["line_vat"] == 600_000
    assert line["line_total"] == 8_100_000
    assert body["total"] == 8_100_000

    event = next(e for e in audit_rows(db, uuid.UUID(order["id"])) if e.action == "update_line_after_submit")
    assert event.data == {
        "line_id": line_id,
        "item": "Màn hình Dell 22 inch",
        "changes": {"quantity": {"before": "1.00", "after": "3"}},
    }


@pytest.mark.ac("AC-ORD-106")
def test_update_line_after_submit_gift_diffs_implicit_unit_price(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    line_id = order["lines"][0]["id"]

    an = client_as(app, AN)
    res = an.patch(
        f"/api/v1/orders/{order['id']}/lines-after-submit/{line_id}",
        json={"version": order["version"], "is_gift": True},
    )

    assert res.status_code == 200, res.text
    line = res.json()["lines"][0]
    assert line["unit_price"] == 0
    assert (line["line_gross"], line["line_vat"], line["line_total"]) == (0, 0, 0)

    event = next(e for e in audit_rows(db, uuid.UUID(order["id"])) if e.action == "update_line_after_submit")
    assert event.data == {
        "line_id": line_id,
        "item": "Màn hình Dell 22 inch",
        "changes": {
            "is_gift": {"before": False, "after": True},
            "unit_price": {"before": 2_500_000, "after": 0},
        },
    }


@pytest.mark.ac("AC-ORD-084")
def test_remove_line_after_submit(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    line_id = order["lines"][0]["id"]

    an = client_as(app, AN)
    res = an.post(
        f"/api/v1/orders/{order['id']}/lines-after-submit/{line_id}/remove",
        json={"version": order["version"]},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["lines"] == []
    assert body["total"] == 0

    event = next(e for e in audit_rows(db, uuid.UUID(order["id"])) if e.action == "remove_line_after_submit")
    assert event.data == {
        "line_id": line_id,
        "item": "Màn hình Dell 22 inch",
        "line_total": 2_700_000,
    }


@pytest.mark.ac("AC-ORD-085")
def test_lines_after_submit_rejects_draft(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    line_id = order["lines"][0]["id"]
    add_body = {
        "version": order["version"],
        "item_type": "PRODUCT",
        "product_id": str(catalog["PC-I5-12400"]),
        "quantity": "1",
        "unit_price": 11_980_000,
        "vat_rate": "0",
    }

    problem(
        hoa.post(f"/api/v1/orders/{order['id']}/lines-after-submit", json=add_body),
        409,
        "ORDER_NOT_SUBMITTED",
    )
    problem(
        hoa.patch(
            f"/api/v1/orders/{order['id']}/lines-after-submit/{line_id}",
            json={"version": order["version"], "quantity": "2"},
        ),
        409,
        "ORDER_NOT_SUBMITTED",
    )
    problem(
        hoa.post(
            f"/api/v1/orders/{order['id']}/lines-after-submit/{line_id}/remove",
            json={"version": order["version"]},
        ),
        409,
        "ORDER_NOT_SUBMITTED",
    )
    refreshed = hoa.get(f"/api/v1/orders/{order['id']}").json()
    assert refreshed["version"] == order["version"]
    assert len(refreshed["lines"]) == len(order["lines"])


@pytest.mark.ac("AC-ORD-086")
def test_lines_after_submit_rejects_completed_and_cancelled(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    for status in ("COMPLETED", "CANCELLED"):
        order_id = insert_order(db, created_by=people["NV005"], status=status)
        add_body = {
            "version": 1,
            "item_type": "CUSTOM",
            "name": "Việc",
            "unit": "LAN",
            "quantity": "1",
            "unit_price": 100_000,
            "vat_rate": "8",
        }
        problem(an.post(f"/api/v1/orders/{order_id}/lines-after-submit", json=add_body), 409, "ORDER_LOCKED")
        refreshed = an.get(f"/api/v1/orders/{order_id}").json()
        assert refreshed["version"] == 1
        assert refreshed["lines"] == []


@pytest.mark.ac("AC-ORD-087")
def test_lines_after_submit_stale_version(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])
    line_id = order["lines"][0]["id"]
    stale = order["version"] - 1

    problem(
        hoa.post(
            f"/api/v1/orders/{order['id']}/lines-after-submit",
            json={
                "version": stale,
                "item_type": "CUSTOM",
                "name": "Việc",
                "unit": "LAN",
                "quantity": "1",
                "unit_price": 100_000,
                "vat_rate": "8",
            },
        ),
        409,
        "STALE_VERSION",
    )
    problem(
        hoa.patch(
            f"/api/v1/orders/{order['id']}/lines-after-submit/{line_id}",
            json={"version": stale, "quantity": "2"},
        ),
        409,
        "STALE_VERSION",
    )
    problem(
        hoa.post(
            f"/api/v1/orders/{order['id']}/lines-after-submit/{line_id}/remove", json={"version": stale}
        ),
        409,
        "STALE_VERSION",
    )
    refreshed = hoa.get(f"/api/v1/orders/{order['id']}").json()
    assert refreshed["version"] == order["version"]
    assert len(refreshed["lines"]) == len(order["lines"])


@pytest.mark.ac("AC-ORD-088")
def test_add_line_after_submit_price_fixed_guard(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    res = hoa.post(
        f"/api/v1/orders/{order['id']}/lines-after-submit",
        json={
            "version": order["version"],
            "item_type": "PRODUCT",
            "product_id": str(catalog["LCD-DELL22"]),
            "quantity": "1",
            "unit_price": 9_999_999,
            "vat_rate": "8",
        },
    )
    body = problem(res, 422, "PRICE_FIXED")
    assert error_fields(body) == ["unit_price"]


@pytest.mark.ac("AC-ORD-090")
def test_can_edit_flags_pending_dispatch(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submitted_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    for person in (HOA, AN):
        client = client_as(app, person)
        got = client.get(f"/api/v1/orders/{order['id']}").json()
        assert got["can_edit_contact"] is True
        assert got["can_edit_lines_after_submit"] is True

    ha = client_as(app, HA)
    got = ha.get(f"/api/v1/orders/{order['id']}").json()
    assert got["can_edit_contact"] is False
    assert got["can_edit_lines_after_submit"] is False

    tuan = client_as(app, TUAN)
    got = tuan.get(f"/api/v1/orders/{order['id']}").json()
    assert got["can_edit_contact"] is False
    assert got["can_edit_lines_after_submit"] is False


@pytest.mark.ac("AC-ORD-091")
def test_can_edit_flags_draft(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    kh00001: uuid.UUID,
    catalog: dict[str, uuid.UUID],
) -> None:
    hoa = client_as(app, HOA)
    order = submittable_order(hoa, customer_id=kh00001, product_id=catalog["LCD-DELL22"])

    got = hoa.get(f"/api/v1/orders/{order['id']}").json()
    assert got["can_edit_contact"] is False
    assert got["can_edit_lines_after_submit"] is False


@pytest.mark.ac("AC-ORD-092")
def test_can_edit_flags_completed(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    order_id = insert_order(db, created_by=people["NV005"], status="COMPLETED")

    got = an.get(f"/api/v1/orders/{order_id}").json()
    assert got["can_edit_contact"] is False
    assert got["can_edit_lines_after_submit"] is False
