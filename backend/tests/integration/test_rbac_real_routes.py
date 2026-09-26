"""M1-02: RBAC matrix over the REAL app's routes (AC-AUTH-035). New routes join the matrix automatically."""

import re
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection

from app.core.authz import declared_routes
from tests.integration.conftest import Person, login, seed

ROLES = ("MANAGER", "SALE", "TECH_LEAD", "TECHNICIAN")


def person_with(role: str) -> Person:
    return Person(
        f"{role.lower()}@smyou.vn", "Matrix@2026", (role,), f"RB{ROLES.index(role)}", role.title(), "SALES"
    )


def concrete(path: str) -> str:
    return re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)


@pytest.mark.ac("AC-AUTH-035")
@pytest.mark.parametrize("role", ROLES)
def test_real_routes_deny_exactly_the_roles_without_the_capability(
    app: FastAPI, db: Connection, role: str
) -> None:
    grants = app.state.specs.permissions.capabilities
    routes = declared_routes(app)
    assert ("GET", "/api/v1/me", "profile.manage") in routes
    assert ("POST", "/api/v1/auth/change-password", "profile.manage") in routes

    person = person_with(role)
    seed(db, person)
    api = TestClient(app, raise_server_exceptions=False)
    assert login(api, person.email, person.password).status_code == 200

    for method, path, capability in routes:
        res = api.request(method, concrete(path), json={})
        if role in grants[capability]:
            assert res.status_code != 403, (method, path, res.json())
        else:
            assert res.status_code == 403, (method, path)
            assert res.json()["code"] == "FORBIDDEN"
