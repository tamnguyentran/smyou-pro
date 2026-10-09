"""Request/response bodies for /api/v1/notifications (M7-01a)."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    body: str
    entity_type: str
    entity_id: uuid.UUID
    read_at: datetime | None
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    total: int
    limit: int
    offset: int


class UnreadCount(BaseModel):
    count: int


class MarkAllReadResult(BaseModel):
    count: int
