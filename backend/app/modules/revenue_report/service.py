"""`GET /api/v1/reports/revenue-by-customer`, `/{customer_id}/lines`, `/export` (M16-06).

Doanh thu nhóm theo (khách hàng x NV được "Ghi doanh số" trên dòng hàng, `order_lines.
credited_employee_id`) — không còn theo `orders.created_by` như M15-09a. Dòng hàng chưa ghi ai
gộp vào 1 dòng "Chưa gán" riêng theo từng khách hàng (`unassigned=True`, `seller=None`). `own` =
dòng có `credited_employee_id = actor.id` (thay Q88/Q96 cho báo cáo này, cùng M16-05). Biên ngày
quy đổi theo giờ Việt Nam, cùng mẫu `_vn_day_start_utc` ở `kpi/service.py` (M8-01a)/
`dashboard/service.py` (M7-02).
"""

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select, true
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope
from app.core.errors import AppError
from app.modules.customers.models import Customer
from app.modules.identity.models import Employee
from app.modules.orders.models import Order, OrderLine
from app.modules.revenue_report.schemas import RevenueLineOut, RevenueReportOut, RevenueRowOut, SellerOut

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

NOT_COMPLETED_STATUSES = ("PENDING_DISPATCH", "IN_PROGRESS", "AWAITING_CONFIRMATION", "REVISION")

RULES: ScopeRules = {"own": lambda actor: OrderLine.credited_employee_id == actor.id}

_LINES_REQUIRE_EXACTLY_ONE = "Không được truyền cả seller_id và unassigned."


@dataclass
class _Group:
    order_ids: set[uuid.UUID]
    subtotal_revenue: int = 0
    profit: int = 0
    has_null: bool = False


_CSV_HEADER = [
    "Mã khách hàng",
    "Tên khách hàng",
    "Người liên hệ",
    "Số điện thoại",
    "Mã người bán",
    "Tên người bán",
    "Số đơn",
    "Doanh thu",
    "Lợi nhuận",
]
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@")


def _escape_csv_formula(value: str) -> str:
    """Neutralize Excel/Sheets formula injection (CWE-1236), same as `kpi/service.py`."""
    return f"'{value}" if value.startswith(_CSV_FORMULA_PREFIXES) else value


def _vn_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=VIETNAM)


def default_date_range(now: datetime) -> tuple[date, date]:
    today_vn = now.astimezone(VIETNAM).date()
    return today_vn.replace(day=1), today_vn


def _validate_range(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        message = "Từ ngày không được sau Đến ngày."
        raise AppError(
            422,
            "VALIDATION_ERROR",
            message,
            errors=[{"field": "from", "code": "invalid_range", "message": message}],
        )


def _statuses(status: str) -> tuple[str, ...]:
    return NOT_COMPLETED_STATUSES if status == "NOT_COMPLETED" else ("COMPLETED",)


def _line_profit(line_total: int, cost_price_snapshot: int | None, quantity: Decimal) -> int | None:
    """M16-05/M16-06: lợi nhuận của 1 dòng hàng = `line_total - cost_price_snapshot x quantity`;
    `None` nếu dòng chưa có `cost_price_snapshot` (pre-M15-08), không phải 0."""
    if cost_price_snapshot is None:
        return None
    return int(
        (Decimal(line_total) - Decimal(cost_price_snapshot) * quantity).quantize(
            Decimal(1), rounding=ROUND_HALF_UP
        )
    )


def get_report(
    session: Session,
    actor: Actor,
    *,
    date_from: date,
    date_to: date,
    customer_id: uuid.UUID | None,
    status: str,
) -> RevenueReportOut:
    _validate_range(date_from, date_to)
    statuses = _statuses(status)
    from_utc = _vn_day_start_utc(date_from)
    to_utc_exclusive = _vn_day_start_utc(date_to + timedelta(days=1))

    stmt = (
        select(
            OrderLine.order_id,
            Order.customer_id,
            OrderLine.credited_employee_id,
            OrderLine.line_total,
            OrderLine.cost_price_snapshot,
            OrderLine.quantity,
        )
        .join(Order, Order.id == OrderLine.order_id)
        .where(Order.status.in_(statuses), Order.customer_id.isnot(None))
    )
    if status == "NOT_COMPLETED":
        stmt = stmt.where(Order.created_at >= from_utc, Order.created_at < to_utc_exclusive)
    else:
        stmt = stmt.where(Order.completed_at >= from_utc, Order.completed_at < to_utc_exclusive)
    if customer_id is not None:
        stmt = stmt.where(Order.customer_id == customer_id)
    stmt = apply_scope(stmt, actor, RULES)
    rows = session.execute(stmt).all()

    if not rows:
        return RevenueReportOut(**{"from": date_from}, to=date_to, items=[], total=0)

    groups: dict[tuple[uuid.UUID, uuid.UUID | None], _Group] = {}
    for row in rows:
        key = (row.customer_id, row.credited_employee_id)
        group = groups.setdefault(key, _Group(order_ids=set()))
        group.order_ids.add(row.order_id)
        group.subtotal_revenue += row.line_total
        profit = _line_profit(row.line_total, row.cost_price_snapshot, row.quantity)
        if profit is None:
            group.has_null = True
        else:
            group.profit += profit

    customer_ids = {key[0] for key in groups}
    seller_ids = {key[1] for key in groups if key[1] is not None}
    customers = {c.id: c for c in session.scalars(select(Customer).where(Customer.id.in_(customer_ids)))}
    sellers = {e.id: e for e in session.scalars(select(Employee).where(Employee.id.in_(seller_ids)))}

    out_rows = []
    for (cust_id, seller_id), group in groups.items():
        customer = customers[cust_id]
        seller = sellers[seller_id] if seller_id is not None else None
        out_rows.append(
            RevenueRowOut(
                customer_id=cust_id,
                customer_code=customer.code,
                customer_name=customer.name,
                contact_person=customer.contact_person,
                contact_phone=customer.phone,
                seller=SellerOut(id=seller.id, code=seller.code, full_name=seller.full_name)
                if seller is not None
                else None,
                unassigned=seller_id is None,
                order_count=len(group.order_ids),
                subtotal_revenue=group.subtotal_revenue,
                profit=None if group.has_null else group.profit,
            )
        )
    out_rows.sort(key=lambda r: (r.customer_code, r.unassigned, r.seller.full_name if r.seller else ""))
    return RevenueReportOut(**{"from": date_from}, to=date_to, items=out_rows, total=len(out_rows))


def get_customer_lines(
    session: Session,
    actor: Actor,
    customer_id: uuid.UUID,
    *,
    date_from: date,
    date_to: date,
    status: str,
    seller_id: uuid.UUID | None,
    unassigned: bool,
) -> list[RevenueLineOut]:
    if seller_id is not None and unassigned:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            _LINES_REQUIRE_EXACTLY_ONE,
            errors=[{"field": "seller_id", "code": "invalid", "message": _LINES_REQUIRE_EXACTLY_ONE}],
        )
    seller_condition = (
        OrderLine.credited_employee_id.is_(None)
        if unassigned
        else (OrderLine.credited_employee_id == seller_id if seller_id is not None else true())
    )

    visible_stmt = apply_scope(
        select(OrderLine.id)
        .join(Order, Order.id == OrderLine.order_id)
        .where(Order.customer_id == customer_id, seller_condition)
        .limit(1),
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
        .where(Order.customer_id == customer_id, Order.status.in_(statuses), seller_condition)
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


def build_csv(report: RevenueReportOut) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_CSV_HEADER)
    for row in report.items:
        writer.writerow(
            [
                _escape_csv_formula(row.customer_code),
                _escape_csv_formula(row.customer_name),
                _escape_csv_formula(row.contact_person or ""),
                _escape_csv_formula(row.contact_phone),
                "" if row.seller is None else _escape_csv_formula(row.seller.code),
                "(Chưa gán)" if row.seller is None else _escape_csv_formula(row.seller.full_name),
                row.order_count,
                row.subtotal_revenue,
                "" if row.profit is None else row.profit,
            ]
        )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
