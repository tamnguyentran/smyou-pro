"""`GET /api/v1/reports/revenue-by-employee`, `/lines`, `/export` (M16-05).

Doanh thu nhóm theo dòng hàng được "Ghi doanh số" (`order_lines.credited_employee_id`), không
còn theo người tạo đơn (`orders.created_by`) như M15-10a — xem spec M16-05 §2/§8. Dòng hàng chưa
ghi ai (`credited_employee_id IS NULL`) gộp vào 1 dòng tổng hợp "Chưa gán" (`unassigned=True`).
`own` = dòng có `credited_employee_id = actor.id` (thay Q88/Q96 cho báo cáo này). Helper
ngày/CSV tái dùng từ `revenue_report.service` (M15-09a).
"""

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope
from app.core.errors import AppError
from app.modules.identity.models import Employee
from app.modules.orders.models import Order, OrderLine
from app.modules.revenue_report.schemas import (
    EmployeeRevenueReportOut,
    EmployeeRevenueRowOut,
    RevenueLineOut,
)
from app.modules.revenue_report.service import (
    _escape_csv_formula,
    _line_profit,
    _statuses,
    _validate_range,
    _vn_day_start_utc,
)

RULES: ScopeRules = {"own": lambda actor: OrderLine.credited_employee_id == actor.id}

_LINES_REQUIRE_EXACTLY_ONE = "Phải chọn đúng 1 trong 2: employee_id hoặc unassigned."


@dataclass
class _Group:
    order_ids: set[uuid.UUID]
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

    stmt = (
        select(
            OrderLine.order_id,
            OrderLine.credited_employee_id,
            OrderLine.line_total,
            OrderLine.cost_price_snapshot,
            OrderLine.quantity,
        )
        .join(Order, Order.id == OrderLine.order_id)
        .where(Order.status.in_(statuses))
    )
    if status == "NOT_COMPLETED":
        stmt = stmt.where(Order.created_at >= from_utc, Order.created_at < to_utc_exclusive)
    else:
        stmt = stmt.where(Order.completed_at >= from_utc, Order.completed_at < to_utc_exclusive)
    if employee_id is not None:
        stmt = stmt.where(OrderLine.credited_employee_id == employee_id)
    stmt = apply_scope(stmt, actor, RULES)
    rows = session.execute(stmt).all()

    if not rows:
        return EmployeeRevenueReportOut(**{"from": date_from}, to=date_to, items=[], total=0)

    groups: dict[uuid.UUID | None, _Group] = {}
    for row in rows:
        key = row.credited_employee_id
        group = groups.setdefault(key, _Group(order_ids=set()))
        group.order_ids.add(row.order_id)
        group.subtotal_revenue += row.line_total
        profit = _line_profit(row.line_total, row.cost_price_snapshot, row.quantity)
        if profit is None:
            group.has_null = True
        else:
            group.profit += profit

    employee_ids = {key for key in groups if key is not None}
    employees = {e.id: e for e in session.scalars(select(Employee).where(Employee.id.in_(employee_ids)))}

    out_rows = [
        EmployeeRevenueRowOut(
            employee_id=emp_id,
            employee_code=employees[emp_id].code if emp_id is not None else None,
            employee_name=employees[emp_id].full_name if emp_id is not None else None,
            unassigned=emp_id is None,
            order_count=len(group.order_ids),
            subtotal_revenue=group.subtotal_revenue,
            profit=None if group.has_null else group.profit,
        )
        for emp_id, group in groups.items()
    ]
    out_rows.sort(key=lambda r: (r.unassigned, r.employee_code or ""))
    return EmployeeRevenueReportOut(**{"from": date_from}, to=date_to, items=out_rows, total=len(out_rows))


def get_lines(
    session: Session,
    actor: Actor,
    *,
    date_from: date,
    date_to: date,
    status: str,
    employee_id: uuid.UUID | None,
    unassigned: bool,
) -> list[RevenueLineOut]:
    if (employee_id is not None) == unassigned:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            _LINES_REQUIRE_EXACTLY_ONE,
            errors=[{"field": "employee_id", "code": "invalid", "message": _LINES_REQUIRE_EXACTLY_ONE}],
        )
    condition = (
        OrderLine.credited_employee_id.is_(None)
        if unassigned
        else (OrderLine.credited_employee_id == employee_id)
    )

    visible_stmt = apply_scope(
        select(OrderLine.id).join(Order, Order.id == OrderLine.order_id).where(condition).limit(1),
        actor,
        RULES,
    )
    if session.execute(visible_stmt).first() is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.")

    _validate_range(date_from, date_to)
    statuses = _statuses(status)
    from_utc = _vn_day_start_utc(date_from)
    to_utc_exclusive = _vn_day_start_utc(date_to + timedelta(days=1))

    stmt = (
        select(OrderLine, Order.code, Order.created_at, Order.completed_at)
        .join(Order, Order.id == OrderLine.order_id)
        .where(Order.status.in_(statuses), condition)
    )
    if status == "NOT_COMPLETED":
        stmt = stmt.where(Order.created_at >= from_utc, Order.created_at < to_utc_exclusive)
    else:
        stmt = stmt.where(Order.completed_at >= from_utc, Order.completed_at < to_utc_exclusive)
    stmt = apply_scope(stmt, actor, RULES)
    rows = session.execute(stmt.order_by(Order.created_at)).all()

    return [
        RevenueLineOut(
            id=line.id,
            order_id=line.order_id,
            order_code=code,
            line_name=line.name_snapshot,
            quantity=line.quantity,
            line_total=line.line_total,
            profit=_line_profit(line.line_total, line.cost_price_snapshot, line.quantity),
            order_created_at=created_at,
            order_completed_at=completed_at,
        )
        for line, code, created_at, completed_at in rows
    ]


def build_csv(report: EmployeeRevenueReportOut) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_CSV_HEADER)
    for row in report.items:
        writer.writerow(
            [
                "" if row.unassigned else _escape_csv_formula(row.employee_code or ""),
                "(Chưa gán)" if row.unassigned else _escape_csv_formula(row.employee_name or ""),
                row.order_count,
                row.subtotal_revenue,
                "" if row.profit is None else row.profit,
            ]
        )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
