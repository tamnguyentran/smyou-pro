"""/api/v1/assignments/me (M5-01) — opened for M5-02/M5-03 to add accept|reject|start|complete."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.assignments import service
from app.modules.assignments.schemas import MyAssignmentsOut

router = APIRouter(prefix="/api/v1/assignments", tags=["assignments"])
Responder = Annotated[Actor, Depends(require("assignment.respond"))]


@router.get(
    "/me",
    operation_id="assignments_me",
    summary="Phân công của chính tôi (chờ nhận/đang làm/đã xong)",
    response_model=MyAssignmentsOut,
)
def get_my_assignments(session: DbSession, actor: Responder) -> MyAssignmentsOut:
    return service.list_my_assignments(session, actor)
