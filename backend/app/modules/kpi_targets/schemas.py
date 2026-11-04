import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.kpi_targets.models import MAX_TARGET

# `YYYY-MM` only: "2026-1", "2026-13" and full dates are 422.
MONTH_PATTERN = r"^20\d{2}-(0[1-9]|1[0-2])$"  # bounded so month arithmetic stays inside `date`
Month = Annotated[str, Field(pattern=MONTH_PATTERN, examples=["2026-11"])]
Target = Annotated[int, Field(strict=True, ge=0, le=MAX_TARGET)]


class KpiTargetSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    net_revenue_target: Target
    # Required when the month already has a target (optimistic lock), omitted when creating.
    version: int | None = None


class KpiTargetCopy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_month: Month
    to_month: Month
    overwrite: bool = False


class KpiTargetCopyResult(BaseModel):
    created: int
    overwritten: int
    skipped: int


class KpiTargetRowOut(BaseModel):
    employee_id: uuid.UUID
    employee_code: str
    employee_name: str
    department_name: str | None
    employee_status: Literal["ACTIVE", "INACTIVE"]
    phone: str | None
    email: str | None
    target: int | None
    version: int | None
    updated_at: datetime | None


class KpiTargetPage(BaseModel):
    items: list[KpiTargetRowOut]
    total: int
    limit: int
    offset: int
