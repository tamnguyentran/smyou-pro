"""Response body for `GET /api/v1/kpi/report` (M8-01a)."""

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class RejectionCounts(BaseModel):
    BUSY: int
    SICK: int
    SKILL: int
    DISTANCE: int
    OTHER: int


class KpiRowOut(BaseModel):
    employee_id: uuid.UUID
    employee_code: str
    employee_full_name: str
    employee_is_active: bool
    completed_task_count: int
    on_time_count: int
    on_time_rate: float | None
    rejection_counts: RejectionCounts
    rejection_total: int
    defect_count: int
    estimated_hours_total: Decimal
    actual_hours_total: Decimal
    actual_hours_missing_count: int


class KpiReportOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # `from` is a Python keyword — the JSON key stays "from" via the alias (FastAPI serializes
    # response models by alias by default).
    from_: date = Field(alias="from")
    to: date
    rows: list[KpiRowOut]
