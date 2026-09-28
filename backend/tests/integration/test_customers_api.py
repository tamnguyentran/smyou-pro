"""M3-01: customer management API (AC-CUS-001…008)."""

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

ITEM_KEYS = {
    "id",
    "code",
    "type",
    "name",
    "contact_person",
    "phone",
    "email",
    "tax_code",
    "address",
    "note",
    "created_by",
    "version",
}

CTY_SANG_TAO: dict[str, object] = {
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
ANH_NGOC: dict[str, object] = {
    "code": "KH00002",
    "type": "INDIVIDUAL",
    "name": "Anh Ngọc - Grand Hotel",
    "contact_person": None,
    "phone": "0918234567",
    "email": None,
    "tax_code": None,
    "address": None,
    "note": None,
}
CTY_KIM_LONG: dict[str, object] = {
    "code": "KH00003",
    "type": "COMPANY",
    "name": "Cty Kim Long",
    "contact_person": "Chị Mai",
    "phone": "0912345678",
    "email": None,
    "tax_code": "0311122233",
    "address": None,
    "note": None,
}
NEW_CUSTOMER = {
    "type": "COMPANY",
    "name": "Cty Việt Phát",
    "contact_person": "Chị Mai",
    "phone": "0987654321",
    "email": "ketoan@vietphat.vn",
    "tax_code": "0399988877",
    "address": "45 Nguyễn Huệ, Q1, TP.HCM",
    "note": "Khách quen từ 2024",
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


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA)}


@pytest.fixture
def customers(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    creator = people["NV005"]
    return {
        str(c["code"]): insert_customer(db, c, created_by=creator)
        for c in (CTY_SANG_TAO, ANH_NGOC, CTY_KIM_LONG)
    }


@pytest.mark.ac("AC-CUS-001")
def test_list_search_filter_and_page(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customers: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)

    res = hoa.get("/api/v1/customers", params={"q": "kim long"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert set(body["items"][0]) == ITEM_KEYS
    assert body["items"][0]["code"] == "KH00003"

    def codes(**params: str) -> list[str]:
        return [c["code"] for c in hoa.get("/api/v1/customers", params=params).json()["items"]]

    assert codes(q="0918234567") == ["KH00002"]
    assert codes(q="0311122233") == ["KH00003"]  # tìm theo MST
    assert codes(q="sang tao") == ["KH00001"]  # không phân biệt dấu
    assert codes(type="COMPANY") == ["KH00001", "KH00003"]  # sắp theo mã
    assert hoa.get("/api/v1/customers", params={"limit": 101}).status_code == 422


@pytest.mark.ac("AC-CUS-002")
def test_read_rbac(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customers: dict[str, uuid.UUID]
) -> None:
    kim_long_id = customers["KH00003"]
    for person in (AN, HOA, TUAN):
        client = client_as(app, person)
        assert client.get("/api/v1/customers").status_code == 200
        assert client.get(f"/api/v1/customers/{kim_long_id}").status_code == 200

    khoa = client_as(app, KHOA)
    problem(khoa.get("/api/v1/customers"), 403, "FORBIDDEN")
    problem(khoa.get(f"/api/v1/customers/{kim_long_id}"), 403, "FORBIDDEN")

    an = client_as(app, AN)
    problem(an.get(f"/api/v1/customers/{uuid.uuid4()}"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-CUS-003")
def test_create_happy_path_and_manage_rbac(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customers: dict[str, uuid.UUID]
) -> None:
    hoa = client_as(app, HOA)

    res = hoa.post("/api/v1/customers", json=NEW_CUSTOMER)

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["code"] == "KH00004"  # tiếp theo sau 3 khách đã seed
    assert body["version"] == 1
    assert body["duplicate_phone_matches"] == []

    tuan = client_as(app, TUAN)
    problem(tuan.post("/api/v1/customers", json={**NEW_CUSTOMER, "phone": "0987654322"}), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CUS-004")
@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"phone": "098765"}, "phone"),
        ({"phone": "12987654321"}, "phone"),
        ({"name": "   "}, "name"),
        ({"type": "PERSON"}, "type"),
        ({"email": "khong-hop-le"}, "email"),
    ],
)
def test_create_validation_errors(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], change: dict[str, object], field: str
) -> None:
    hoa = client_as(app, HOA)
    body = problem(hoa.post("/api/v1/customers", json={**NEW_CUSTOMER, **change}), 422, "VALIDATION_ERROR")
    errors = body["errors"]
    assert isinstance(errors, list)
    assert field in [e["field"] for e in errors]


@pytest.mark.ac("AC-CUS-005")
def test_create_duplicate_phone_warning_not_blocking(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customers: dict[str, uuid.UUID]
) -> None:
    kim_long_id = customers["KH00003"]
    hoa = client_as(app, HOA)

    res = hoa.post(
        "/api/v1/customers",
        json={**NEW_CUSTOMER, "name": "Anh Tùng", "type": "INDIVIDUAL", "phone": "0912345678"},
    )

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["duplicate_phone_matches"] == [
        {"id": str(kim_long_id), "code": "KH00003", "name": "Cty Kim Long", "phone": "0912345678"}
    ]
    assert hoa.get("/api/v1/customers").json()["total"] == 4


@pytest.mark.ac("AC-CUS-006")
def test_update_happy_path_and_stale_version(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customers: dict[str, uuid.UUID]
) -> None:
    ngoc_id = customers["KH00002"]
    an = client_as(app, AN)

    res = an.patch(
        f"/api/v1/customers/{ngoc_id}",
        json={"version": 1, "name": "Anh Ngọc - Grand Hotel Spa", "contact_person": "Anh Ngọc"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["version"], body["name"], body["duplicate_phone_matches"]) == (
        2,
        "Anh Ngọc - Grand Hotel Spa",
        [],
    )

    stale = an.patch(f"/api/v1/customers/{ngoc_id}", json={"version": 1, "note": "cũ"})
    problem(stale, 409, "STALE_VERSION")

    assert an.patch(f"/api/v1/customers/{ngoc_id}", json={"version": 2, "code": "KH99999"}).status_code == 422


@pytest.mark.ac("AC-CUS-007")
def test_update_duplicate_phone_warning(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customers: dict[str, uuid.UUID]
) -> None:
    ngoc_id, sang_tao_id = customers["KH00002"], customers["KH00001"]
    an = client_as(app, AN)

    res = an.patch(f"/api/v1/customers/{ngoc_id}", json={"version": 1, "phone": "0909123456"})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["phone"] == "0909123456"
    assert body["duplicate_phone_matches"] == [
        {"id": str(sang_tao_id), "code": "KH00001", "name": "Cty Sáng Tạo Mới", "phone": "0909123456"}
    ]


@pytest.mark.ac("AC-CUS-008")
def test_routes_declare_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if "/customers" in r[1]}
    assert routes == {
        ("GET", "/api/v1/customers", "customer.read"),
        ("GET", "/api/v1/customers/{customer_id}", "customer.read"),
        ("POST", "/api/v1/customers", "customer.manage"),
        ("PATCH", "/api/v1/customers/{customer_id}", "customer.manage"),
    }


def test_mutations_write_audit_events(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    """CLAUDE.md rule 8: every state-changing command appends to audit_events."""
    hoa = client_as(app, HOA)
    created = hoa.post("/api/v1/customers", json=NEW_CUSTOMER).json()
    customer_id = created["id"]
    hoa.patch(f"/api/v1/customers/{customer_id}", json={"version": 1, "note": "cập nhật"})

    actions = (
        db.execute(
            text(
                "SELECT action FROM audit_events WHERE entity_type = 'CUSTOMER' AND entity_id = :id"
                " ORDER BY occurred_at, seq"
            ),
            {"id": customer_id},
        )
        .scalars()
        .all()
    )
    assert actions == ["create", "update"]
