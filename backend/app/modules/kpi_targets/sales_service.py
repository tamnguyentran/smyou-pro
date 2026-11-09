""" "Báo cáo KPI" doanh số theo tháng (M21-02a).

Doanh số tính theo dòng hàng được "Ghi doanh số" (`order_lines.credited_employee_id`, như M16-05)
của đơn `COMPLETED` có `completed_at` trong tháng (giờ VN), so với chỉ tiêu M21-01a. Lọc nhóm
dùng `orders.division_id` (Q149) và chỉ thu hẹp doanh số; mục tiêu luôn là chỉ tiêu tổng.
"""

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.departments.models import Department
from app.modules.identity.models import Employee
from app.modules.kpi_targets.models import EmployeeKpiTarget
from app.modules.kpi_targets.sales_schemas import (
    KpiSalesReportOut,
    KpiSalesRowOut,
    KpiSalesTotalsOut,
    MyKpiSalesOut,
)
from app.modules.kpi_targets.service import _add_months, _label, parse_month
from app.modules.orders.models import Order, OrderLine
from app.modules.revenue_report.service import VIETNAM, _escape_csv_formula, _line_profit

_CSV_HEADER = ["STT", "Mã NV", "Họ tên", "Tổng doanh số", "Doanh thu thuần", "Mục tiêu", "Tỷ lệ đạt (%)"]


@dataclass
class _Sales:
    total: int = 0
    net: int = 0
    missing_cost: bool = False

    @property
    def net_revenue(self) -> int | None:
        return None if self.missing_cost else self.net


def resolve_month(month: str | None, now: datetime) -> date:
    return parse_month(month) if month is not None else now.astimezone(VIETNAM).date().replace(day=1)


def _vn_month_start_utc(month: date) -> datetime:
    return datetime.combine(month, time.min, tzinfo=VIETNAM)


def _achievement_pct(net_revenue: int | None, target: int | None) -> float | None:
    if net_revenue is None or not target:
        return None
    pct = (Decimal(net_revenue) * 100 / Decimal(target)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return float(pct)


def _restrict(stmt: Any, column: Any, department_id: uuid.UUID | None, employee_id: uuid.UUID | None) -> Any:
    if employee_id is not None:
        stmt = stmt.where(column == employee_id)
    if department_id is not None:
        stmt = stmt.where(column.in_(select(Employee.id).where(Employee.department_id == department_id)))
    return stmt


def _sales(
    session: Session,
    month: date,
    *,
    department_id: uuid.UUID | None,
    group_id: uuid.UUID | None,
    employee_id: uuid.UUID | None,
) -> dict[uuid.UUID, _Sales]:
    stmt = (
        select(
            OrderLine.credited_employee_id,
            OrderLine.line_total,
            OrderLine.cost_price_snapshot,
            OrderLine.quantity,
        )
        .join(Order, Order.id == OrderLine.order_id)
        .where(
            Order.status == "COMPLETED",
            Order.completed_at >= _vn_month_start_utc(month),
            Order.completed_at < _vn_month_start_utc(_add_months(month, 1)),
            OrderLine.credited_employee_id.is_not(None),
        )
    )
    if group_id is not None:
        stmt = stmt.where(Order.division_id == group_id)
    stmt = _restrict(stmt, OrderLine.credited_employee_id, department_id, employee_id)

    sales: dict[uuid.UUID, _Sales] = {}
    for row in session.execute(stmt):
        entry = sales.setdefault(row.credited_employee_id, _Sales())
        entry.total += row.line_total
        profit = _line_profit(row.line_total, row.cost_price_snapshot, row.quantity)
        if profit is None:
            entry.missing_cost = True
        else:
            entry.net += profit
    return sales


def _targets(
    session: Session, month: date, *, department_id: uuid.UUID | None, employee_id: uuid.UUID | None
) -> dict[uuid.UUID, int]:
    stmt = select(EmployeeKpiTarget.employee_id, EmployeeKpiTarget.net_revenue_target).where(
        EmployeeKpiTarget.month == month
    )
    stmt = _restrict(stmt, EmployeeKpiTarget.employee_id, department_id, employee_id)
    return {row.employee_id: row.net_revenue_target for row in session.execute(stmt)}


def get_report(
    session: Session,
    month: date,
    *,
    department_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    employee_id: uuid.UUID | None = None,
) -> KpiSalesReportOut:
    sales = _sales(session, month, department_id=department_id, group_id=group_id, employee_id=employee_id)
    targets = _targets(session, month, department_id=department_id, employee_id=employee_id)
    ids = set(sales) | set(targets)
    people = session.execute(
        select(Employee.id, Employee.code, Employee.full_name, Department.name.label("department_name"))
        .outerjoin(Department, Department.id == Employee.department_id)
        .where(Employee.id.in_(ids))
        .order_by(Employee.code)
    ).all()

    rows: list[KpiSalesRowOut] = []
    for stt, person in enumerate(people, start=1):
        entry = sales.get(person.id, _Sales())
        target = targets.get(person.id)
        rows.append(
            KpiSalesRowOut(
                stt=stt,
                employee_id=person.id,
                employee_code=person.code,
                employee_name=person.full_name,
                department_name=person.department_name,
                total_sales=entry.total,
                net_revenue=entry.net_revenue,
                target=target,
                achievement_pct=_achievement_pct(entry.net_revenue, target),
            )
        )
    net_revenue = sum(r.net_revenue or 0 for r in rows)
    target_total = sum(r.target or 0 for r in rows)
    totals = KpiSalesTotalsOut(
        total_sales=sum(r.total_sales for r in rows),
        net_revenue=net_revenue,
        target=target_total,
        has_missing_cost=any(r.net_revenue is None for r in rows),
        achievement_pct=_achievement_pct(net_revenue, target_total),
    )
    return KpiSalesReportOut(month=_label(month), rows=rows, totals=totals)


def get_mine(session: Session, employee_id: uuid.UUID, month: date) -> MyKpiSalesOut:
    rows = get_report(session, month, employee_id=employee_id).rows
    if not rows:
        return MyKpiSalesOut(
            month=_label(month), total_sales=0, net_revenue=0, target=None, achievement_pct=None
        )
    row = rows[0]
    return MyKpiSalesOut(
        month=_label(month),
        total_sales=row.total_sales,
        net_revenue=row.net_revenue,
        target=row.target,
        achievement_pct=row.achievement_pct,
    )


def _cell(value: int | float | None) -> str:
    return "" if value is None else str(value)


def build_csv(report: KpiSalesReportOut) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_CSV_HEADER)
    for row in report.rows:
        writer.writerow(
            [
                row.stt,
                _escape_csv_formula(row.employee_code),
                _escape_csv_formula(row.employee_name),
                row.total_sales,
                _cell(row.net_revenue),
                _cell(row.target),
                _cell(row.achievement_pct),
            ]
        )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
