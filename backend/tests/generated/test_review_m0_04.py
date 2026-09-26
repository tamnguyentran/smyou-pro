"""Review M0-04: routes that are not FastAPI APIRoutes must not bypass the capability check."""

import pytest
from fastapi import FastAPI, WebSocket
from starlette.requests import Request
from starlette.responses import PlainTextResponse

from app.core.authz import undeclared_routes
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
