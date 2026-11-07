"""`/api/v1/kpi-targets` — thin HTTP layer (M21-01a)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query, Request, Response

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.kpi_targets import service
from app.modules.kpi_targets.schemas import (
    MONTH_PATTERN,
    KpiTargetCopy,
    KpiTargetCopyResult,
    KpiTargetPage,
    KpiTargetRowOut,
    KpiTargetSet,
)

router = APIRouter(prefix="/api/v1/kpi-targets", tags=["kpi-targets"])
Manager = Annotated[Actor, Depends(require("kpi_target.manage"))]
MonthPath = Annotated[str, Path(pattern=MONTH_PATTERN, examples=["2026-11"])]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
STALE = (409, "STALE_VERSION")


@router.get(
    "",
    operation_id="kpi_targets_list",
    summary="Chỉ tiêu Thu nhập thuần của nhân viên trong một tháng",
    response_model=KpiTargetPage,
)
def list_targets(
    session: DbSession,
    actor: Manager,
    month: Annotated[str, Query(pattern=MONTH_PATTERN, examples=["2026-11"])],
    department_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> KpiTargetPage:
    return service.list_targets(
        session, actor, month=month, department_id=department_id, q=q, limit=limit, offset=offset
    )


@router.post(
    "/copy",
    operation_id="kpi_targets_copy",
    summary="Copy chỉ tiêu một tháng sang các tháng sau",
    response_model=KpiTargetCopyResult,
)
def copy_targets(
    body: KpiTargetCopy, request: Request, session: DbSession, actor: Manager
) -> KpiTargetCopyResult:
    return service.copy_targets(session, actor, body, request_id=get_request_id(request))


@router.put(
    "/{employee_id}/{month}",
    operation_id="kpi_targets_set",
    summary="Đặt/sửa chỉ tiêu một tháng của nhân viên",
    response_model=KpiTargetRowOut,
    responses=_docs(NOT_FOUND, STALE),
)
def set_target(
    employee_id: uuid.UUID,
    month: MonthPath,
    body: KpiTargetSet,
    request: Request,
    session: DbSession,
    actor: Manager,
) -> KpiTargetRowOut:
    return service.set_target(session, actor, employee_id, month, body, request_id=get_request_id(request))


@router.delete(
    "/{employee_id}/{month}",
    operation_id="kpi_targets_delete",
    summary="Xoá chỉ tiêu một tháng của nhân viên",
    status_code=204,
    response_class=Response,
    responses=_docs(NOT_FOUND),
)
def delete_target(
    employee_id: uuid.UUID, month: MonthPath, request: Request, session: DbSession, actor: Manager
) -> Response:
    service.delete_target(session, actor, employee_id, month, request_id=get_request_id(request))
    return Response(status_code=204)
