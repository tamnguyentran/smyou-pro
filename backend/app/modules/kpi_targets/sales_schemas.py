"""Response bodies for `GET /api/v1/reports/kpi-sales` and `/api/v1/me/kpi-sales` (M21-02a)."""

import uuid

from pydantic import BaseModel


class KpiSalesRowOut(BaseModel):
    stt: int
    employee_id: uuid.UUID
    employee_code: str
    employee_name: str
    department_name: str | None
    total_sales: int
    # None when at least one credited line has no `cost_price_snapshot` (same rule as M16-05 profit).
    net_revenue: int | None
    target: int | None
    achievement_pct: float | None


class KpiSalesTotalsOut(BaseModel):
    total_sales: int
    net_revenue: int
    target: int
    has_missing_cost: bool
    # UAT-05: total net revenue / total target, same rounding as a row; None when the total target is 0.
    achievement_pct: float | None


class KpiSalesReportOut(BaseModel):
    month: str
    rows: list[KpiSalesRowOut]
    totals: KpiSalesTotalsOut


class MyKpiSalesOut(BaseModel):
    month: str
    total_sales: int
    net_revenue: int | None
    target: int | None
    achievement_pct: float | None
