"""/api/v1/orders/{order_id}/tasks — thin HTTP layer for task creation & listing (M4-01a)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.dispatch import service
from app.modules.dispatch.schemas import (
    TaskAddAssignee,
    TaskAssigneeRemove,
    TaskCancel,
    TaskCreate,
    TaskDetail,
    TaskListOut,
    TaskUpdate,
)

router = APIRouter(prefix="/api/v1/orders", tags=["dispatch"])
Dispatcher = Annotated[Actor, Depends(require("task.manage"))]
Reader = Annotated[Actor, Depends(require("order.read"))]
TaskReader = Annotated[Actor, Depends(require("task.read"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
CREATE_CONFLICTS = (409, "STALE_VERSION | GUARD_FAILED")


@router.post(
    "/{order_id}/tasks",
    operation_id="orders_tasks_create",
    summary="Tạo đầu việc, giao cho một hoặc nhiều kỹ thuật viên",
    response_model=TaskDetail,
    responses=_docs(NOT_FOUND, CREATE_CONFLICTS),
)
def create_task(
    order_id: uuid.UUID, body: TaskCreate, request: Request, session: DbSession, actor: Dispatcher
) -> TaskDetail:
    now = request.app.state.clock()
    return service.create_task(
        session,
        actor,
        order_id,
        body,
        now=now,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.get(
    "/{order_id}/tasks",
    operation_id="orders_tasks_list",
    summary="Danh sách đầu việc của đơn",
    response_model=TaskListOut,
    responses=_docs(NOT_FOUND),
)
def list_tasks(order_id: uuid.UUID, session: DbSession, actor: Reader) -> TaskListOut:
    return service.list_order_tasks(session, actor, order_id)


MUTATION_CONFLICTS = (409, "STALE_VERSION | GUARD_FAILED | INVALID_TRANSITION")


@router.get(
    "/{order_id}/tasks/{task_id}",
    operation_id="orders_tasks_get",
    summary="Chi tiết 1 đầu việc",
    response_model=TaskDetail,
    responses=_docs(NOT_FOUND),
)
def get_task(order_id: uuid.UUID, task_id: uuid.UUID, session: DbSession, actor: TaskReader) -> TaskDetail:
    return service.get_task(session, actor, order_id, task_id)


@router.patch(
    "/{order_id}/tasks/{task_id}",
    operation_id="orders_tasks_update",
    summary="Sửa thông tin đầu việc",
    response_model=TaskDetail,
    responses=_docs(NOT_FOUND, MUTATION_CONFLICTS),
)
def update_task(
    order_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    request: Request,
    session: DbSession,
    actor: Dispatcher,
) -> TaskDetail:
    return service.update_task(
        session,
        actor,
        order_id,
        task_id,
        body,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{order_id}/tasks/{task_id}/assignees",
    operation_id="orders_tasks_add_assignee",
    summary="Thêm kỹ thuật viên vào đầu việc",
    response_model=TaskDetail,
    responses=_docs(NOT_FOUND, MUTATION_CONFLICTS),
)
def add_assignee(
    order_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskAddAssignee,
    request: Request,
    session: DbSession,
    actor: Dispatcher,
) -> TaskDetail:
    return service.add_assignee(
        session,
        actor,
        order_id,
        task_id,
        body,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{order_id}/tasks/{task_id}/assignees/{assignment_id}/remove",
    operation_id="orders_tasks_remove_assignee",
    summary="Gỡ kỹ thuật viên khỏi đầu việc",
    response_model=TaskDetail,
    responses=_docs(NOT_FOUND, MUTATION_CONFLICTS),
)
def remove_assignee(
    order_id: uuid.UUID,
    task_id: uuid.UUID,
    assignment_id: uuid.UUID,
    body: TaskAssigneeRemove,
    request: Request,
    session: DbSession,
    actor: Dispatcher,
) -> TaskDetail:
    now = request.app.state.clock()
    return service.remove_assignee(
        session,
        actor,
        order_id,
        task_id,
        assignment_id,
        body,
        now=now,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{order_id}/tasks/{task_id}/cancel",
    operation_id="orders_tasks_cancel",
    summary="Huỷ đầu việc",
    response_model=TaskDetail,
    responses=_docs(NOT_FOUND, MUTATION_CONFLICTS),
)
def cancel_task(
    order_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskCancel,
    request: Request,
    session: DbSession,
    actor: Dispatcher,
) -> TaskDetail:
    now = request.app.state.clock()
    return service.cancel_task(
        session,
        actor,
        order_id,
        task_id,
        body,
        now=now,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )
