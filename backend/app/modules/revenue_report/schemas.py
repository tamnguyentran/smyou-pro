"""Response bodies for `GET /api/v1/reports/revenue-by-customer`... (M15-09a)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SellerOut(BaseModel):
    id: uuid.UUID
    code: str
    full_name: str


class RevenueRowOut(BaseModel):
    customer_id: uuid.UUID
    customer_code: str
    customer_name: str
    contact_person: str | None
    contact_phone: str
    seller: SellerOut
    order_count: int
    subtotal_revenue: int
    profit: int | None


class RevenueReportOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # `from` is a Python keyword — the JSON key stays "from" via the alias, same pattern as
    # `kpi/schemas.py` (M8-01a).
    from_: date = Field(alias="from")
    to: date
    items: list[RevenueRowOut]
    total: int


class RevenueOrderOut(BaseModel):
    id: uuid.UUID
    code: str
    created_at: datetime
    completed_at: datetime | None
    total: int
    profit: int | None


class EmployeeRevenueRowOut(BaseModel):
    employee_id: uuid.UUID
    employee_code: str
    employee_name: str
    order_count: int
    subtotal_revenue: int
    profit: int | None


class EmployeeRevenueReportOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: date = Field(alias="from")
    to: date
    items: list[EmployeeRevenueRowOut]
    total: int
