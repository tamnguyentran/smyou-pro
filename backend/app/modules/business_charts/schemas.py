"""Response bodies for `GET /api/v1/reports/business-charts/*` (M23a)."""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.kpi_targets.sales_schemas import KpiSalesRowOut

Metric = Literal["revenue", "profit"]


class _Period(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # JSON key "from" via the alias (Python keyword), like `KpiReportOut`.
    from_: str = Field(alias="from")
    to: str


class MonthlyMoneyOut(BaseModel):
    month: str
    revenue: int
    profit: int


class ShareOut(BaseModel):
    key: str
    label: str
    revenue: int
    profit: int


class CompositionOut(BaseModel):
    by_group: list[ShareOut]
    by_item: list[ShareOut]
    by_customer_type: list[ShareOut]


class CustomersMonthOut(BaseModel):
    month: str
    new_count: int
    returning_count: int


class BusinessResultsOut(_Period):
    monthly: list[MonthlyMoneyOut]
    composition: CompositionOut
    customers_monthly: list[CustomersMonthOut]


class ParetoItemOut(BaseModel):
    key: str
    label: str
    value: int
    cumulative_pct: float
    is_vital: bool


class ItemQuantityOut(BaseModel):
    key: str
    label: str
    unit: str
    quantity: float
    revenue: int


class BusinessSalesOut(_Period):
    metric: Metric
    pareto: list[ParetoItemOut]
    top_selling: list[ItemQuantityOut]
    slow_selling: list[ItemQuantityOut]


class TechnicianHoursOut(BaseModel):
    employee_id: uuid.UUID
    employee_code: str
    employee_name: str
    assigned_hours: float
    task_count: int


class KpiCompletionOut(BaseModel):
    month: str
    rows: list[KpiSalesRowOut]


class BusinessStaffOut(_Period):
    hours_by_technician: list[TechnicianHoursOut]
    kpi_completion: KpiCompletionOut
