"""Review M0-04: routes that are not FastAPI APIRoutes must not bypass the capability check."""

import pytest
from fastapi import APIRouter, Depends, FastAPI, WebSocket
from starlette.requests import Request
from starlette.responses import PlainTextResponse

from app.core.authz import require, undeclared_routes
from app.core.spec_loader import load_specs
from app.main import create_app
from tests.spec_fixtures import REPO_SPEC_DIR


@pytest.mark.ac("AC-SYS-027")
def test_mounts_raw_routes_and_websockets_are_reported() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    app = FastAPI()

    def raw(_: Request) -> PlainTextResponse:
        return PlainTextResponse("x")

    app.add_route("/api/v1/raw", raw, methods=["POST"])
    sub = FastAPI()

    @sub.get("/secret")
    def secret() -> None: ...

    app.mount("/api/v1/sub", sub)

    @app.websocket("/api/v1/ws")
    async def ws(websocket: WebSocket) -> None: ...

    joined = "\n".join(undeclared_routes(app, permissions))
    assert "/api/v1/raw" in joined
    assert "/api/v1/sub" in joined
    assert "/api/v1/ws" in joined


@pytest.mark.ac("AC-SYS-027")
def test_framework_docs_routes_are_allowed_outside_production() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    app = create_app()
    assert app.openapi_url is not None, "docs are enabled outside production"
    assert undeclared_routes(app, permissions) == []


@pytest.mark.ac("AC-SYS-027")
def test_real_health_route_is_actually_examined() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    without_health = permissions.model_copy(
        update={"public_routes": [r for r in permissions.public_routes if r != "GET /api/v1/health"]}
    )
    problems = undeclared_routes(create_app(), without_health)
    assert any(p.startswith("GET /api/v1/health:") for p in problems), problems


@pytest.mark.ac("AC-SYS-027")
def test_router_level_require_and_public_route_with_require() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    router = APIRouter(prefix="/api/v1/orders", dependencies=[Depends(require("order.read"))])

    @router.get("/{order_id}")
    def get_order(order_id: str) -> None: ...

    app = FastAPI()
    app.include_router(router)

    @app.get("/api/v1/health", dependencies=[Depends(require("order.read"))])
    def health() -> None: ...

    problems = undeclared_routes(app, permissions)
    assert len(problems) == 1, problems
    assert problems[0].startswith("GET /api/v1/health:")
    assert "public_routes" in problems[0]
