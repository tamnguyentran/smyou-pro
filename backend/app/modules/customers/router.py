"""/api/v1/customers — thin HTTP layer (M3-01)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.customers import service
from app.modules.customers.schemas import (
    CustomerCreate,
    CustomerOut,
    CustomerPage,
    CustomerType,
    CustomerUpdate,
    CustomerWritten,
)

router = APIRouter(prefix="/api/v1/customers", tags=["customers"])
Reader = Annotated[Actor, Depends(require("customer.read"))]
Manager = Annotated[Actor, Depends(require("customer.manage"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
CONFLICTS = (409, "STALE_VERSION | CONFLICT (code)")


@router.get(
    "",
    operation_id="customers_list",
    summary="Danh sách khách hàng (tìm theo tên/SĐT/MST, lọc, phân trang)",
    response_model=CustomerPage,
)
def list_customers(
    session: DbSession,
    actor: Reader,
    q: Annotated[str | None, Query(max_length=100)] = None,
    type: CustomerType | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CustomerPage:
    return service.list_customers(session, actor, q=q, customer_type=type, limit=limit, offset=offset)


@router.get(
    "/{customer_id}",
    operation_id="customers_get",
    summary="Chi tiết khách hàng",
    response_model=CustomerOut,
    responses=_docs(NOT_FOUND),
)
def get_customer(customer_id: uuid.UUID, session: DbSession, actor: Reader) -> CustomerOut:
    return service.get_customer(session, actor, customer_id)


@router.post(
    "",
    operation_id="customers_create",
    summary="Thêm khách hàng (cảnh báo không chặn nếu trùng SĐT)",
    status_code=201,
    response_model=CustomerWritten,
)
def create_customer(
    body: CustomerCreate, request: Request, session: DbSession, actor: Manager
) -> CustomerWritten:
    return service.create_customer(session, actor, body, request_id=get_request_id(request))


@router.patch(
    "/{customer_id}",
    operation_id="customers_update",
    summary="Sửa thông tin khách hàng",
    response_model=CustomerWritten,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_customer(
    customer_id: uuid.UUID, body: CustomerUpdate, request: Request, session: DbSession, actor: Manager
) -> CustomerWritten:
    return service.update_customer(session, actor, customer_id, body, request_id=get_request_id(request))
