"""/api/v1/audit-events — read-only. audit_events is append-only: no write route exists here."""

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.audit import service
from app.modules.audit.schemas import AuditEventPage

router = APIRouter(prefix="/api/v1/audit-events", tags=["audit"])
Reader = Annotated[Actor, Depends(require("audit.read"))]


@router.get(
    "",
    operation_id="audit_events_list",
    summary="Nhật ký hệ thống (lọc theo thực thể / người thực hiện / khoảng ngày)",
    response_model=AuditEventPage,
)
def list_events(
    session: DbSession,
    actor: Reader,
    entity_type: Literal["EMPLOYEE"] | None = None,
    actor_id: uuid.UUID | None = None,
    occurred_from: date | None = None,
    occurred_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditEventPage:
    return service.list_events(
        session,
        actor,
        entity_type=entity_type,
        actor_id=actor_id,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
        limit=limit,
        offset=offset,
    )
