"""Request/response bodies for GET /api/v1/audit-events (M1-05)."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


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


class AuditEventPage(BaseModel):
    items: list[AuditEventOut]
    total: int
    limit: int
    offset: int
