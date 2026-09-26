"""RBAC matrix generated from spec/permissions.yaml (M1-02, TESTING_STRATEGY §3).

Every capability x every single role and every pair of roles: holders get 200 and the effective scope,
everyone else gets 403. The cases are computed from the YAML, so editing the YAML changes the matrix.
"""

import itertools
import uuid
from collections.abc import Callable
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.authz import Actor, effective_scopes, require
from app.core.spec_loader import load_specs
from tests.spec_fixtures import REPO_SPEC_DIR

PERMISSIONS = load_specs(REPO_SPEC_DIR).permissions
ROLES = list(PERMISSIONS.roles)
ROLE_SETS = [frozenset(c) for n in range(1, len(ROLES) + 1) for c in itertools.combinations(ROLES, n)]
SINGLES_AND_PAIRS = [s for s in ROLE_SETS if len(s) <= 2]


def expected_scopes(roles: frozenset[str], capability: str) -> tuple[str, ...]:
    """Independent re-statement of the YAML rule: union of the roles' scopes; `all` wins."""
    granted = {scope for role, scope in PERMISSIONS.capabilities[capability].items() if role in roles}
    if "all" in granted:
        return ("all",)
    return tuple(s for s in PERMISSIONS.scopes if s in granted)


@pytest.mark.ac("AC-AUTH-033")
def test_there_are_15_non_empty_role_sets() -> None:
    assert len(ROLE_SETS) == 15
    assert len(SINGLES_AND_PAIRS) == 10


@pytest.mark.ac("AC-AUTH-033")
@pytest.mark.parametrize("roles", ROLE_SETS, ids=lambda s: "+".join(sorted(s)))
def test_effective_scope_is_the_union_of_role_scopes(roles: frozenset[str]) -> None:
    for capability in PERMISSIONS.capabilities:
        assert effective_scopes(PERMISSIONS, roles, capability) == expected_scopes(roles, capability), (
            capability
        )


@pytest.mark.ac("AC-AUTH-033")
def test_effective_scope_examples_from_the_spec() -> None:
    sale_tech = frozenset({"SALE", "TECHNICIAN"})
    assert effective_scopes(PERMISSIONS, sale_tech, "order.read") == ("all",)
    assert effective_scopes(PERMISSIONS, sale_tech, "dashboard.read") == ("own", "self")
    assert effective_scopes(PERMISSIONS, sale_tech, "order.submit") == ("own",)
    assert effective_scopes(PERMISSIONS, sale_tech, "task.manage") == ()
    assert effective_scopes(PERMISSIONS, frozenset(), "profile.manage") == ()


def _matrix_app(make_app: Callable[..., FastAPI]) -> FastAPI:
    app = make_app()

    def fake_authenticator(request: Request, _: Session) -> Actor | None:
        header = request.headers.get("x-test-roles")
        if header is None:
            return None
        return Actor(uuid.uuid4(), frozenset(r for r in header.split(",") if r), must_change_password=False)

    app.state.authenticator = fake_authenticator
    for capability in PERMISSIONS.capabilities:

        def probe(actor: Annotated[Actor, Depends(require(capability))]) -> dict[str, object]:
            return {"capability": actor.capability, "scopes": list(actor.scopes)}

        app.add_api_route(f"/api/v1/probe/{capability}", probe, methods=["GET"])
    return app


@pytest.mark.ac("AC-AUTH-034")
@pytest.mark.parametrize("roles", SINGLES_AND_PAIRS, ids=lambda s: "+".join(sorted(s)))
def test_every_capability_for_every_role_and_pair(
    make_app: Callable[..., FastAPI], roles: frozenset[str]
) -> None:
    api = TestClient(_matrix_app(make_app), raise_server_exceptions=False)
    checked = 0
    for capability in PERMISSIONS.capabilities:
        res = api.get(f"/api/v1/probe/{capability}", headers={"x-test-roles": ",".join(sorted(roles))})
        expected = expected_scopes(roles, capability)
        if expected:
            assert res.status_code == 200, (capability, res.json())
            assert res.json() == {"capability": capability, "scopes": list(expected)}
        else:
            assert res.status_code == 403, capability
            body = res.json()
            assert body["code"] == "FORBIDDEN"
            assert body["detail"] == "Bạn không có quyền thực hiện thao tác này."
        checked += 1
    assert checked == len(PERMISSIONS.capabilities) == 28
