"""`/api/v1/orders/{order_id}/customer-potential` — thin HTTP layer (M21-05a)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.customer_potential import service
from app.modules.customer_potential.schemas import CustomerPotentialNoteCreate, CustomerPotentialNoteOut

router = APIRouter(prefix="/api/v1/orders/{order_id}/customer-potential", tags=["customer-potential"])
Recorder = Annotated[Actor, Depends(require("customer.potential.record"))]
Reader = Annotated[Actor, Depends(require("order.read"))]

_RESPONSES: dict[int | str, dict[str, Any]] = {
    404: {"description": "problem+json — NOT_FOUND"},
    409: {"description": "problem+json — GUARD_FAILED"},
}


@router.post(
    "",
    operation_id="record_customer_potential_note",
    summary="KTV ghi tiềm năng sử dụng dịch vụ của khách hàng chủ đơn",
    status_code=201,
    response_model=CustomerPotentialNoteOut,
    responses=_RESPONSES,
)
def record_note(
    order_id: uuid.UUID,
    body: CustomerPotentialNoteCreate,
    request: Request,
    session: DbSession,
    actor: Recorder,
) -> CustomerPotentialNoteOut:
    return service.record_note(session, actor, order_id, body, request_id=get_request_id(request))


@router.get(
    "",
    operation_id="list_customer_potential_notes",
    summary="Lịch sử tiềm năng của khách hàng chủ đơn (mới nhất trước)",
    response_model=list[CustomerPotentialNoteOut],
    responses={404: _RESPONSES[404]},
)
def list_notes(order_id: uuid.UUID, session: DbSession, actor: Reader) -> list[CustomerPotentialNoteOut]:
    return service.list_notes(session, actor, order_id)
