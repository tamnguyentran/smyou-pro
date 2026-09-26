"""Every API route declares exactly one capability from spec/permissions.yaml, or is a public route."""

import pytest
from fastapi import Depends, FastAPI

from app.core.authz import require, undeclared_routes
from app.core.spec_loader import load_specs
from app.main import create_app
from tests.spec_fixtures import REPO_SPEC_DIR


@pytest.mark.ac("AC-SYS-027")
def test_real_app_routes_all_declared() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    assert undeclared_routes(create_app(), permissions) == []


@pytest.mark.ac("AC-SYS-027")
def test_undeclared_unknown_and_double_capabilities_are_reported() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    app = FastAPI()

    @app.get("/api/v1/health")
    def health() -> None: ...

    @app.get("/api/v1/undeclared")
    def undeclared() -> None: ...

    @app.get("/api/v1/unknown", dependencies=[Depends(require("order.nope"))])
    def unknown() -> None: ...

    @app.post("/api/v1/double", dependencies=[Depends(require("order.read")), Depends(require("task.read"))])
    def double() -> None: ...

    @app.get("/api/v1/ok", dependencies=[Depends(require("order.read"))])
    def ok() -> None: ...

    problems = undeclared_routes(app, permissions)
    joined = "\n".join(problems)
    assert len(problems) == 3, problems
    assert "GET /api/v1/undeclared" in joined
    assert "GET /api/v1/unknown" in joined
    assert "order.nope" in joined
    assert "POST /api/v1/double" in joined
