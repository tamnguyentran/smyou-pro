"""`GET /api/v1/reports/revenue-by-employee`, `/{employee_id}/orders`, `/export` (M15-10a).

Doanh thu nhóm theo nhân viên tạo đơn (`orders.created_by`) trong khoảng ngày; `own` = chính
`orders.created_by` của người gọi (Q88/Q96, `docs/product/OPEN_QUESTIONS_ARCHIVE.md`) — cùng
trục nhóm với scope nên SALE/CUSTOMER_CARE chỉ thấy đúng dòng của mình (hệ quả tự nhiên, xem spec
M15-10a §8). Helper ngày/lợi nhuận/CSV tái dùng từ `revenue_report.service` (M15-09a).
"""

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authz import Actor, apply_scope
from app.core.errors import AppError
from app.modules.identity.models import Employee
from app.modules.orders.models import Order
from app.modules.revenue_report.schemas import (
    EmployeeRevenueReportOut,
    EmployeeRevenueRowOut,
    RevenueOrderOut,
)
from app.modules.revenue_report.service import (
    RULES,
    _escape_csv_formula,
    _order_profits,
    _statuses,
    _validate_range,
    _vn_day_start_utc,
)


@dataclass
class _Group:
    order_count: int = 0
    subtotal_revenue: int = 0
    profit: int = 0
    has_null: bool = False


_CSV_HEADER = ["Mã nhân viên", "Tên nhân viên", "Số đơn", "Doanh thu", "Lợi nhuận"]


def get_report(
    session: Session,
    actor: Actor,
    *,
    date_from: date,
    date_to: date,
    employee_id: uuid.UUID | None,
    status: str,
) -> EmployeeRevenueReportOut:
    _validate_range(date_from, date_to)
    statuses = _statuses(status)
    from_utc = _vn_day_start_utc(date_from)
    to_utc_exclusive = _vn_day_start_utc(date_to + timedelta(days=1))

    stmt = select(Order.id, Order.created_by, Order.total).where(Order.status.in_(statuses))
    if status == "NOT_COMPLETED":
        stmt = stmt.where(Order.created_at >= from_utc, Order.created_at < to_utc_exclusive)
    else:
        stmt = stmt.where(Order.completed_at >= from_utc, Order.completed_at < to_utc_exclusive)
    if employee_id is not None:
        stmt = stmt.where(Order.created_by == employee_id)
    stmt = apply_scope(stmt, actor, RULES)
    orders = session.execute(stmt).all()

    if not orders:
        return EmployeeRevenueReportOut(**{"from": date_from}, to=date_to, items=[], total=0)

    order_profits = _order_profits(session, [row.id for row in orders])

    groups: dict[uuid.UUID, _Group] = {}
    for row in orders:
        group = groups.setdefault(row.created_by, _Group())
        group.order_count += 1
        group.subtotal_revenue += row.total
        profit = order_profits.get(row.id)
        if profit is None:
            group.has_null = True
        else:
            group.profit += profit

    employees = {e.id: e for e in session.scalars(select(Employee).where(Employee.id.in_(groups.keys())))}

    rows = [
        EmployeeRevenueRowOut(
            employee_id=emp_id,
            employee_code=employees[emp_id].code,
            employee_name=employees[emp_id].full_name,
            order_count=group.order_count,
            subtotal_revenue=group.subtotal_revenue,
            profit=None if group.has_null else group.profit,
        )
        for emp_id, group in groups.items()
    ]
    rows.sort(key=lambda r: r.employee_code)
    return EmployeeRevenueReportOut(**{"from": date_from}, to=date_to, items=rows, total=len(rows))


def get_employee_orders(
    session: Session,
    actor: Actor,
    employee_id: uuid.UUID,
    *,
    date_from: date,
    date_to: date,
    status: str,
) -> list[RevenueOrderOut]:
    visible_stmt = apply_scope(select(Order.id).where(Order.created_by == employee_id).limit(1), actor, RULES)
    if session.execute(visible_stmt).first() is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.")

    _validate_range(date_from, date_to)
    statuses = _statuses(status)
    from_utc = _vn_day_start_utc(date_from)
    to_utc_exclusive = _vn_day_start_utc(date_to + timedelta(days=1))

    stmt = select(Order).where(Order.created_by == employee_id, Order.status.in_(statuses))
    if status == "NOT_COMPLETED":
        stmt = stmt.where(Order.created_at >= from_utc, Order.created_at < to_utc_exclusive)
    else:
        stmt = stmt.where(Order.completed_at >= from_utc, Order.completed_at < to_utc_exclusive)
    stmt = apply_scope(stmt, actor, RULES)
    orders = session.scalars(stmt.order_by(Order.created_at)).all()

    order_profits = _order_profits(session, [order.id for order in orders])
    return [
        RevenueOrderOut(
            id=order.id,
            code=order.code,
            created_at=order.created_at,
            completed_at=order.completed_at,
            total=order.total,
            profit=order_profits.get(order.id),
        )
        for order in orders
    ]


def build_csv(report: EmployeeRevenueReportOut) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_CSV_HEADER)
    for row in report.items:
        writer.writerow(
            [
                _escape_csv_formula(row.employee_code),
                _escape_csv_formula(row.employee_name),
                row.order_count,
                row.subtotal_revenue,
                "" if row.profit is None else row.profit,
            ]
        )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
