"""`/api/v1/departments` — thin HTTP layer (M17-02a)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.departments import service
from app.modules.departments.schemas import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentPage,
    DepartmentUpdate,
    DepartmentVersion,
)

router = APIRouter(prefix="/api/v1/departments", tags=["departments"])
Reader = Annotated[Actor, Depends(require("employee.read"))]
Manager = Annotated[Actor, Depends(require("employee.manage"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
DUPLICATE = (409, "DUPLICATE_NAME")
CONFLICTS = (409, "STALE_VERSION | DUPLICATE_NAME | INVALID_STATE")


@router.get(
    "",
    operation_id="departments_list",
    summary="Danh sách phòng ban (tìm, lọc, phân trang)",
    response_model=DepartmentPage,
)
def list_departments(
    session: DbSession,
    actor: Reader,
    q: Annotated[str | None, Query(max_length=100)] = None,
    is_active: bool | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> DepartmentPage:
    return service.list_departments(session, actor, q=q, is_active=is_active, limit=limit, offset=offset)


@router.get(
    "/{department_id}",
    operation_id="departments_get",
    summary="Chi tiết phòng ban",
    response_model=DepartmentOut,
    responses=_docs(NOT_FOUND),
)
def get_department(department_id: uuid.UUID, session: DbSession, actor: Reader) -> DepartmentOut:
    return service.get_department(session, actor, department_id)


@router.post(
    "",
    operation_id="departments_create",
    summary="Thêm phòng ban",
    status_code=201,
    response_model=DepartmentOut,
    responses=_docs(DUPLICATE),
)
def create_department(
    body: DepartmentCreate, request: Request, session: DbSession, actor: Manager
) -> DepartmentOut:
    return service.create_department(session, actor, body.name, request_id=get_request_id(request))


@router.patch(
    "/{department_id}",
    operation_id="departments_rename",
    summary="Đổi tên phòng ban",
    response_model=DepartmentOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def rename_department(
    department_id: uuid.UUID, body: DepartmentUpdate, request: Request, session: DbSession, actor: Manager
) -> DepartmentOut:
    return service.rename_department(session, actor, department_id, body, request_id=get_request_id(request))


@router.post(
    "/{department_id}/deactivate",
    operation_id="departments_deactivate",
    summary="Ngừng hoạt động phòng ban",
    response_model=DepartmentOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def deactivate(
    department_id: uuid.UUID, body: DepartmentVersion, request: Request, session: DbSession, actor: Manager
) -> DepartmentOut:
    return service.set_active(
        session, actor, department_id, active=False, version=body.version, request_id=get_request_id(request)
    )


@router.post(
    "/{department_id}/activate",
    operation_id="departments_activate",
    summary="Mở lại hoạt động phòng ban",
    response_model=DepartmentOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def activate(
    department_id: uuid.UUID, body: DepartmentVersion, request: Request, session: DbSession, actor: Manager
) -> DepartmentOut:
    return service.set_active(
        session, actor, department_id, active=True, version=body.version, request_id=get_request_id(request)
    )
