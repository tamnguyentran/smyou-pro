"""`GET /api/v1/dashboard` (M7-02) — số liệu tuỳ theo (các) vai trò thật của người gọi.

Dùng trực tiếp `actor.roles` để quyết định section nào hiện, không dùng `actor.scopes`/
`effective_scopes`: `dashboard.read` map TECH_LEAD -> scope "all", nên 1 actor có cả SALE+TECH_LEAD
sẽ được `effective_scopes` gộp scope thành chỉ ("all",) — mất luôn "own" mà order_summary cần cho
vai trò SALE của chính actor đó (spec §4: thứ tự ưu tiên scope chỉ áp dụng khi actor CÓ vai trò
MANAGER, không áp dụng cho TECH_LEAD).
"""

from datetime import date, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.modules.assignments.schemas import MyAssignmentOut
from app.modules.dashboard.schemas import (
    DashboardOut,
    DispatchSummaryOut,
    MyTaskSummaryOut,
    OrderStatusCounts,
    OrderSummaryOut,
    StaffStatusCounts,
    StaffSummaryOut,
    TaskStatusCounts,
    TaskSummaryOut,
)
from app.modules.dispatch.models import TASK_STATUSES, Assignment, Task
from app.modules.identity.models import Employee, EmployeeRole
from app.modules.orders.models import STATUSES as ORDER_STATUSES
from app.modules.orders.models import Order

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

# "Đang mở" cho today_tasks: không DONE (khác list_my_assignments của M5-01, vốn gồm DONE) —
# spec §2 today_tasks: "đang mở (không REJECTED/REMOVED/DONE)".
_OPEN_ASSIGNMENT_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS")
# "Đang mở" cho overdue_task_count: task chưa xong/huỷ.
_OPEN_TASK_STATUSES_EXCLUDE = ("DONE", "CANCELLED")


def _task_summary(session: Session) -> TaskSummaryOut:
    query = select(Task.status, func.count()).group_by(Task.status)
    counts = dict.fromkeys(TASK_STATUSES, 0)
    for status, count in session.execute(query).all():
        counts[status] = count
    return TaskSummaryOut(counts_by_status=TaskStatusCounts(**counts))


def _staff_summary(session: Session) -> StaffSummaryOut:
    """Cùng cách nhóm "Đang làm"/"Chưa thực hiện"/"Chưa có đầu việc" đã dùng ở `WorkloadList`
    (M4-04b): đếm theo phân công đang mở (`_OPEN_ASSIGNMENT_STATUSES`) của mỗi KTV đang hoạt
    động — nhất quán với trang "Lịch & tải việc", không suy ra tiêu chí khác."""
    technician_ids = (
        session.execute(
            select(Employee.id).where(
                Employee.roles.any(EmployeeRole.role == "TECHNICIAN"), Employee.is_active.is_(True)
            )
        )
        .scalars()
        .all()
    )

    open_counts: dict[Any, int] = {}
    in_progress_counts: dict[Any, int] = {}
    if technician_ids:
        for employee_id, count in session.execute(
            select(Assignment.employee_id, func.count())
            .where(
                Assignment.employee_id.in_(technician_ids), Assignment.status.in_(_OPEN_ASSIGNMENT_STATUSES)
            )
            .group_by(Assignment.employee_id)
        ).all():
            open_counts[employee_id] = count
        for employee_id, count in session.execute(
            select(Assignment.employee_id, func.count())
            .where(Assignment.employee_id.in_(technician_ids), Assignment.status == "IN_PROGRESS")
            .group_by(Assignment.employee_id)
        ).all():
            in_progress_counts[employee_id] = count

    in_progress = not_started = idle = 0
    for employee_id in technician_ids:
        if in_progress_counts.get(employee_id, 0) > 0:
            in_progress += 1
        elif open_counts.get(employee_id, 0) > 0:
            not_started += 1
        else:
            idle += 1

    return StaffSummaryOut(
        active_technician_count=len(technician_ids),
        counts_by_status=StaffStatusCounts(IN_PROGRESS=in_progress, NOT_STARTED=not_started, IDLE=idle),
    )


def _vn_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=VIETNAM)


def _order_summary(session: Session, *, scope: Literal["own", "all"], actor: Actor) -> OrderSummaryOut:
    query = select(Order.status, func.count()).group_by(Order.status)
    if scope == "own":
        query = query.where(Order.created_by == actor.id)
    counts = dict.fromkeys(ORDER_STATUSES, 0)
    for status, count in session.execute(query).all():
        counts[status] = count
    return OrderSummaryOut(scope=scope, counts_by_status=OrderStatusCounts(**counts))


def _dispatch_summary(session: Session, *, now: datetime) -> DispatchSummaryOut:
    pending_dispatch_count = (
        session.scalar(select(func.count()).select_from(Order).where(Order.status == "PENDING_DISPATCH")) or 0
    )
    needs_assignee_count = (
        session.scalar(select(func.count()).select_from(Task).where(Task.status == "NEEDS_ASSIGNEE")) or 0
    )
    overdue_task_count = (
        session.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.status.notin_(_OPEN_TASK_STATUSES_EXCLUDE), Task.due_at < now)
        )
        or 0
    )
    return DispatchSummaryOut(
        pending_dispatch_count=pending_dispatch_count,
        needs_assignee_count=needs_assignee_count,
        overdue_task_count=overdue_task_count,
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
            Assignment.status.in_(_OPEN_ASSIGNMENT_STATUSES),
            Task.due_at < boundary,
        )
        .order_by(Task.due_at.asc())
    ).all()
    return [_today_task_row_out(row) for row in rows]


def _my_task_summary(session: Session, actor: Actor, *, now: datetime) -> MyTaskSummaryOut:
    """Tình trạng đầu việc của chính người gọi (TECHNICIAN) — cùng 3 nhóm đã dùng ở "Việc của
    tôi" (`MyTasksPage` tab Chờ nhận/Đang làm/Đã xong), "Đã xong" chỉ tính trong ngày (giờ VN)
    để không phình to vô hạn theo lịch sử — số liệu lịch sử đầy đủ thuộc trang KPI."""
    today_vn = now.astimezone(VIETNAM).date()
    day_start = _vn_day_start_utc(today_vn)
    day_end = _vn_day_start_utc(today_vn + timedelta(days=1))

    open_counts: dict[str, int] = {}
    for status, count in session.execute(
        select(Assignment.status, func.count())
        .join(Task, Task.id == Assignment.task_id)
        .where(
            Assignment.employee_id == actor.id,
            Assignment.cycle == Task.cycle,
            Assignment.status.in_(_OPEN_ASSIGNMENT_STATUSES),
        )
        .group_by(Assignment.status)
    ).all():
        open_counts[status] = count

    done_today_count = (
        session.scalar(
            select(func.count())
            .select_from(Assignment)
            .join(Task, Task.id == Assignment.task_id)
            .where(
                Assignment.employee_id == actor.id,
                Assignment.cycle == Task.cycle,
                Assignment.status == "DONE",
                Assignment.done_at >= day_start,
                Assignment.done_at < day_end,
            )
        )
        or 0
    )

    return MyTaskSummaryOut(
        pending_count=open_counts.get("PENDING", 0),
        active_count=open_counts.get("ACCEPTED", 0) + open_counts.get("IN_PROGRESS", 0),
        done_today_count=done_today_count,
    )


def get_dashboard(session: Session, actor: Actor, *, now: datetime) -> DashboardOut:
    roles = actor.roles
    out = DashboardOut()
    if "SALE" in roles or "MANAGER" in roles:
        scope: Literal["own", "all"] = "all" if "MANAGER" in roles else "own"
        out.order_summary = _order_summary(session, scope=scope, actor=actor)
    if "TECH_LEAD" in roles or "MANAGER" in roles:
        out.dispatch_summary = _dispatch_summary(session, now=now)
        out.task_summary = _task_summary(session)
        out.staff_summary = _staff_summary(session)
    if "TECHNICIAN" in roles:
        out.my_task_summary = _my_task_summary(session, actor, now=now)
        out.today_tasks = _today_tasks(session, actor, now=now)
    return out
