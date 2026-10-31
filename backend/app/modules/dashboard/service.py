"""`GET /api/v1/dashboard` (M7-02) — số liệu tuỳ theo (các) vai trò thật của người gọi.

Dùng trực tiếp `actor.roles` để quyết định section nào hiện, không dùng `actor.scopes`/
`effective_scopes`: `dashboard.read` map TECH_LEAD -> scope "all", nên 1 actor có cả SALE+TECH_LEAD
sẽ được `effective_scopes` gộp scope thành chỉ ("all",) — mất luôn "own" mà order_summary cần cho
vai trò SALE của chính actor đó (spec §4: thứ tự ưu tiên scope chỉ áp dụng khi actor CÓ vai trò
MANAGER, không áp dụng cho TECH_LEAD).
"""

import uuid
from datetime import date, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.modules.assignments.schemas import MyAssignmentOut
from app.modules.customers.models import Customer
from app.modules.dashboard.schemas import (
    CareSummaryOut,
    DashboardOut,
    DispatchSummaryOut,
    MyTaskSummaryOut,
    OrderStatusCounts,
    OrderSummaryOut,
    StaffStatusCounts,
    StaffSummaryOut,
    TaskStatusCounts,
    TaskSummaryOut,
    TopCustomerOut,
)
from app.modules.dispatch.models import OPEN_TASK_STATUSES_EXCLUDE, TASK_STATUSES, Assignment, Task
from app.modules.identity.models import Employee, EmployeeRole
from app.modules.orders.models import STATUSES as ORDER_STATUSES
from app.modules.orders.models import Order, OrderRevision

_DASHBOARD_ROLES_FOR_CUSTOMER_SECTIONS = {"MANAGER", "TECH_LEAD", "SALE", "CUSTOMER_CARE"}

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

# "Đang mở" cho today_tasks: không DONE (khác list_my_assignments của M5-01, vốn gồm DONE) —
# spec §2 today_tasks: "đang mở (không REJECTED/REMOVED/DONE)".
OPEN_ASSIGNMENT_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS")


def _task_summary(session: Session) -> TaskSummaryOut:
    query = select(Task.status, func.count()).group_by(Task.status)
    counts = dict.fromkeys(TASK_STATUSES, 0)
    for status, count in session.execute(query).all():
        counts[status] = count
    return TaskSummaryOut(counts_by_status=TaskStatusCounts(**counts))


def staff_where() -> dict[str, list[ColumnElement[bool]]]:
    """Cùng cách nhóm "Đang làm"/"Chưa thực hiện"/"Chờ giao việc" đã dùng ở `WorkloadList`
    (M4-04b): theo phân công đang mở (`OPEN_ASSIGNMENT_STATUSES`) của mỗi KTV đang hoạt động —
    nhất quán với trang "Lịch & tải việc". 3 nhóm lọc `Employee`, "Chưa tiếp nhận" lọc `Task`
    (đếm theo đầu việc, Q85). Dùng chung cho thẻ đếm và popup (M18-01b)."""
    technician = [Employee.roles.any(EmployeeRole.role == "TECHNICIAN"), Employee.is_active.is_(True)]
    has_in_progress = (
        select(Assignment.id)
        .where(Assignment.employee_id == Employee.id, Assignment.status == "IN_PROGRESS")
        .exists()
    )
    has_open = (
        select(Assignment.id)
        .where(Assignment.employee_id == Employee.id, Assignment.status.in_(OPEN_ASSIGNMENT_STATUSES))
        .exists()
    )
    return {
        "technicians": technician,
        "IN_PROGRESS": [*technician, has_in_progress],
        "NOT_STARTED": [*technician, has_open, ~has_in_progress],
        "IDLE": [*technician, ~has_open],
        "pending_acceptance": [Task.status == "PENDING_ACCEPTANCE"],
    }


def _staff_summary(session: Session) -> StaffSummaryOut:
    where = staff_where()
    return StaffSummaryOut(
        active_technician_count=_count(session, Employee, *where["technicians"]),
        counts_by_status=StaffStatusCounts(
            IN_PROGRESS=_count(session, Employee, *where["IN_PROGRESS"]),
            NOT_STARTED=_count(session, Employee, *where["NOT_STARTED"]),
            IDLE=_count(session, Employee, *where["IDLE"]),
        ),
        pending_acceptance_count=_count(session, Task, *where["pending_acceptance"]),
    )


def _vn_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=VIETNAM)


def order_scope(actor: Actor) -> Literal["own", "all"] | None:
    """Khối "Đơn theo trạng thái": MANAGER → "all", SALE → "own", vai trò khác không thấy khối."""
    if "MANAGER" in actor.roles:
        return "all"
    if "SALE" in actor.roles:
        return "own"
    return None


def sees_dispatch(actor: Actor) -> bool:
    """Khối "Điều phối" (+ đầu việc/nhân sự): TECH_LEAD hoặc MANAGER."""
    return bool(actor.roles & {"TECH_LEAD", "MANAGER"})


def order_scope_where(scope: Literal["own", "all"], actor: Actor) -> list[ColumnElement[bool]]:
    return [Order.created_by == actor.id] if scope == "own" else []


def task_overdue_where(now: datetime) -> list[ColumnElement[bool]]:
    return [Task.status.notin_(OPEN_TASK_STATUSES_EXCLUDE), Task.due_at < now]


def order_overdue_where(now: datetime) -> list[ColumnElement[bool]]:
    """Đơn chưa xong/huỷ có ≥1 đầu việc quá hạn — dùng chung cho thẻ đếm và popup (M18-01a)."""
    return [
        Order.status.notin_(("COMPLETED", "CANCELLED")),
        Order.id.in_(select(Task.order_id).where(*task_overdue_where(now))),
    ]


def _order_summary(
    session: Session, *, scope: Literal["own", "all"], actor: Actor, now: datetime
) -> OrderSummaryOut:
    query = select(Order.status, func.count()).where(*order_scope_where(scope, actor)).group_by(Order.status)
    counts = dict.fromkeys(ORDER_STATUSES, 0)
    for status, count in session.execute(query).all():
        counts[status] = count

    overdue_count = (
        session.scalar(
            select(func.count())
            .select_from(Order)
            .where(*order_overdue_where(now), *order_scope_where(scope, actor))
        )
        or 0
    )

    return OrderSummaryOut(
        scope=scope, counts_by_status=OrderStatusCounts(**counts), overdue_count=overdue_count
    )


def _count(
    session: Session, entity: type[Order] | type[Task] | type[Employee], *where: ColumnElement[bool]
) -> int:
    return session.scalar(select(func.count()).select_from(entity).where(*where)) or 0


def dispatch_where(now: datetime) -> dict[str, list[ColumnElement[bool]]]:
    """Điều kiện của 4 thẻ "Điều phối" — dùng chung cho thẻ đếm và popup (M18-01a): 2 thẻ đầu lọc
    `Order`, 2 thẻ sau lọc `Task`."""
    return {
        "pending_dispatch": [Order.status == "PENDING_DISPATCH"],
        "in_progress": [Order.status == "IN_PROGRESS"],
        "needs_assignee": [Task.status == "NEEDS_ASSIGNEE"],
        "overdue_tasks": task_overdue_where(now),
    }


def _dispatch_summary(session: Session, *, now: datetime) -> DispatchSummaryOut:
    where = dispatch_where(now)
    return DispatchSummaryOut(
        pending_dispatch_count=_count(session, Order, *where["pending_dispatch"]),
        in_progress_order_count=_count(session, Order, *where["in_progress"]),
        needs_assignee_count=_count(session, Task, *where["needs_assignee"]),
        overdue_task_count=_count(session, Task, *where["overdue_tasks"]),
    )


def _today_task_row_out(row: Any) -> MyAssignmentOut:
    assignment, task, order_id, order_code, order_version, customer_name, customer_phone, service_address = (
        row
    )
    return MyAssignmentOut(
        assignment_id=assignment.id,
        assignment_status=assignment.status,
        task_id=task.id,
        task_code=task.code,
        task_title=task.title,
        task_description=task.description,
        estimated_hours=task.estimated_hours,
        due_at=task.due_at,
        priority=task.priority,
        order_id=order_id,
        order_code=order_code,
        order_version=order_version,
        customer_name=customer_name,
        customer_phone=customer_phone,
        service_address=service_address,
        completion_note=assignment.completion_note,
        actual_hours=assignment.actual_hours,
    )


def _today_tasks(session: Session, actor: Actor, *, now: datetime) -> list[MyAssignmentOut]:
    today_vn = now.astimezone(VIETNAM).date()
    boundary = _vn_day_start_utc(today_vn + timedelta(days=1))
    rows = session.execute(
        select(
            Assignment,
            Task,
            Order.id,
            Order.code,
            Order.version,
            Order.customer_name,
            Order.customer_phone,
            Order.service_address,
        )
        .join(Task, Task.id == Assignment.task_id)
        .join(Order, Order.id == Task.order_id)
        .where(
            Assignment.employee_id == actor.id,
            Assignment.cycle == Task.cycle,
            Assignment.status.in_(OPEN_ASSIGNMENT_STATUSES),
            Task.due_at < boundary,
        )
        .order_by(Task.due_at.asc())
    ).all()
    return [_today_task_row_out(row) for row in rows]


def my_task_where(actor: Actor, *, now: datetime) -> dict[str, list[ColumnElement[bool]]]:
    """Khối "Việc của tôi" (TECHNICIAN): lọc `Task` qua `EXISTS` phân công của chính người gọi ở
    chu kỳ hiện tại — 1 dòng/đầu việc (mỗi KTV có tối đa 1 phân công hiệu lực/đầu việc/chu kỳ,
    `uq_assignments_task_employee_cycle_active`, nên đếm đầu việc = đếm phân công). Riêng
    `awaiting_confirmation` lọc `Order`. Dùng chung cho thẻ đếm và popup (M18-01b)."""
    today_vn = now.astimezone(VIETNAM).date()

    def mine(*extra: ColumnElement[bool]) -> ColumnElement[bool]:
        return (
            select(Assignment.id)
            .where(Assignment.task_id == Task.id, Assignment.employee_id == actor.id, *extra)
            .where(Assignment.cycle == Task.cycle)
            .exists()
        )

    return {
        "pending": [mine(Assignment.status == "PENDING")],
        "active": [mine(Assignment.status.in_(("ACCEPTED", "IN_PROGRESS")))],
        "not_started": [mine(Assignment.status == "ACCEPTED")],
        # "Đã xong" chỉ tính trong ngày (giờ VN) để không phình theo lịch sử — lịch sử thuộc trang KPI.
        "done_today": [
            mine(
                Assignment.status == "DONE",
                Assignment.done_at >= _vn_day_start_utc(today_vn),
                Assignment.done_at < _vn_day_start_utc(today_vn + timedelta(days=1)),
            )
        ],
        "overdue": [mine(Assignment.status.in_(("ACCEPTED", "IN_PROGRESS"))), Task.due_at < now],
        "awaiting_confirmation": [
            Order.status == "AWAITING_CONFIRMATION",
            Order.id.in_(
                select(Task.order_id)
                .join(Assignment, Assignment.task_id == Task.id)
                .where(Assignment.employee_id == actor.id, Assignment.cycle == Task.cycle)
            ),
        ],
    }


def _my_task_summary(session: Session, actor: Actor, *, now: datetime) -> MyTaskSummaryOut:
    """Tình trạng đầu việc của chính người gọi (TECHNICIAN) — cùng nhóm đã dùng ở "Việc của tôi"
    (`MyTasksPage` tab Chờ nhận/Đang làm/Đã xong)."""
    where = my_task_where(actor, now=now)
    return MyTaskSummaryOut(
        pending_count=_count(session, Task, *where["pending"]),
        active_count=_count(session, Task, *where["active"]),
        done_today_count=_count(session, Task, *where["done_today"]),
        not_started_count=_count(session, Task, *where["not_started"]),
        overdue_count=_count(session, Task, *where["overdue"]),
        awaiting_confirmation_count=_count(session, Order, *where["awaiting_confirmation"]),
    )


def _current_month_vn_bounds(now: datetime) -> tuple[datetime, datetime]:
    today_vn = now.astimezone(VIETNAM).date()
    month_start = today_vn.replace(day=1)
    return _vn_day_start_utc(month_start), _vn_day_start_utc(today_vn + timedelta(days=1))


def sees_customer_sections(actor: Actor) -> bool:
    """Khối "Top 10", "Phản hồi - đánh giá", "Chăm sóc khách hàng" (M15-04, M16-03)."""
    return bool(actor.roles & _DASHBOARD_ROLES_FOR_CUSTOMER_SECTIONS)


def completed_this_month_where(now: datetime) -> list[ColumnElement[bool]]:
    month_start, month_end = _current_month_vn_bounds(now)
    return [Order.status == "COMPLETED", Order.completed_at >= month_start, Order.completed_at < month_end]


def top_customer_where(now: datetime, customer_id: uuid.UUID) -> list[ColumnElement[bool]]:
    """M18-01c: đơn tạo nên 1 dòng Top 10 (`order_count`/`total_revenue`)."""
    return [*completed_this_month_where(now), Order.customer_id == customer_id]


def feedback_where(now: datetime, rating: int) -> list[ColumnElement[bool]]:
    return [*completed_this_month_where(now), Order.csat_rating == rating]


def care_where(now: datetime) -> dict[str, list[ColumnElement[bool]]]:
    """M16-03 (AC-DASH-060…062) — dùng chung cho số trên thẻ và popup M18-01c.
    `customers`/`revision_orders` lọc `Order`; `staff` lọc `Employee`."""
    month_start, month_end = _current_month_vn_bounds(now)
    recorded_this_month = [Order.csat_recorded_at >= month_start, Order.csat_recorded_at < month_end]
    return {
        "customers": recorded_this_month,
        "staff": [
            select(Order.id).where(Order.csat_recorded_by == Employee.id, *recorded_this_month).exists()
        ],
        "revision_orders": [
            select(OrderRevision.id)
            .where(
                OrderRevision.order_id == Order.id,
                OrderRevision.requested_at >= month_start,
                OrderRevision.requested_at < month_end,
            )
            .exists()
        ],
    }


def _top_customers(session: Session, *, now: datetime) -> list[TopCustomerOut]:
    """M15-04 (AC-DASH-054/055, Q94): company-wide — không áp `apply_scope`/scope riêng cho
    actor, khác mọi section khác của dashboard. Đơn không có `customer_id` (khách lẻ) bị loại
    vì không có khách hàng ổn định để nhóm theo (spec §8)."""
    rows = session.execute(
        select(
            Customer.id,
            Customer.code,
            Customer.name,
            func.count(Order.id),
            func.sum(Order.total),
        )
        .join(Customer, Customer.id == Order.customer_id)
        .where(*completed_this_month_where(now))
        .group_by(Customer.id, Customer.code, Customer.name)
        .order_by(func.sum(Order.total).desc())
        .limit(10)
    ).all()
    return [
        TopCustomerOut(
            customer_id=customer_id,
            customer_code=code,
            customer_name=name,
            order_count=order_count,
            total_revenue=total_revenue,
        )
        for customer_id, code, name, order_count, total_revenue in rows
    ]


def _feedback_summary(session: Session, *, now: datetime) -> dict[str, int]:
    """M15-04 (AC-DASH-056): cùng logic tháng hiện tại/`completed_at` của
    `orders.service.get_csat_summary` (M15-02a), nhưng company-wide — không gọi lại hàm đó vì
    nó áp `apply_scope` theo capability `customer_care.manage_feedback` của actor gọi, không
    đúng với actor bất kỳ có `dashboard.read` (spec §8: không trừ giá vốn, không scope)."""
    query = (
        select(Order.csat_rating, func.count())
        .where(*completed_this_month_where(now))
        .group_by(Order.csat_rating)
    )
    counts = {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0, "none": 0}
    for rating, count in session.execute(query).all():
        counts[str(rating) if rating is not None else "none"] = count
    return counts


def _care_summary(session: Session, *, now: datetime) -> CareSummaryOut:
    """M16-03 (AC-DASH-060): proxy cho "KH đã chăm sóc" — số đơn có `csat_recorded_at` trong
    ngày/tháng hiện tại (giờ VN), vì hệ thống chưa có log chăm sóc/gọi điện riêng (spec §8)."""
    today_vn = now.astimezone(VIETNAM).date()
    today_start = _vn_day_start_utc(today_vn)
    today_end = _vn_day_start_utc(today_vn + timedelta(days=1))
    month_count = _count(session, Order, *care_where(now)["customers"])
    today_count = session.scalar(
        select(func.count()).where(Order.csat_recorded_at >= today_start, Order.csat_recorded_at < today_end)
    )
    return CareSummaryOut(today=today_count or 0, month=month_count)


def _care_staff_count(session: Session, *, now: datetime) -> int:
    """M16-03 (AC-DASH-061): proxy cho "NV đã gọi điện CSKH" — số NV duy nhất
    (`csat_recorded_by`) đã ghi CSAT cho ít nhất 1 đơn trong tháng hiện tại (spec §8)."""
    return _count(session, Employee, *care_where(now)["staff"])


def _orders_needing_revision_count(session: Session, *, now: datetime) -> int:
    """M16-03 (AC-DASH-062): số đơn duy nhất có ít nhất 1 `order_revisions.requested_at`
    trong tháng hiện tại (đếm theo đơn, không theo số lần yêu cầu sửa — spec §8)."""
    return _count(session, Order, *care_where(now)["revision_orders"])


def get_dashboard(session: Session, actor: Actor, *, now: datetime) -> DashboardOut:
    roles = actor.roles
    out = DashboardOut()
    if (scope := order_scope(actor)) is not None:
        out.order_summary = _order_summary(session, scope=scope, actor=actor, now=now)
    if sees_dispatch(actor):
        out.dispatch_summary = _dispatch_summary(session, now=now)
        out.task_summary = _task_summary(session)
        out.staff_summary = _staff_summary(session)
    if "TECHNICIAN" in roles:
        out.my_task_summary = _my_task_summary(session, actor, now=now)
        out.today_tasks = _today_tasks(session, actor, now=now)
    if sees_customer_sections(actor):
        out.top_customers = _top_customers(session, now=now)
        out.feedback_summary = _feedback_summary(session, now=now)
        out.care_summary = _care_summary(session, now=now)
        out.care_staff_count = _care_staff_count(session, now=now)
        out.orders_needing_revision_count = _orders_needing_revision_count(session, now=now)
    return out
