"""`GET /api/v1/reports/revenue-by-product`, `/lines`, `/export` (M24-01a).

Cùng tập dòng hàng, scope `own` (`credited_employee_id`) và công thức lợi nhuận như "Doanh thu theo
nhân viên" (M16-05, Q178); chỉ khác khoá gom: `mode=group` theo nhóm SP/DV của **đơn**
(`orders.division_id`, Q176), `mode=item` theo `product_id`/`service_id` với nhãn lấy từ danh mục
hiện tại, dòng tự nhập gom theo `name_snapshot` (Q177).
"""

import csv
import io
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import ColumnElement, Select, and_, select
from sqlalchemy.orm import Session

from app.core.authz import Actor, apply_scope
from app.core.errors import AppError
from app.modules.catalog.models import Product, ProductServiceGroup, Service
from app.modules.orders.models import Order, OrderLine
from app.modules.revenue_report.employee_service import RULES
from app.modules.revenue_report.schemas import (
    ProductRevenueReportOut,
    ProductRevenueRowOut,
    ProductRevenueSummaryOut,
    RevenueLineOut,
)
from app.modules.revenue_report.service import (
    _escape_csv_formula,
    _line_profit,
    _statuses,
    _validate_range,
    _vn_day_start_utc,
)

Mode = Literal["group", "item"]
UNGROUPED = "ungrouped"
UNGROUPED_LABEL = "Chưa phân nhóm"
_ITEM_TYPE_LABELS = {"PRODUCT": "Sản phẩm", "SERVICE": "Dịch vụ", "CUSTOM": "Tự nhập"}
_GROUP_CSV_HEADER = ["Nhóm SP/DV", "Số đơn", "Doanh thu", "Lợi nhuận"]
_ITEM_CSV_HEADER = ["Mã", "Tên", "Loại", "ĐVT", "Số lượng", "Số đơn", "Doanh thu", "Lợi nhuận"]


@dataclass
class _Bucket:
    order_ids: set[uuid.UUID] = field(default_factory=set)
    quantity: Decimal = Decimal(0)
    subtotal_revenue: int = 0
    profit: int = 0
    has_null: bool = False
    unit_snapshot: str | None = None
    # Tên lúc bán của các dòng tự nhập gộp chung (khác hoa/thường, khoảng trắng đầu/cuối).
    names: set[str] = field(default_factory=set)


def _invalid(field_name: str, message: str) -> AppError:
    return AppError(
        422,
        "VALIDATION_ERROR",
        message,
        errors=[{"field": field_name, "code": "invalid", "message": message}],
    )


def _parse_uuid(raw: str, field_name: str, message: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise _invalid(field_name, message) from None


def _group_condition(group_id: str | None) -> ColumnElement[bool] | None:
    if group_id is None:
        return None
    if group_id == UNGROUPED:
        return Order.division_id.is_(None)
    return Order.division_id == _parse_uuid(group_id, "group_id", "Nhóm SP/DV không hợp lệ.")


def _custom_name(name: str) -> str:
    """Dòng tự nhập gộp theo tên không phân biệt hoa/thường, bỏ khoảng trắng đầu/cuối (chủ SP
    2026-11-05: "Cáp" và "cáp" là 1 dòng)."""
    return name.strip().casefold()


def _key_condition(mode: Mode, key: str) -> tuple[ColumnElement[bool], str | None]:
    """Điều kiện SQL của 1 `key` + tên chuẩn hoá (chỉ cho `custom:`) để lọc tiếp ở Python, cùng
    cách so sánh với lúc gộp (`str.casefold`, không phụ thuộc collation của Postgres)."""
    message = "Khoá dòng báo cáo không hợp lệ."
    prefix, sep, value = key.partition(":")
    if mode == "group":
        if key == UNGROUPED:
            return Order.division_id.is_(None), None
        if prefix == "group" and sep:
            return Order.division_id == _parse_uuid(value, "key", message), None
    elif sep and value:
        if prefix == "product":
            return OrderLine.product_id == _parse_uuid(value, "key", message), None
        if prefix == "service":
            return OrderLine.service_id == _parse_uuid(value, "key", message), None
        if prefix == "custom" and value.strip():
            return and_(OrderLine.product_id.is_(None), OrderLine.service_id.is_(None)), _custom_name(value)
    raise _invalid("key", message)


def _filtered(
    stmt: Select[Any], actor: Actor, *, date_from: date, date_to: date, status: str, group_id: str | None
) -> Select[Any]:
    _validate_range(date_from, date_to)
    from_utc = _vn_day_start_utc(date_from)
    to_utc_exclusive = _vn_day_start_utc(date_to + timedelta(days=1))
    stmt = stmt.join(Order, Order.id == OrderLine.order_id).where(Order.status.in_(_statuses(status)))
    if status == "NOT_COMPLETED":
        stmt = stmt.where(Order.created_at >= from_utc, Order.created_at < to_utc_exclusive)
    else:
        stmt = stmt.where(Order.completed_at >= from_utc, Order.completed_at < to_utc_exclusive)
    condition = _group_condition(group_id)
    if condition is not None:
        stmt = stmt.where(condition)
    return apply_scope(stmt, actor, RULES)


def _item_key(product_id: uuid.UUID | None, service_id: uuid.UUID | None, name: str) -> str:
    if product_id is not None:
        return f"product:{product_id}"
    if service_id is not None:
        return f"service:{service_id}"
    return f"custom:{_custom_name(name)}"


def get_report(
    session: Session,
    actor: Actor,
    *,
    mode: Mode,
    date_from: date,
    date_to: date,
    status: str,
    group_id: str | None,
) -> ProductRevenueReportOut:
    stmt = _filtered(
        select(
            OrderLine.order_id,
            Order.division_id,
            OrderLine.product_id,
            OrderLine.service_id,
            OrderLine.name_snapshot,
            OrderLine.unit_snapshot,
            OrderLine.quantity,
            OrderLine.line_total,
            OrderLine.cost_price_snapshot,
        ),
        actor,
        date_from=date_from,
        date_to=date_to,
        status=status,
        group_id=group_id,
    )
    buckets: dict[str, _Bucket] = {}
    for row in session.execute(stmt):
        if mode == "group":
            key = UNGROUPED if row.division_id is None else f"group:{row.division_id}"
        else:
            key = _item_key(row.product_id, row.service_id, row.name_snapshot)
        bucket = buckets.setdefault(key, _Bucket(unit_snapshot=row.unit_snapshot))
        bucket.order_ids.add(row.order_id)
        bucket.names.add(row.name_snapshot.strip())
        bucket.quantity += row.quantity
        bucket.subtotal_revenue += row.line_total
        profit = _line_profit(row.line_total, row.cost_price_snapshot, row.quantity)
        if profit is None:
            bucket.has_null = True
        else:
            bucket.profit += profit

    items = _group_rows(session, buckets) if mode == "group" else _item_rows(session, buckets)
    items.sort(key=lambda r: (r.key == UNGROUPED, -r.subtotal_revenue, r.label.casefold()))
    summary = ProductRevenueSummaryOut(
        subtotal_revenue=sum(r.subtotal_revenue for r in items),
        profit=None if any(r.profit is None for r in items) else sum(r.profit or 0 for r in items),
    )
    return ProductRevenueReportOut(
        **{"from": date_from}, to=date_to, mode=mode, items=items, summary=summary, total=len(items)
    )


def _row(bucket: _Bucket, **fields: Any) -> ProductRevenueRowOut:
    return ProductRevenueRowOut(
        order_count=len(bucket.order_ids),
        subtotal_revenue=bucket.subtotal_revenue,
        profit=None if bucket.has_null else bucket.profit,
        **fields,
    )


def _group_rows(session: Session, buckets: dict[str, _Bucket]) -> list[ProductRevenueRowOut]:
    ids = [uuid.UUID(key.removeprefix("group:")) for key in buckets if key != UNGROUPED]
    names = dict(
        session.execute(
            select(ProductServiceGroup.id, ProductServiceGroup.name).where(ProductServiceGroup.id.in_(ids))
        )
        .tuples()
        .all()
    )
    return [
        _row(
            bucket,
            key=key,
            label=UNGROUPED_LABEL if key == UNGROUPED else names[uuid.UUID(key.removeprefix("group:"))],
            code=None,
            item_type=None,
            unit=None,
            quantity=None,
        )
        for key, bucket in buckets.items()
    ]


def _item_rows(session: Session, buckets: dict[str, _Bucket]) -> list[ProductRevenueRowOut]:
    product_ids = [uuid.UUID(k.removeprefix("product:")) for k in buckets if k.startswith("product:")]
    service_ids = [uuid.UUID(k.removeprefix("service:")) for k in buckets if k.startswith("service:")]
    catalog: dict[str, tuple[str, str, str]] = {}
    for p in session.execute(
        select(Product.id, Product.sku, Product.name, Product.unit).where(Product.id.in_(product_ids))
    ):
        catalog[f"product:{p.id}"] = (p.sku, p.name, p.unit)
    for s in session.execute(
        select(Service.id, Service.code, Service.name, Service.unit).where(Service.id.in_(service_ids))
    ):
        catalog[f"service:{s.id}"] = (s.code, s.name, s.unit)

    rows = []
    for key, bucket in buckets.items():
        if key.startswith("custom:"):
            # Nhãn = 1 tên lúc bán, chọn cố định (nhỏ nhất) để key/nhãn không đổi giữa các lần gọi.
            label = min(bucket.names)
            code, unit, item_type = None, bucket.unit_snapshot, "CUSTOM"
            key = f"custom:{label}"
        else:
            code, label, unit = catalog[key]
            item_type = "PRODUCT" if key.startswith("product:") else "SERVICE"
        rows.append(
            _row(
                bucket,
                key=key,
                label=label,
                code=code,
                item_type=item_type,
                unit=unit,
                quantity=bucket.quantity,
            )
        )
    return rows


def get_lines(
    session: Session,
    actor: Actor,
    *,
    mode: Mode,
    key: str,
    date_from: date,
    date_to: date,
    status: str,
    group_id: str | None,
) -> list[RevenueLineOut]:
    condition, custom_name = _key_condition(mode, key)
    stmt = _filtered(
        select(OrderLine, Order.code, Order.created_at, Order.completed_at).where(condition),
        actor,
        date_from=date_from,
        date_to=date_to,
        status=status,
        group_id=group_id,
    )
    rows = session.execute(stmt.order_by(Order.created_at, OrderLine.position)).all()
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
        if custom_name is None or _custom_name(line.name_snapshot) == custom_name
    ]


def build_csv(report: ProductRevenueReportOut) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_GROUP_CSV_HEADER if report.mode == "group" else _ITEM_CSV_HEADER)
    for row in report.items:
        money = [row.order_count, row.subtotal_revenue, "" if row.profit is None else row.profit]
        if report.mode == "group":
            writer.writerow([_escape_csv_formula(row.label), *money])
        else:
            writer.writerow(
                [
                    _escape_csv_formula(row.code or ""),
                    _escape_csv_formula(row.label),
                    _ITEM_TYPE_LABELS[row.item_type or "CUSTOM"],
                    row.unit or "",
                    "" if row.quantity is None else format(row.quantity.normalize(), "f"),
                    *money,
                ]
            )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
