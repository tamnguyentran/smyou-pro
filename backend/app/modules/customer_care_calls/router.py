"""`/api/v1/customer-care-calls` — thin HTTP layer (M27-01a)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.customer_care_calls import service
from app.modules.customer_care_calls.schemas import CareCallCreate, CareCallOut, CareCallPage

router = APIRouter(prefix="/api/v1/customer-care-calls", tags=["customer-care-calls"])
Recorder = Annotated[Actor, Depends(require("customer_care.call.record"))]
Reader = Annotated[Actor, Depends(require("customer_care.call.read"))]


@router.post(
    "",
    operation_id="record_customer_care_call",
    summary="CSKH ghi nhận cuộc gọi chăm sóc khách hàng",
    status_code=201,
    response_model=CareCallOut,
    responses={404: {"description": "problem+json — NOT_FOUND"}},
)
def record_call(body: CareCallCreate, request: Request, session: DbSession, actor: Recorder) -> CareCallOut:
    return service.record_call(session, actor, body, request_id=get_request_id(request))


@router.get(
    "",
    operation_id="list_customer_care_calls",
    summary="Danh sách cuộc gọi chăm sóc khách hàng (mới nhất trước)",
    response_model=CareCallPage,
)
def list_calls(
    session: DbSession,
    actor: Reader,
    customer_id: uuid.UUID | None = None,
    caller_id: uuid.UUID | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CareCallPage:
    return service.list_calls(
        session,
        actor,
        customer_id=customer_id,
        caller_id=caller_id,
        date_from=date_from,
        date_to=date_to,
        q=q,
        limit=limit,
        offset=offset,
    )
