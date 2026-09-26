"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI

from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.core.errors import register_error_handlers
from app.core.request_id import RequestIdMiddleware
from app.core.spec_loader import check_guard_registry, load_specs
from app.modules.identity.router import router as auth_router
from app.modules.identity.service import authenticate
from app.modules.system.router import router as system_router
from app.modules.workflow.guards import GUARDS, PENDING_GUARDS


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    # A broken spec raises SpecError here, so the process never starts serving (AC-SYS-005).
    specs = load_specs(settings.spec_dir)
    check_guard_registry(specs, GUARDS, PENDING_GUARDS)
    is_production = settings.app_env == "production"
    engine = create_db_engine(settings.database_url, settings.db_connect_timeout_seconds)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(
        title="SMYou Pro API",
        version=settings.app_version,
        # The API description is not published in production (scripts/export_openapi.py uses app.openapi()).
        openapi_url=None if is_production else "/api/v1/openapi.json",
        docs_url=None if is_production else "/api/docs",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.specs = specs
    app.state.session_factory = create_session_factory(engine)
    app.state.clock = lambda: datetime.now(UTC)  # tests swap in a fake clock
    app.state.authenticator = authenticate

    register_error_handlers(app)
    app.add_middleware(RequestIdMiddleware)
    app.include_router(system_router)
    app.include_router(auth_router)
    return app


app = create_app()
