"""`GET /api/v1/dashboard` (M7-02)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.dashboard import service
from app.modules.dashboard.schemas import DashboardOut

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])
Reader = Annotated[Actor, Depends(require("dashboard.read"))]


@router.get(
    "",
    operation_id="get_dashboard",
    summary="Tổng quan theo vai trò",
    response_model=DashboardOut,
    # exclude_unset (not exclude_none): a section the caller's roles don't grant must be ABSENT
    # from the JSON (spec §4), but a present section's own nullable fields (e.g. task_description)
    # must stay as explicit `null`, not also get stripped — exclude_none would do that recursively.
    response_model_exclude_unset=True,
)
def get_dashboard(request: Request, session: DbSession, actor: Reader) -> DashboardOut:
    now = request.app.state.clock()
    return service.get_dashboard(session, actor, now=now)
