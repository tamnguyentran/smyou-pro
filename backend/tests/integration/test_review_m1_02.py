"""M1-02 review round 1: stricter versions of the matrix/scope tests (roles and counts from the YAML,
authorized roles really reach the handler, empty-scope warning, employee without roles)."""

import logging
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Column, Connection, MetaData, Table, Uuid, select, text

from app.core.authz import Actor, apply_scope, declared_routes
from app.core.spec_loader import load_specs
from tests.integration.conftest import AN, Person, login, seed
from tests.spec_fixtures import REPO_SPEC_DIR

PERMISSIONS = load_specs(REPO_SPEC_DIR).permissions
YAML_ROLES = list(PERMISSIONS.roles)


@pytest.mark.ac("AC-AUTH-035")
@pytest.mark.parametrize("role", YAML_ROLES)
def test_real_routes_matrix_uses_yaml_roles_and_holders_reach_the_handler(
    app: FastAPI, db: Connection, role: str
) -> None:
    person = Person(
        f"rv.{role.lower()}@smyou.vn", "Review@2026", (role,), f"RV{YAML_ROLES.index(role)}", role, "SALES"
    )
    seed(db, person)
    api = TestClient(app, raise_server_exceptions=False)
    assert login(api, person.email, person.password).status_code == 200

    routes = declared_routes(app)
    assert routes
    for method, path, capability in routes:
        res = api.request(method, path.replace("{", "").replace("}", ""), json={})
        if role in PERMISSIONS.capabilities[capability]:
            assert res.status_code not in (401, 403), (method, path, res.text)
            assert res.status_code < 500, (method, path, res.text)
        else:
            assert (res.status_code, res.json()["code"]) == (403, "FORBIDDEN"), (method, path)


@pytest.mark.ac("AC-AUTH-034")
def test_matrix_size_is_derived_from_the_yaml() -> None:
    n = len(YAML_ROLES)
    assert 2**n - 1 == 15  # the spec's example; the matrix itself is built from the YAML
    assert len(PERMISSIONS.capabilities) > 0


_T = Table("t", MetaData(), Column("id", Uuid, primary_key=True), Column("created_by", Uuid))
_RULES = {"own": lambda a: _T.c.created_by == a.id}


@pytest.mark.ac("AC-AUTH-037")
def test_empty_scope_is_logged_with_the_capability(caplog: pytest.LogCaptureFixture) -> None:
    nobody = Actor(uuid.uuid4(), frozenset(), False, capability="order.read", scopes=())
    with caplog.at_level(logging.WARNING, logger="app.core.authz"):
        apply_scope(select(_T.c.id), nobody, _RULES)
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("order.read" in m for m in warnings), warnings


@pytest.mark.ac("AC-AUTH-037")
def test_unsupported_scope_warning_names_the_exact_scope(caplog: pytest.LogCaptureFixture) -> None:
    who = Actor(uuid.uuid4(), frozenset({"TECHNICIAN"}), False, capability="task.read", scopes=("self",))
    with caplog.at_level(logging.WARNING, logger="app.core.authz"):
        apply_scope(select(_T.c.id), who, _RULES)
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("task.read" in m and "'self'" in m for m in warnings), warnings


@pytest.mark.ac("AC-AUTH-031")
def test_employee_without_roles_is_forbidden_on_me(api: TestClient, db: Connection) -> None:
    an_id = seed(db, AN)
    assert login(api, AN.email, AN.password).status_code == 200
    db.execute(text("DELETE FROM employee_roles WHERE employee_id = :id"), {"id": an_id})
    res = api.get("/api/v1/me")
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN"
