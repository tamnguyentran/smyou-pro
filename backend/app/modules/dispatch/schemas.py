"""Request/response bodies for /api/v1/orders/{order_id}/tasks (M4-01a) and /api/v1/tasks (M4-03a)."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.modules.orders.schemas import Priority

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

# spec/state_machines.yaml#task.states — same 6 values as models.TASK_STATUSES.
TaskStatus = Literal["NEEDS_ASSIGNEE", "PENDING_ACCEPTANCE", "ACCEPTED", "IN_PROGRESS", "DONE", "CANCELLED"]


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    title: Title
    description: str | None = None
    # No range/step constraint here: AC-DSP-007 expects 409 GUARD_FAILED (estimated_hours_positive),
    # not a 422 validation error, for 0 / 201 / 1.3 — same pattern as orders/schemas.py leaving
    # guard-checked fields unconstrained.
    estimated_hours: Decimal
    due_at: datetime
    priority: Priority | None = None
    order_line_ids: list[uuid.UUID] | None = None
    assignee_ids: list[uuid.UUID]


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    title: Title | None = None
    description: str | None = None
    estimated_hours: Decimal | None = None
    due_at: datetime | None = None
    priority: Priority | None = None


class TaskAddAssignee(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    employee_id: uuid.UUID


class TaskAssigneeRemove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int


class TaskCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    reason: str | None = None


class TaskAssigneeOut(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    full_name: str
    status: str


class TaskSummaryAssigneeOut(BaseModel):
    employee_id: uuid.UUID
    full_name: str


class TaskDetail(BaseModel):
    id: uuid.UUID
    code: str
    order_id: uuid.UUID
    title: str
    description: str | None
    origin: str
    created_in_revision: int
    status: str
    estimated_hours: Decimal
    due_at: datetime
    priority: str
    cycle: int
    order_line_ids: list[uuid.UUID] | None
    assignees: list[TaskAssigneeOut]
    created_by: uuid.UUID
    created_at: datetime
    order_status: str
    order_version: int


class TaskSummary(BaseModel):
    id: uuid.UUID
    code: str
    title: str
    status: str
    estimated_hours: Decimal
    due_at: datetime
    priority: str
    assignees: list[TaskSummaryAssigneeOut]


class TaskListOut(BaseModel):
    items: list[TaskSummary]


class TaskBoardItem(BaseModel):
    id: uuid.UUID
    code: str
    order_id: uuid.UUID
    order_code: str
    title: str
    status: str
    priority: str
    estimated_hours: Decimal
    due_at: datetime
    assignees: list[TaskSummaryAssigneeOut]


class TaskBoardOut(BaseModel):
    items: list[TaskBoardItem]


class EmployeeWorkloadItem(BaseModel):
    employee_id: uuid.UUID
    full_name: str
    open_task_count: int
    total_estimated_hours: Decimal
    nearest_due_at: datetime | None


class EmployeeWorkloadOut(BaseModel):
    items: list[EmployeeWorkloadItem]
