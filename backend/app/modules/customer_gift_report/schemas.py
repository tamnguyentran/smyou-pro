"""Response bodies for `GET /api/v1/reports/customer-gifts`... (M16-02a)."""

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CustomerGiftReportRowOut(BaseModel):
    customer_id: uuid.UUID
    customer_code: str
    customer_name: str
    contact_person: str | None
    gift_count: int
    total_cost: int


class CustomerGiftReportOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # `from` is a Python keyword — the JSON key stays "from" via the alias, same pattern as
    # `revenue_report/schemas.py` (M15-09a).
    from_: date = Field(alias="from")
    to: date
    items: list[CustomerGiftReportRowOut]
    total: int
