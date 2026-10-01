"""/api/v1/orders/{order_id}/tasks — thin HTTP layer for task creation & listing (M4-01a)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.dispatch import service
from app.modules.dispatch.schemas import TaskCreate, TaskDetail, TaskListOut

router = APIRouter(prefix="/api/v1/orders", tags=["dispatch"])
Dispatcher = Annotated[Actor, Depends(require("task.manage"))]
Reader = Annotated[Actor, Depends(require("order.read"))]


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
