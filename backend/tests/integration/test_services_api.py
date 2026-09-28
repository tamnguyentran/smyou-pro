"""M2-02: services catalog API (AC-CAT-019…026)."""

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
    "code",
    "name",
    "category",
    "unit",
    "price",
    "vat_rate",
    "price_fixed",
    "default_estimated_hours",
    "description",
    "is_active",
    "version",
}

BOMMUC = {
    "code": "DV-BOMMUC",
    "name": "Bơm mực máy in",
    "category": "REFILL",
    "unit": "LAN",
    "price": 50_000,
    "vat_rate": 8,
    "price_fixed": True,
    "default_estimated_hours": 0.5,
    "description": None,
}
LAPCAM = {
    "code": "DV-LAPCAM",
    "name": "Công đi dây + lắp đặt hệ thống camera",
    "category": "NETWORK_CABLING",
    "unit": "DIEM",
    "price": 300_000,
    "vat_rate": 10,
    "price_fixed": False,
    "default_estimated_hours": 2,
    "description": "Bao gồm đi dây âm tường",
}
SUAPC = {
    "code": "DV-SUAPC",
    "name": "Sửa chữa PC",
    "category": "REPAIR",
    "unit": "LAN",
    "price": 100_000,
    "vat_rate": 8,
    "price_fixed": False,
    "default_estimated_hours": 1,
    "description": None,
}


def insert_service(db: Connection, service: dict[str, object], *, is_active: bool = True) -> uuid.UUID:
    service_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO services (id, code, name, category, unit, price, vat_rate, price_fixed,"
            " default_estimated_hours, description, is_active, version)"
            " VALUES (:id, :code, :name, :category, :unit, :price, :vat_rate, :price_fixed,"
            " :default_estimated_hours, :description, :is_active, 1)"
        ),
        {"id": service_id, "is_active": is_active, **service},
    )
    return service_id


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA)}


@pytest.fixture
def services(db: Connection) -> dict[str, uuid.UUID]:
    return {
        "DV-BOMMUC": insert_service(db, BOMMUC),
        "DV-LAPCAM": insert_service(db, LAPCAM),
        "DV-SUAPC": insert_service(db, SUAPC, is_active=False),
    }


def problem(res: httpx.Response, status: int, code: str) -> dict[str, object]:
    assert res.status_code == status, res.text
    body: dict[str, object] = res.json()
    assert body["code"] == code
    return body


@pytest.mark.ac("AC-CAT-019")
def test_list_search_filter_and_page(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], services: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    res = an.get("/api/v1/services", params={"q": "sua", "category": "REPAIR", "is_active": False})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert set(body["items"][0]) == ITEM_KEYS
    assert body["items"][0]["code"] == "DV-SUAPC"

    res = an.get("/api/v1/services", params={"limit": 200})
    assert res.status_code == 422, res.text

    # ordered by code ascending across multiple active items
    res = an.get("/api/v1/services", params={"is_active": True})
    assert res.status_code == 200, res.text
    assert [i["code"] for i in res.json()["items"]] == ["DV-BOMMUC", "DV-LAPCAM"]

    res = an.get("/api/v1/services", params={"unit": "DIEM"})
    assert res.status_code == 200, res.text
    assert [i["code"] for i in res.json()["items"]] == ["DV-LAPCAM"]

    # q without diacritics still matches an accented name (DOMAIN_MODEL: "không phân biệt ... dấu")
    res = an.get("/api/v1/services", params={"q": "sua chua", "is_active": False})
    assert res.status_code == 200, res.text
    assert [i["code"] for i in res.json()["items"]] == ["DV-SUAPC"]


@pytest.mark.ac("AC-CAT-020")
def test_read_scope_sale_techlead_ok_technician_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], services: dict[str, uuid.UUID]
) -> None:
    service_id = services["DV-BOMMUC"]
    for person in (HOA, TUAN):
        client = client_as(app, person)
        assert client.get("/api/v1/services").status_code == 200
        assert client.get(f"/api/v1/services/{service_id}").status_code == 200

    khoa = client_as(app, KHOA)
    problem(khoa.get("/api/v1/services"), 403, "FORBIDDEN")
    problem(khoa.get(f"/api/v1/services/{service_id}"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-CAT-021")
def test_create_service(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    body = {
        "code": "DV-CAIDAT",
        "name": "Cài đặt phần mềm",
        "category": "SOFTWARE",
        "unit": "LAN",
        "price": 150_000,
        "vat_rate": 8,
        "price_fixed": True,
        "default_estimated_hours": 1,
        "description": "Cài Windows + phần mềm văn phòng",
    }
    res = an.post("/api/v1/services", json=body)
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["is_active"] is True
    assert created["version"] == 1

    for person in (HOA, TUAN):
        forbidden = client_as(app, person).post("/api/v1/services", json={**body, "code": "DV-CAIDAT2"})
        problem(forbidden, 403, "FORBIDDEN")


@pytest.mark.ac("AC-CAT-022")
def test_create_validation_and_conflict(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    assert an.post("/api/v1/services", json=BOMMUC).status_code == 201

    problem(an.post("/api/v1/services", json={**LAPCAM, "code": "dv-bommuc"}), 409, "CONFLICT")

    for bad, field in (
        ({**LAPCAM, "price": -1}, "price"),
        ({**LAPCAM, "vat_rate": 101}, "vat_rate"),
        ({**LAPCAM, "vat_rate": 8.123}, "vat_rate"),
        ({**LAPCAM, "default_estimated_hours": -1}, "default_estimated_hours"),
        ({**LAPCAM, "category": "NOT_A_CATEGORY"}, "category"),
        ({**LAPCAM, "unit": "NOT_A_UNIT"}, "unit"),
        ({**LAPCAM, "name": ""}, "name"),
    ):
        body = problem(an.post("/api/v1/services", json=bad), 422, "VALIDATION_ERROR")
        assert body["errors"][0]["field"] == field, (bad, body)


@pytest.mark.ac("AC-CAT-023")
def test_create_service_price_zero_and_no_estimated_hours(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    body = {
        "code": "DV-KSAT",
        "name": "Khảo sát công trình",
        "category": "OTHER",
        "unit": "LAN",
        "price": 0,
        "vat_rate": 0,
        "price_fixed": False,
        "description": "Tính thực tế khi thi công",
    }
    res = an.post("/api/v1/services", json=body)
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["default_estimated_hours"] is None
    assert created["price"] == 0


@pytest.mark.ac("AC-CAT-024")
def test_update_optimistic_lock_and_code_immutable(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], services: dict[str, uuid.UUID]
) -> None:
    service_id = services["DV-LAPCAM"]
    an = client_as(app, AN)
    edits = {
        "name": "Công đi dây + lắp camera trọn gói",
        "price": 350_000,
        "vat_rate": 10,
        "price_fixed": True,
        "default_estimated_hours": 3,
        "description": "Bao gồm đi dây âm tường + cấu hình xa",
    }
    res = an.patch(f"/api/v1/services/{service_id}", json={"version": 1, **edits})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["version"] == 2
    for field, value in edits.items():
        expected: object = (
            "10.00" if field == "vat_rate" else "3.00" if field == "default_estimated_hours" else value
        )
        assert body[field] == expected, (field, body)

    refetched = an.get(f"/api/v1/services/{service_id}").json()
    assert refetched["default_estimated_hours"] == body["default_estimated_hours"]

    problem(
        an.patch(f"/api/v1/services/{service_id}", json={"version": 1, "name": "Khác"}), 409, "STALE_VERSION"
    )
    assert (
        an.patch(f"/api/v1/services/{service_id}", json={"version": 2, "code": "DV-9999"}).status_code == 422
    )


@pytest.mark.ac("AC-CAT-025")
def test_deactivate_activate_invalid_transition(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], services: dict[str, uuid.UUID]
) -> None:
    service_id = services["DV-SUAPC"]  # seeded inactive
    an = client_as(app, AN)

    problem(
        an.post(f"/api/v1/services/{service_id}/deactivate", json={"version": 1}), 409, "INVALID_TRANSITION"
    )
    res = an.post(f"/api/v1/services/{service_id}/activate", json={"version": 1})
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is True

    problem(
        an.post(f"/api/v1/services/{service_id}/activate", json={"version": 2}), 409, "INVALID_TRANSITION"
    )
    res = an.post(f"/api/v1/services/{service_id}/deactivate", json={"version": 2})
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is False


@pytest.mark.ac("AC-CAT-024")
def test_unknown_service_id_is_not_found(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    missing = uuid.uuid4()
    problem(an.patch(f"/api/v1/services/{missing}", json={"version": 1}), 404, "NOT_FOUND")
    problem(an.post(f"/api/v1/services/{missing}/deactivate", json={"version": 1}), 404, "NOT_FOUND")
    problem(an.post(f"/api/v1/services/{missing}/activate", json={"version": 1}), 404, "NOT_FOUND")


def test_mutations_write_audit_events(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    """CLAUDE.md rule 8: every state-changing command appends to audit_events."""
    an = client_as(app, AN)
    created = an.post("/api/v1/services", json={**BOMMUC, "code": "DV-9001"}).json()
    service_id = created["id"]

    updated = an.patch(f"/api/v1/services/{service_id}", json={"version": 1, "name": "Đổi tên"}).json()
    an.post(f"/api/v1/services/{service_id}/deactivate", json={"version": updated["version"]})
    an.post(f"/api/v1/services/{service_id}/activate", json={"version": updated["version"] + 1})

    actions = (
        db.execute(
            text(
                "SELECT action FROM audit_events WHERE entity_type = 'SERVICE' AND entity_id = :id"
                " ORDER BY occurred_at, seq"
            ),
            {"id": service_id},
        )
        .scalars()
        .all()
    )
    assert actions == ["create", "update", "deactivate", "activate"]


@pytest.mark.ac("AC-CAT-026")
def test_routes_declare_capability(app: FastAPI) -> None:
    routes = {r for r in declared_routes(app) if "/services" in r[1]}
    assert routes == {
        ("GET", "/api/v1/services", "catalog.read"),
        ("GET", "/api/v1/services/{service_id}", "catalog.read"),
        ("POST", "/api/v1/services", "catalog.manage"),
        ("PATCH", "/api/v1/services/{service_id}", "catalog.manage"),
        ("POST", "/api/v1/services/{service_id}/deactivate", "catalog.manage"),
        ("POST", "/api/v1/services/{service_id}/activate", "catalog.manage"),
    }
