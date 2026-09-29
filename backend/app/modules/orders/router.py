"""/api/v1/orders — thin HTTP layer (M3-02a)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.orders import service
from app.modules.orders.schemas import (
    OrderCreate,
    OrderDetail,
    OrderLineCreate,
    OrderLineRemove,
    OrderLineUpdate,
    OrderUpdate,
)

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
Creator = Annotated[Actor, Depends(require("order.create"))]
Reader = Annotated[Actor, Depends(require("order.read"))]
Editor = Annotated[Actor, Depends(require("order.edit_draft"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
CONFLICTS = (409, "STALE_VERSION | ORDER_NOT_DRAFT")


@router.post(
    "", operation_id="orders_create", summary="Tạo đơn nháp", status_code=201, response_model=OrderDetail
)
def create_order(body: OrderCreate, request: Request, session: DbSession, actor: Creator) -> OrderDetail:
    now = request.app.state.clock()
    return service.create_order(session, actor, body, now=now, request_id=get_request_id(request))


@router.get(
    "/{order_id}",
    operation_id="orders_get",
    summary="Chi tiết đơn",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND),
)
def get_order(order_id: uuid.UUID, session: DbSession, actor: Reader) -> OrderDetail:
    return service.get_order(session, actor, order_id)


@router.patch(
    "/{order_id}",
    operation_id="orders_update",
    summary="Sửa thông tin đơn nháp",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_order(
    order_id: uuid.UUID, body: OrderUpdate, request: Request, session: DbSession, actor: Editor
) -> OrderDetail:
    return service.update_order(session, actor, order_id, body, request_id=get_request_id(request))


@router.post(
    "/{order_id}/lines",
    operation_id="orders_add_line",
    summary="Thêm dòng hàng vào đơn nháp",
    status_code=201,
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def add_line(
    order_id: uuid.UUID, body: OrderLineCreate, request: Request, session: DbSession, actor: Editor
) -> OrderDetail:
    return service.add_line(session, actor, order_id, body, request_id=get_request_id(request))


@router.patch(
    "/{order_id}/lines/{line_id}",
    operation_id="orders_update_line",
    summary="Sửa dòng hàng trong đơn nháp",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_line(
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineUpdate,
    request: Request,
    session: DbSession,
    actor: Editor,
) -> OrderDetail:
    return service.update_line(session, actor, order_id, line_id, body, request_id=get_request_id(request))


@router.post(
    "/{order_id}/lines/{line_id}/remove",
    operation_id="orders_remove_line",
    summary="Xoá dòng hàng khỏi đơn nháp",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def remove_line(
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineRemove,
    request: Request,
    session: DbSession,
    actor: Editor,
) -> OrderDetail:
    return service.remove_line(session, actor, order_id, line_id, body, request_id=get_request_id(request))
