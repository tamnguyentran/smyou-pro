"""M16-07: danh mục "Nhóm sản phẩm/dịch vụ" (AC-CAT-090…096)."""

import uuid
from typing import Any

import httpx2 as httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.username, person.password)
    assert res.status_code == 200, res.text
    return client


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, KHOA)}


def problem(res: httpx.Response, status: int, code: str) -> dict[str, Any]:
    assert res.status_code == status, res.text
    body: dict[str, Any] = res.json()
    assert body["code"] == code
    return body


def test_capability_declared() -> None:
    from app.main import create_app

    app = create_app()
    routes = {(method, path): capability for method, path, capability in declared_routes(app)}
    assert routes[("GET", "/api/v1/product-service-groups")] == "catalog.read"
    assert routes[("POST", "/api/v1/product-service-groups")] == "catalog.manage"
    assert routes[("PATCH", "/api/v1/product-service-groups/{group_id}")] == "catalog.manage"
    assert routes[("POST", "/api/v1/product-service-groups/{group_id}/deactivate")] == "catalog.manage"
    assert routes[("POST", "/api/v1/product-service-groups/{group_id}/activate")] == "catalog.manage"


@pytest.mark.ac("AC-CAT-096")
def test_seed_has_3_groups(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    res = an.get("/api/v1/product-service-groups")
    assert res.status_code == 200, res.text
    body = res.json()
    names = {item["name"] for item in body["items"]}
    assert names == {"Thiết bị văn phòng", "Thiết bị an ninh", "Kỹ thuật chung"}
    assert all(item["is_active"] for item in body["items"])


@pytest.mark.ac("AC-CAT-090")
def test_create_group(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    res = an.post("/api/v1/product-service-groups", json={"name": "Thiết bị mạng"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Thiết bị mạng"
    assert body["is_active"] is True
    assert body["version"] == 1


@pytest.mark.ac("AC-CAT-091")
def test_create_rejects_duplicate_name_case_insensitive(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    problem(
        an.post("/api/v1/product-service-groups", json={"name": " thiết bị văn phòng "}),
        409,
        "CONFLICT",
    )


@pytest.mark.ac("AC-CAT-092")
def test_create_allows_name_reused_from_inactive_group(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    created = an.post("/api/v1/product-service-groups", json={"name": "Thiết bị mạng"}).json()
    an.post(
        f"/api/v1/product-service-groups/{created['id']}/deactivate",
        json={"version": created["version"]},
    )

    res = an.post("/api/v1/product-service-groups", json={"name": "Thiết bị mạng"})
    assert res.status_code == 201, res.text


@pytest.mark.ac("AC-CAT-093")
def test_update_name(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    created = an.post("/api/v1/product-service-groups", json={"name": "Thiết bị mạng"}).json()

    res = an.patch(
        f"/api/v1/product-service-groups/{created['id']}",
        json={"version": created["version"], "name": "Thiết bị mạng & wifi"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Thiết bị mạng & wifi"
    assert body["version"] == created["version"] + 1


@pytest.mark.ac("AC-CAT-094")
def test_deactivate_and_activate(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    an = client_as(app, AN)
    created = an.post("/api/v1/product-service-groups", json={"name": "Thiết bị mạng"}).json()

    deactivated = an.post(
        f"/api/v1/product-service-groups/{created['id']}/deactivate",
        json={"version": created["version"]},
    )
    assert deactivated.status_code == 200, deactivated.text
    assert deactivated.json()["is_active"] is False

    problem(
        an.post(
            f"/api/v1/product-service-groups/{created['id']}/deactivate",
            json={"version": deactivated.json()["version"]},
        ),
        409,
        "INVALID_TRANSITION",
    )

    activated = an.post(
        f"/api/v1/product-service-groups/{created['id']}/activate",
        json={"version": deactivated.json()["version"]},
    )
    assert activated.status_code == 200, activated.text
    assert activated.json()["is_active"] is True


@pytest.mark.ac("AC-CAT-095")
def test_sale_read_only_write_forbidden(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    assert hoa.get("/api/v1/product-service-groups").status_code == 200
    problem(
        hoa.post("/api/v1/product-service-groups", json={"name": "Thiết bị mạng"}),
        403,
        "FORBIDDEN",
    )

    # M19-01a: TECHNICIAN now holds `catalog.read` (read-only), so the list is visible but not writable.
    khoa = client_as(app, KHOA)
    assert khoa.get("/api/v1/product-service-groups").status_code == 200
    problem(khoa.post("/api/v1/product-service-groups", json={"name": "Thiết bị mạng"}), 403, "FORBIDDEN")
