""" "Biểu đồ kinh doanh" (M23a): số liệu tổng hợp theo kỳ tháng (giờ VN) cho 3 nhóm biểu đồ.

Tiền tính trên dòng hàng của đơn `COMPLETED` có `completed_at` trong kỳ (như M21-02a); dòng thiếu
giá vốn dùng 70% `unit_price` lúc đọc (Q158, Q165). Khách mới/quay lại tính trên đơn đã gửi (Q159, Q168).
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.business_charts import domain
from app.modules.business_charts.schemas import (
    BusinessResultsOut,
    BusinessSalesOut,
    BusinessStaffOut,
    CompositionOut,
    CustomersMonthOut,
    ItemQuantityOut,
    KpiCompletionOut,
    Metric,
    MonthlyMoneyOut,
    ParetoItemOut,
    ShareOut,
    TechnicianHoursOut,
)
from app.modules.catalog.models import Product, ProductServiceGroup, Service
from app.modules.customers.models import Customer
from app.modules.dispatch.models import Assignment, Task
from app.modules.identity.models import Employee
from app.modules.kpi_targets import sales_service
from app.modules.kpi_targets.service import _add_months, _label, _months_between, parse_month
from app.modules.orders.models import Order, OrderLine
from app.modules.revenue_report.service import VIETNAM

_TOP_ITEMS = 9  # Q166: 9 lát lớn nhất + "Khác"
_TOP_SELLING = 10  # Q170
_CUSTOMER_TYPES = {"COMPANY": "Tổ chức", "INDIVIDUAL": "Cá nhân"}
_NO_GROUP = ("NONE", "Chưa phân nhóm")


@dataclass(frozen=True)
class Period:
    start: date  # first day of the first month
    end: date  # first day of the last month

    @property
    def months(self) -> list[str]:
        return [_label(_add_months(self.start, n)) for n in range(_months_between(self.start, self.end) + 1)]

    @property
    def utc_from(self) -> datetime:
        return datetime.combine(self.start, datetime.min.time(), tzinfo=VIETNAM)

    @property
    def utc_to(self) -> datetime:
        return datetime.combine(_add_months(self.end, 1), datetime.min.time(), tzinfo=VIETNAM)

    def labels(self) -> tuple[str, str]:
        return _label(self.start), _label(self.end)


@dataclass(frozen=True)
class _Line:
    month: str
    group: tuple[str, str]
    customer_type: str
    item: tuple[str, str]  # (key, label)
    catalog: bool
    unit: str
    quantity: Decimal
    revenue: int
    profit: int


def resolve_period(from_: str | None, to: str | None, now: datetime) -> Period:
    end = parse_month(to) if to is not None else now.astimezone(VIETNAM).date().replace(day=1)
    start = parse_month(from_) if from_ is not None else _add_months(end, -(12 - 1))
    if start > end:
        raise AppError(422, "INVALID_RANGE", "Tháng bắt đầu phải trước hoặc bằng tháng kết thúc.")
    if _months_between(start, end) + 1 > domain.MAX_MONTHS:
        raise AppError(422, "RANGE_TOO_LONG", f"Chỉ xem tối đa {domain.MAX_MONTHS} tháng.")
    return Period(start, end)


def _vn_month(moment: datetime) -> str:
    return moment.astimezone(VIETNAM).strftime("%Y-%m")


def _lines(session: Session, period: Period) -> list[_Line]:
    stmt = (
        select(
            Order.completed_at,
            Order.division_id,
            ProductServiceGroup.name.label("group_name"),
            Customer.type.label("customer_type"),
            OrderLine.product_id,
            OrderLine.service_id,
            OrderLine.name_snapshot,
            OrderLine.unit_snapshot,
            OrderLine.quantity,
            OrderLine.unit_price,
            OrderLine.line_total,
            OrderLine.cost_price_snapshot,
            func.coalesce(Product.name, Service.name).label("catalog_name"),
            func.coalesce(Product.unit, Service.unit).label("catalog_unit"),
        )
        .join(Order, Order.id == OrderLine.order_id)
        .outerjoin(ProductServiceGroup, ProductServiceGroup.id == Order.division_id)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .outerjoin(Product, Product.id == OrderLine.product_id)
        .outerjoin(Service, Service.id == OrderLine.service_id)
        .where(
            Order.status == "COMPLETED",
            Order.completed_at >= period.utc_from,
            Order.completed_at < period.utc_to,
        )
    )
    lines: list[_Line] = []
    for row in session.execute(stmt):
        catalog_id = row.product_id or row.service_id
        lines.append(
            _Line(
                month=_vn_month(row.completed_at),
                group=(str(row.division_id), row.group_name) if row.division_id else _NO_GROUP,
                customer_type="COMPANY" if row.customer_type == "COMPANY" else "INDIVIDUAL",  # Q167
                item=(str(catalog_id), row.catalog_name)
                if catalog_id
                else (f"CUSTOM:{row.name_snapshot}", row.name_snapshot),
                catalog=catalog_id is not None,
                unit=row.catalog_unit or row.unit_snapshot,
                quantity=row.quantity,
                revenue=row.line_total,
                profit=domain.line_profit(
                    line_total=row.line_total,
                    cost_price_snapshot=row.cost_price_snapshot,
                    unit_price=row.unit_price,
                    quantity=row.quantity,
                ),
            )
        )
    return lines


def _shares(lines: list[_Line], key: str) -> list[ShareOut]:
    totals: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for line in lines:
        bucket = getattr(line, key)
        if key == "customer_type":
            bucket = (bucket, _CUSTOMER_TYPES[bucket])
        totals[bucket][0] += line.revenue
        totals[bucket][1] += line.profit
    shares = [ShareOut(key=k, label=label, revenue=r, profit=p) for (k, label), (r, p) in totals.items()]
    return sorted(shares, key=lambda s: (-s.revenue, s.label))


def _top_items(shares: list[ShareOut]) -> list[ShareOut]:
    if len(shares) <= _TOP_ITEMS + 1:
        return shares
    rest = shares[_TOP_ITEMS:]
    other = ShareOut(
        key="OTHER", label="Khác", revenue=sum(s.revenue for s in rest), profit=sum(s.profit for s in rest)
    )
    return [*shares[:_TOP_ITEMS], other]


def _customers_monthly(session: Session, period: Period) -> list[CustomersMonthOut]:
    sent = (
        Order.customer_id.is_not(None),
        Order.submitted_at.is_not(None),
        Order.status.not_in(("DRAFT", "CANCELLED")),
    )
    first_sent = func.min(Order.submitted_at).label("first_sent")
    first_month: dict[uuid.UUID, str] = {
        row.customer_id: _vn_month(row.first_sent)
        for row in session.execute(
            select(Order.customer_id, first_sent).where(*sent).group_by(Order.customer_id)
        )
    }
    in_period = session.execute(
        select(Order.customer_id, Order.submitted_at).where(
            *sent, Order.submitted_at >= period.utc_from, Order.submitted_at < period.utc_to
        )
    )
    customers: dict[str, set[uuid.UUID]] = defaultdict(set)
    for row in in_period:
        customers[_vn_month(row.submitted_at)].add(row.customer_id)
    result: list[CustomersMonthOut] = []
    for month in period.months:
        new = len([c for c in customers[month] if first_month[c] == month])
        result.append(
            CustomersMonthOut(month=month, new_count=new, returning_count=len(customers[month]) - new)
        )
    return result


def get_results(session: Session, period: Period) -> BusinessResultsOut:
    lines = _lines(session, period)
    monthly = {m: [0, 0] for m in period.months}
    for line in lines:
        monthly[line.month][0] += line.revenue
        monthly[line.month][1] += line.profit
    start, end = period.labels()
    return BusinessResultsOut(
        from_=start,
        to=end,
        monthly=[MonthlyMoneyOut(month=m, revenue=r, profit=p) for m, (r, p) in monthly.items()],
        composition=CompositionOut(
            by_group=_shares(lines, "group"),
            by_item=_top_items(_shares(lines, "item")),
            by_customer_type=_shares(lines, "customer_type"),
        ),
        customers_monthly=_customers_monthly(session, period),
    )


def _active_catalog(session: Session) -> list[tuple[str, str, str]]:
    products = session.execute(select(Product.id, Product.name, Product.unit).where(Product.is_active)).all()
    services = session.execute(select(Service.id, Service.name, Service.unit).where(Service.is_active)).all()
    return [(str(r.id), r.name, r.unit) for r in (*products, *services)]


def get_sales(session: Session, period: Period, metric: Metric) -> BusinessSalesOut:
    lines = _lines(session, period)
    shares = _shares(lines, "item")
    pareto = domain.pareto([(s.key, s.label, s.revenue if metric == "revenue" else s.profit) for s in shares])

    sold: dict[str, ItemQuantityOut] = {}
    for line in lines:
        if not line.catalog:
            continue  # Q170: bán chạy/bán chậm chỉ hàng danh mục
        key, label = line.item
        entry = sold.setdefault(
            key, ItemQuantityOut(key=key, label=label, unit=line.unit, quantity=0, revenue=0)
        )
        entry.quantity += float(line.quantity)
        entry.revenue += line.revenue
    top = sorted(sold.values(), key=lambda i: (-i.quantity, i.label.casefold()))[:_TOP_SELLING]
    slow_pool = [
        sold.get(key) or ItemQuantityOut(key=key, label=name, unit=unit, quantity=0, revenue=0)
        for key, name, unit in _active_catalog(session)
    ]
    slow = sorted(slow_pool, key=lambda i: (i.quantity, i.label.casefold()))[:_TOP_SELLING]

    start, end = period.labels()
    return BusinessSalesOut(
        from_=start,
        to=end,
        metric=metric,
        pareto=[ParetoItemOut.model_validate(row) for row in pareto],
        top_selling=top,
        slow_selling=slow,
    )


def get_staff(session: Session, period: Period) -> BusinessStaffOut:
    rows = session.execute(
        select(
            Employee.id,
            Employee.code,
            Employee.full_name,
            func.sum(Task.estimated_hours).label("hours"),
            func.count(Assignment.id).label("tasks"),
        )
        .join(Task, Task.id == Assignment.task_id)
        .join(Employee, Employee.id == Assignment.employee_id)
        .where(
            Assignment.created_at >= period.utc_from,
            Assignment.created_at < period.utc_to,
            Assignment.status.not_in(("REJECTED", "REMOVED")),  # Q171
        )
        .group_by(Employee.id, Employee.code, Employee.full_name)
        .order_by(func.sum(Task.estimated_hours).desc(), Employee.code)
    ).all()
    kpi_rows = sales_service.get_report(session, period.end).rows
    kpi_rows.sort(key=lambda r: (r.achievement_pct is None, -(r.achievement_pct or 0)))  # Q172: tháng cuối kỳ

    start, end = period.labels()
    return BusinessStaffOut(
        from_=start,
        to=end,
        hours_by_technician=[
            TechnicianHoursOut(
                employee_id=r.id,
                employee_code=r.code,
                employee_name=r.full_name,
                assigned_hours=float(r.hours),
                task_count=r.tasks,
            )
            for r in rows
        ],
        kpi_completion=KpiCompletionOut(month=end, rows=kpi_rows),
    )
