"""Request/response bodies for GET /api/v1/audit-events (M1-05)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.modules.audit.domain import BusinessArea


class ActorSummary(BaseModel):
    id: uuid.UUID
    code: str
    full_name: str


class AuditEventOut(BaseModel):
    id: uuid.UUID
    occurred_at: datetime
    actor: ActorSummary | None
    entity_type: str
    entity_id: uuid.UUID
    action: str
    from_status: str | None
    to_status: str | None
    data: dict[str, Any] | None
    business_area: BusinessArea  # M21-04: "Nghiệp vụ", derived from entity_type/action
    entity_label: str | None  # M21-04: order code, customer name…; None when it can't be looked up


class AuditEventPage(BaseModel):
    items: list[AuditEventOut]
    total: int
    limit: int
    offset: int
