"""/api/v1/employees — thin HTTP layer (M1-04a). State changes are named commands, never a PATCH of status."""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.employees import service
from app.modules.employees.schemas import (
    EmployeeCreate,
    EmployeeOut,
    EmployeePage,
    EmployeeUpdate,
    EmployeeWithPassword,
    Role,
    RolesRequest,
    VersionRequest,
)

router = APIRouter(prefix="/api/v1/employees", tags=["employees"])
Reader = Annotated[Actor, Depends(require("employee.read"))]
Manager = Annotated[Actor, Depends(require("employee.manage"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
CONFLICTS = (
    409,
    "STALE_VERSION | LAST_MANAGER | CANNOT_DEACTIVATE_SELF | INVALID_TRANSITION | CONFLICT (email)",
)


def _now(request: Request) -> datetime:
    now: datetime = request.app.state.clock()
    return now


@router.get(
    "",
    operation_id="employees_list",
    summary="Danh sách nhân viên (tìm, lọc, phân trang)",
    response_model=EmployeePage,
)
def list_employees(
    request: Request,
    session: DbSession,
    _: Reader,
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: Role | None = None,
    is_active: bool | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> EmployeePage:
    return service.list_employees(
        session, q=q, role=role, is_active=is_active, limit=limit, offset=offset, now=_now(request)
    )


@router.get(
    "/{employee_id}",
    operation_id="employees_get",
    summary="Chi tiết nhân viên",
    response_model=EmployeeOut,
    responses=_docs(NOT_FOUND),
)
def get_employee(employee_id: uuid.UUID, request: Request, session: DbSession, _: Reader) -> EmployeeOut:
    return service.get_employee(session, employee_id, now=_now(request))


@router.post(
    "",
    operation_id="employees_create",
    summary="Thêm nhân viên (mật khẩu tạm hiện một lần)",
    status_code=201,
    response_model=EmployeeWithPassword,
    responses=_docs((409, "CONFLICT (email)")),
)
def create_employee(
    body: EmployeeCreate, request: Request, session: DbSession, actor: Manager
) -> EmployeeWithPassword:
    return service.create_employee(session, actor, body, now=_now(request))


@router.patch(
    "/{employee_id}",
    operation_id="employees_update",
    summary="Sửa thông tin nhân viên",
    response_model=EmployeeOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_employee(
    employee_id: uuid.UUID, body: EmployeeUpdate, request: Request, session: DbSession, actor: Manager
) -> EmployeeOut:
    return service.update_employee(session, actor, employee_id, body, now=_now(request))


@router.post(
    "/{employee_id}/roles",
    operation_id="employees_set_roles",
    summary="Đặt vai trò",
    response_model=EmployeeOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def set_roles(
    employee_id: uuid.UUID, body: RolesRequest, request: Request, session: DbSession, actor: Manager
) -> EmployeeOut:
    return service.set_roles(
        session, actor, employee_id, version=body.version, roles=list(body.roles), now=_now(request)
    )


@router.post(
    "/{employee_id}/deactivate",
    operation_id="employees_deactivate",
    summary="Khoá tài khoản (đăng xuất khỏi mọi thiết bị)",
    response_model=EmployeeOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def deactivate(
    employee_id: uuid.UUID, body: VersionRequest, request: Request, session: DbSession, actor: Manager
) -> EmployeeOut:
    return service.deactivate(session, actor, employee_id, version=body.version, now=_now(request))


@router.post(
    "/{employee_id}/activate",
    operation_id="employees_activate",
    summary="Mở khoá tài khoản",
    response_model=EmployeeOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def activate(
    employee_id: uuid.UUID, body: VersionRequest, request: Request, session: DbSession, actor: Manager
) -> EmployeeOut:
    return service.activate(session, actor, employee_id, version=body.version, now=_now(request))


@router.post(
    "/{employee_id}/reset-password",
    operation_id="employees_reset_password",
    summary="Cấp lại mật khẩu (mật khẩu tạm hiện một lần)",
    response_model=EmployeeWithPassword,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def reset_password(
    employee_id: uuid.UUID, body: VersionRequest, request: Request, session: DbSession, actor: Manager
) -> EmployeeWithPassword:
    return service.reset_password(session, actor, employee_id, version=body.version, now=_now(request))
