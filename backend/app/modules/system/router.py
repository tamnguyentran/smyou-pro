"""Operational endpoints (public)."""

import logging
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.core.db import ping
from app.core.errors import AppError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    database: Literal["ok"]
    version: str


@router.get(
    "/health",
    operation_id="system_health",
    summary="Kiểm tra tình trạng dịch vụ và cơ sở dữ liệu",
    response_model=HealthResponse,
    responses={503: {"description": "Database unreachable (problem+json, code SERVICE_UNAVAILABLE)"}},
)
def health(request: Request) -> HealthResponse:
    engine: Engine = request.app.state.engine
    settings: Settings = request.app.state.settings
    try:
        ping(engine)
    except SQLAlchemyError as exc:
        # Log only the error class: driver messages can contain host names; never log the URL.
        logger.warning("Database ping failed (%s)", type(exc).__name__)
        raise AppError(503, "SERVICE_UNAVAILABLE", "Không kết nối được cơ sở dữ liệu.") from exc
    return HealthResponse(status="ok", database="ok", version=settings.app_version)
