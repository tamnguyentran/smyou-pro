"""Response bodies for /api/v1/assignments/me (M5-01)."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


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
    customer_name: str | None
    customer_phone: str | None
    service_address: str | None


class MyAssignmentsOut(BaseModel):
    items: list[MyAssignmentOut]
