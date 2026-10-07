"""/api/v1/assignments/me (M5-01) + accept/reject (M5-02, this item opened start|complete for M5-03)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.assignments import service
from app.modules.assignments.schemas import (
    AssignmentAccept,
    AssignmentReject,
    MyAssignmentOut,
    MyAssignmentsOut,
)

router = APIRouter(prefix="/api/v1/assignments", tags=["assignments"])
Responder = Annotated[Actor, Depends(require("assignment.respond"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
RESPOND_CONFLICTS = (409, "STALE_VERSION | INVALID_TRANSITION | GUARD_FAILED")


@router.get(
    "/me",
    operation_id="assignments_me",
    summary="Phân công của chính tôi (chờ nhận/đang làm/đã xong)",
    response_model=MyAssignmentsOut,
)
def get_my_assignments(session: DbSession, actor: Responder) -> MyAssignmentsOut:
    return service.list_my_assignments(session, actor)


@router.post(
    "/{assignment_id}/accept",
    operation_id="assignments_accept",
    summary="Tiếp nhận đầu việc",
    response_model=MyAssignmentOut,
    responses=_docs(NOT_FOUND, RESPOND_CONFLICTS),
)
def accept_assignment(
    assignment_id: uuid.UUID, body: AssignmentAccept, request: Request, session: DbSession, actor: Responder
) -> MyAssignmentOut:
    now = request.app.state.clock()
    return service.accept_assignment(
        session,
        actor,
        assignment_id,
        body,
        now=now,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{assignment_id}/reject",
    operation_id="assignments_reject",
    summary="Từ chối đầu việc (có lý do)",
    response_model=MyAssignmentOut,
    responses=_docs(NOT_FOUND, RESPOND_CONFLICTS),
)
def reject_assignment(
    assignment_id: uuid.UUID, body: AssignmentReject, request: Request, session: DbSession, actor: Responder
) -> MyAssignmentOut:
    now = request.app.state.clock()
    return service.reject_assignment(
        session,
        actor,
        assignment_id,
        body,
        now=now,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )
