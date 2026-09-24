"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import Settings
from app.core.db import create_db_engine
from app.core.errors import register_error_handlers
from app.core.request_id import RequestIdMiddleware
from app.modules.system.router import router as system_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
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

    register_error_handlers(app)
    app.add_middleware(RequestIdMiddleware)
    app.include_router(system_router)
    return app


app = create_app()
