"""Response bodies for `GET /api/v1/reports/revenue-by-customer`... (M15-09a)."""

import uuid
from datetime import date, datetime
from decimal import Decimal

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
    # M16-06: nhóm theo dòng hàng (`order_lines.credited_employee_id`) — dòng chưa ghi ai có
    # `seller=None, unassigned=True`.
    seller: SellerOut | None
    unassigned: bool = False
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


class RevenueLineOut(BaseModel):
    """M16-05/M16-06: 1 dòng hàng — drilldown của 2 báo cáo doanh thu, tính theo
    `order_lines.credited_employee_id` (1 đơn có thể có nhiều dòng thuộc nhiều nhóm khác nhau,
    nên drilldown không liệt kê theo đơn)."""

    id: uuid.UUID
    order_id: uuid.UUID
    order_code: str
    line_name: str
    quantity: Decimal
    line_total: int
    profit: int | None
    order_created_at: datetime
    order_completed_at: datetime | None


class EmployeeRevenueRowOut(BaseModel):
    # M16-05: nhóm theo dòng hàng (`order_lines.credited_employee_id`) — dòng chưa ghi ai có
    # `employee_id=None, unassigned=True`.
    employee_id: uuid.UUID | None
    employee_code: str | None
    employee_name: str | None
    unassigned: bool = False
    order_count: int
    subtotal_revenue: int
    profit: int | None


class EmployeeRevenueReportOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: date = Field(alias="from")
    to: date
    items: list[EmployeeRevenueRowOut]
    total: int
