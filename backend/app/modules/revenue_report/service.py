"""`GET /api/v1/reports/revenue-by-customer`, `/{customer_id}/orders`, `/export` (M15-09a).

Doanh thu nhóm theo (khách hàng x người bán) trong khoảng ngày; `own` = `orders.created_by`
(Q88/Q96, `docs/product/OPEN_QUESTIONS_ARCHIVE.md`). Biên ngày quy đổi theo giờ Việt Nam, cùng
mẫu `_vn_day_start_utc` ở `kpi/service.py` (M8-01a)/`dashboard/service.py` (M7-02).
"""

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope
from app.core.errors import AppError
from app.modules.customers.models import Customer
from app.modules.identity.models import Employee
from app.modules.orders.models import Order, OrderLine
from app.modules.revenue_report.schemas import RevenueOrderOut, RevenueReportOut, RevenueRowOut, SellerOut

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

NOT_COMPLETED_STATUSES = ("PENDING_DISPATCH", "IN_PROGRESS", "AWAITING_CONFIRMATION", "REVISION")

RULES: ScopeRules = {"own": lambda actor: Order.created_by == actor.id}


@dataclass
class _Group:
    order_count: int = 0
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


def _order_profits(session: Session, order_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Per-order profit = sum(line_total - cost_price_snapshot * quantity); an order with any line
    missing `cost_price_snapshot` (pre-M15-08) is left out of the result (AC-RPT-002: null, not 0)."""
    if not order_ids:
        return {}
    rows = session.execute(
        select(
            OrderLine.order_id, OrderLine.line_total, OrderLine.cost_price_snapshot, OrderLine.quantity
        ).where(OrderLine.order_id.in_(order_ids))
    ).all()
    sums: dict[uuid.UUID, Decimal] = {}
    missing: set[uuid.UUID] = set()
    for order_id, line_total, cost_price_snapshot, quantity in rows:
        if order_id in missing:
            continue
        if cost_price_snapshot is None:
            missing.add(order_id)
            sums.pop(order_id, None)
            continue
        sums[order_id] = sums.get(order_id, Decimal(0)) + (
            Decimal(line_total) - Decimal(cost_price_snapshot) * quantity
        )
    return {
        order_id: int(total.quantize(Decimal(1), rounding=ROUND_HALF_UP)) for order_id, total in sums.items()
    }


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

    stmt = select(Order.id, Order.customer_id, Order.created_by, Order.total).where(
        Order.status.in_(statuses), Order.customer_id.isnot(None)
    )
    if status == "NOT_COMPLETED":
        stmt = stmt.where(Order.created_at >= from_utc, Order.created_at < to_utc_exclusive)
    else:
        stmt = stmt.where(Order.completed_at >= from_utc, Order.completed_at < to_utc_exclusive)
    if customer_id is not None:
        stmt = stmt.where(Order.customer_id == customer_id)
    stmt = apply_scope(stmt, actor, RULES)
    orders = session.execute(stmt).all()

    if not orders:
        return RevenueReportOut(**{"from": date_from}, to=date_to, items=[], total=0)

    order_profits = _order_profits(session, [row.id for row in orders])

    groups: dict[tuple[uuid.UUID, uuid.UUID], _Group] = {}
    for row in orders:
        key = (row.customer_id, row.created_by)
        group = groups.setdefault(key, _Group())
        group.order_count += 1
        group.subtotal_revenue += row.total
        profit = order_profits.get(row.id)
        if profit is None:
            group.has_null = True
        else:
            group.profit += profit

    customer_ids = {key[0] for key in groups}
    seller_ids = {key[1] for key in groups}
    customers = {c.id: c for c in session.scalars(select(Customer).where(Customer.id.in_(customer_ids)))}
    sellers = {e.id: e for e in session.scalars(select(Employee).where(Employee.id.in_(seller_ids)))}

    rows = []
    for (cust_id, seller_id), group in groups.items():
        customer = customers[cust_id]
        seller = sellers[seller_id]
        rows.append(
            RevenueRowOut(
                customer_id=cust_id,
                customer_code=customer.code,
                customer_name=customer.name,
                contact_person=customer.contact_person,
                contact_phone=customer.phone,
                seller=SellerOut(id=seller.id, code=seller.code, full_name=seller.full_name),
                order_count=group.order_count,
                subtotal_revenue=group.subtotal_revenue,
                profit=None if group.has_null else group.profit,
            )
        )
    rows.sort(key=lambda r: (r.customer_code, r.seller.full_name))
    return RevenueReportOut(**{"from": date_from}, to=date_to, items=rows, total=len(rows))


def get_customer_orders(
    session: Session,
    actor: Actor,
    customer_id: uuid.UUID,
    *,
    date_from: date,
    date_to: date,
    status: str,
    seller_id: uuid.UUID | None,
) -> list[RevenueOrderOut]:
    visible_stmt = apply_scope(
        select(Order.id).where(Order.customer_id == customer_id).limit(1), actor, RULES
    )
    if session.execute(visible_stmt).first() is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.")

    _validate_range(date_from, date_to)
    statuses = _statuses(status)
    from_utc = _vn_day_start_utc(date_from)
    to_utc_exclusive = _vn_day_start_utc(date_to + timedelta(days=1))

    stmt = select(Order).where(Order.customer_id == customer_id, Order.status.in_(statuses))
    if status == "NOT_COMPLETED":
        stmt = stmt.where(Order.created_at >= from_utc, Order.created_at < to_utc_exclusive)
    else:
        stmt = stmt.where(Order.completed_at >= from_utc, Order.completed_at < to_utc_exclusive)
    if seller_id is not None:
        stmt = stmt.where(Order.created_by == seller_id)
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
                _escape_csv_formula(row.seller.code),
                _escape_csv_formula(row.seller.full_name),
                row.order_count,
                row.subtotal_revenue,
                "" if row.profit is None else row.profit,
            ]
        )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
