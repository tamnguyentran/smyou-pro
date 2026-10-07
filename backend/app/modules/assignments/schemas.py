"""Request/response bodies for /api/v1/assignments/* (M5-01 GET /me, M5-02 accept/reject)."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

ReasonCode = Literal["BUSY", "SICK", "SKILL", "DISTANCE", "OTHER"]


class MyAssignmentOut(BaseModel):
    assignment_id: uuid.UUID
    assignment_status: str
    task_id: uuid.UUID
    task_code: str
    task_title: str
    task_description: str | None
    estimated_hours: Decimal
    due_at: datetime
    priority: str
    order_id: uuid.UUID
    order_code: str
    order_version: int
    customer_name: str | None
    customer_phone: str | None
    service_address: str | None


class MyAssignmentsOut(BaseModel):
    items: list[MyAssignmentOut]


class AssignmentAccept(BaseModel):
    version: int


class AssignmentReject(BaseModel):
    version: int
    reason_code: ReasonCode
    reason_text: str
