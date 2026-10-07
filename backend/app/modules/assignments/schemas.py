"""Request/response bodies for /api/v1/assignments/* (M5-01 GET /me, M5-02 accept/reject)."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

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
    completion_note: str | None
    actual_hours: Decimal | None


class MyAssignmentsOut(BaseModel):
    items: list[MyAssignmentOut]


class AssignmentAccept(BaseModel):
    version: int


class AssignmentReject(BaseModel):
    version: int
    reason_code: ReasonCode
    reason_text: str


class AssignmentStart(BaseModel):
    version: int


class AssignmentComplete(BaseModel):
    version: int
    completion_note: str | None = None
    # No business guard for this in spec/state_machines.yaml (unlike estimated_hours_positive) —
    # ge=0 alone gives the 422 VALIDATION_ERROR AC-ASG-055 expects (spec §8).
    actual_hours: Decimal | None = Field(default=None, ge=0)
