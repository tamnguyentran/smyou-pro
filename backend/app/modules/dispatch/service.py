"""Task/assignment use cases (M4-01a). Callers own the transaction; these never commit."""

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.core.errors import AppError
from app.core.spec_loader import Specs, TaskCommand, Transition
from app.modules.audit import service as audit
from app.modules.dispatch import domain
from app.modules.dispatch.models import Assignment, Task
from app.modules.dispatch.schemas import (
    EmployeeWorkloadItem,
    EmployeeWorkloadOut,
    TaskAddAssignee,
    TaskAssigneeOut,
    TaskAssigneeRemove,
    TaskBoardItem,
    TaskBoardOut,
    TaskCancel,
    TaskCreate,
    TaskDetail,
    TaskListOut,
    TaskSummary,
    TaskSummaryAssigneeOut,
    TaskUpdate,
)
from app.modules.identity.models import Employee, EmployeeRole
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order
from app.modules.workflow.guards import GUARDS

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")


def _vn_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=VIETNAM)


# "active" here follows spec/state_machines.yaml#task.derived_status's notion: every assignment
# status except REJECTED/REMOVED counts (same tuple as domain._INACTIVE_ASSIGNMENT_STATUSES, kept
# local since that name is private to the domain module).
_INACTIVE_ASSIGNMENT_STATUSES = ("REJECTED", "REMOVED")

_GUARD_MESSAGES = {
    "order_in_dispatchable_state": "Đơn không ở trạng thái có thể điều phối đầu việc.",
    "at_least_one_assignee": "Cần giao việc cho ít nhất 1 kỹ thuật viên.",
    "assignees_are_active_technicians": "Người được giao phải là kỹ thuật viên đang hoạt động.",
    "estimated_hours_positive": "Số giờ ước lượng phải lớn hơn 0, tối đa 200 và là bội số của 0.25.",
    "due_at_not_in_past": "Hạn hoàn thành không được ở quá khứ.",
    "not_already_active_assignee": "Người này đã được giao đầu việc này.",
    "reason_present": "Vui lòng nhập lý do (ít nhất 5 ký tự).",
}


def _valid_technician_count(session: Session, assignee_ids: list[uuid.UUID]) -> int:
    if not assignee_ids:
        return 0
    stmt = (
        select(func.count())
        .select_from(Employee)
        .join(EmployeeRole, EmployeeRole.employee_id == Employee.id)
        .where(
            Employee.id.in_(assignee_ids),
            Employee.is_active.is_(True),
            EmployeeRole.role == "TECHNICIAN",
        )
    )
    return session.scalar(stmt) or 0


def _check_guards(
    guard_names: list[str],
    *,
    order_status: str,
    assignee_count: int | None = None,
    valid_technician_count: int | None = None,
    estimated_hours: Decimal | None = None,
    due_at: datetime | None = None,
    now: datetime | None = None,
    reason: str | None = None,
    already_active: bool | None = None,
) -> None:
    """Shared by every task command (`create`/`update`/`add_assignee`/`cancel`) and the
    `assignment.remove` transition — each only ever passes the subset of guard names its own
    `spec/state_machines.yaml` entry declares, same single-dispatcher shape as
    `orders/service.py:_check_guards`."""
    for name in guard_names:
        if name == "order_in_dispatchable_state":
            ok = GUARDS[name](order_status)
        elif name == "at_least_one_assignee":
            ok = GUARDS[name](assignee_count)
        elif name == "assignees_are_active_technicians":
            ok = GUARDS[name](valid_technician_count, assignee_count)
        elif name == "estimated_hours_positive":
            ok = GUARDS[name](estimated_hours)
        elif name == "due_at_not_in_past":
            ok = GUARDS[name](due_at, now)
        elif name == "reason_present":
            ok = GUARDS[name](reason)
        elif name == "not_already_active_assignee":
            ok = GUARDS[name](already_active)
        else:
            raise AssertionError(f"task/assignment command doesn't use guard {name!r}")
        if not ok:
            raise AppError(409, "GUARD_FAILED", _GUARD_MESSAGES[name], extra={"guard": name})


def _check_task_status_allowed(task: Task, command: TaskCommand) -> None:
    if task.status not in command.allowed_task_status:
        raise AppError(409, "INVALID_TRANSITION", "Đầu việc đang ở trạng thái không cho phép thao tác này.")


def _check_assignment_transition(assignment: Assignment, transition: Transition) -> None:
    if assignment.status not in transition.from_:
        raise AppError(409, "INVALID_TRANSITION", "Phân công đang ở trạng thái không cho phép thao tác này.")


def _find_task(session: Session, order_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = session.scalars(select(Task).where(Task.id == task_id, Task.order_id == order_id)).one_or_none()
    if task is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy đầu việc.")
    return task


def _find_assignment(session: Session, task_id: uuid.UUID, assignment_id: uuid.UUID) -> Assignment:
    assignment = session.scalars(
        select(Assignment).where(Assignment.id == assignment_id, Assignment.task_id == task_id)
    ).one_or_none()
    if assignment is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy phân công.")
    return assignment


def _load_assignees(session: Session, task_id: uuid.UUID) -> list[TaskAssigneeOut]:
    rows = session.execute(
        select(Assignment.id, Assignment.employee_id, Employee.full_name, Assignment.status)
        .join(Employee, Employee.id == Assignment.employee_id)
        .where(Assignment.task_id == task_id, Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES))
        .order_by(Assignment.created_at.asc())
    ).all()
    return [
        TaskAssigneeOut(id=r.id, employee_id=r.employee_id, full_name=r.full_name, status=r.status)
        for r in rows
    ]


def _active_assignment_statuses(session: Session, task_id: uuid.UUID) -> list[str]:
    return list(
        session.scalars(
            select(Assignment.status).where(
                Assignment.task_id == task_id, Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES)
            )
        ).all()
    )


def _task_assigned_clause(actor: Actor) -> ColumnElement[bool]:
    """TECHNICIAN `assigned` scope for `task.read` (Q61) — same "no status filter" rule as
    `orders/service.py:_assigned_clause`: a rejected/removed assignment still counts."""
    return Task.id.in_(select(Assignment.task_id).where(Assignment.employee_id == actor.id))


TASK_RULES: ScopeRules = {"assigned": _task_assigned_clause}


def _task_detail(task: Task, order: Order, assignees: list[TaskAssigneeOut]) -> TaskDetail:
    return TaskDetail(
        id=task.id,
        code=task.code,
        order_id=task.order_id,
        title=task.title,
        description=task.description,
        origin=task.origin,
        created_in_revision=task.created_in_revision,
        status=task.status,
        estimated_hours=task.estimated_hours,
        due_at=task.due_at,
        priority=task.priority,
        cycle=task.cycle,
        order_line_ids=task.order_line_ids,
        assignees=assignees,
        created_by=task.created_by,
        created_at=task.created_at,
        order_status=order.status,
        order_version=order.version,
    )


def create_task(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: TaskCreate,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> TaskDetail:
    order = orders_service.lock_order(session, actor, order_id, body.version)
    command = domain.find_task_command(specs.state_machines.task, "create")
    existing_task_count = (
        session.scalar(select(func.count()).select_from(Task).where(Task.order_id == order.id)) or 0
    )
    valid_technician_count = _valid_technician_count(session, body.assignee_ids)
    _check_guards(
        command.guards,
        order_status=order.status,
        assignee_count=len(body.assignee_ids),
        valid_technician_count=valid_technician_count,
        estimated_hours=body.estimated_hours,
        due_at=body.due_at,
        now=now,
    )

    task = Task(
        order_id=order.id,
        code=domain.task_code(order.code, existing_task_count + 1),
        title=body.title,
        description=body.description,
        origin=domain.origin_for(order.status),
        created_in_revision=order.revision_no,
        status=domain.derive_task_status(["PENDING"] * len(body.assignee_ids), cancelled=False),
        estimated_hours=body.estimated_hours,
        due_at=body.due_at,
        priority=body.priority or order.priority,
        cycle=1,
        order_line_ids=body.order_line_ids,
        created_by=actor.id,
    )
    session.add(task)
    session.flush()

    assignments = [
        Assignment(task_id=task.id, employee_id=employee_id, cycle=1, status="PENDING", assigned_by=actor.id)
        for employee_id in body.assignee_ids
    ]
    session.add_all(assignments)
    session.flush()

    assignees = _load_assignees(session, task.id)

    # effects order (spec/state_machines.yaml#task.commands[create]): create_pending_assignments
    # (above), fire_order_start_dispatch_if_first_task (below, incl. its own `audit`), then this
    # task's own `audit` last — notify_assignees is skipped (Q60, same treatment as Q54).
    if existing_task_count == 0 and order.status == "PENDING_DISPATCH":
        order.status = "IN_PROGRESS"
        audit.record(
            session,
            actor_id=None,
            entity_type="ORDER",
            entity_id=order.id,
            action="start_dispatch",
            from_status="PENDING_DISPATCH",
            to_status="IN_PROGRESS",
            request_id=request_id,
        )

    order.version += 1  # Order is the aggregate root (Q62) — bumped once per command.
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="TASK",
        entity_id=task.id,
        action="create",
        to_status=task.status,
        request_id=request_id,
    )

    return _task_detail(task, order, assignees)


def update_task(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> TaskDetail:
    order = orders_service.lock_order(session, actor, order_id, body.version)
    task = _find_task(session, order.id, task_id)
    command = domain.find_task_command(specs.state_machines.task, "update")
    _check_task_status_allowed(task, command)
    _check_guards(command.guards, order_status=order.status)

    if body.title is not None:
        task.title = body.title
    if body.description is not None:
        task.description = body.description
    if body.estimated_hours is not None:
        task.estimated_hours = body.estimated_hours
    if body.due_at is not None:
        task.due_at = body.due_at
    if body.priority is not None:
        task.priority = body.priority

    order.version += 1  # Order is the aggregate root (Q62) — bumped even though only task columns change.
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="TASK",
        entity_id=task.id,
        action="update",
        to_status=task.status,
        request_id=request_id,
    )
    return _task_detail(task, order, _load_assignees(session, task.id))


def add_assignee(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskAddAssignee,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> TaskDetail:
    order = orders_service.lock_order(session, actor, order_id, body.version)
    task = _find_task(session, order.id, task_id)
    command = domain.find_task_command(specs.state_machines.task, "add_assignee")
    _check_task_status_allowed(task, command)

    valid_technician_count = _valid_technician_count(session, [body.employee_id])
    already_active = (
        session.scalar(
            select(func.count())
            .select_from(Assignment)
            .where(
                Assignment.task_id == task.id,
                Assignment.employee_id == body.employee_id,
                Assignment.cycle == task.cycle,
                Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES),
            )
        )
        or 0
    ) > 0
    _check_guards(
        command.guards,
        order_status=order.status,
        already_active=already_active,
        valid_technician_count=valid_technician_count,
        assignee_count=1,
    )

    assignment = Assignment(
        task_id=task.id,
        employee_id=body.employee_id,
        cycle=task.cycle,
        status="PENDING",
        assigned_by=actor.id,
    )
    session.add(assignment)
    session.flush()

    task.status = domain.derive_task_status(_active_assignment_statuses(session, task.id), cancelled=False)
    order.version += 1  # Order is the aggregate root (Q62).
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="TASK",
        entity_id=task.id,
        action="add_assignee",
        to_status=task.status,
        request_id=request_id,
    )
    return _task_detail(task, order, _load_assignees(session, task.id))


def remove_assignee(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    task_id: uuid.UUID,
    assignment_id: uuid.UUID,
    body: TaskAssigneeRemove,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> TaskDetail:
    order = orders_service.lock_order(session, actor, order_id, body.version)
    task = _find_task(session, order.id, task_id)
    assignment = _find_assignment(session, task.id, assignment_id)
    transition = domain.find_assignment_transition(specs.state_machines.assignment, "remove")
    _check_assignment_transition(assignment, transition)
    _check_guards(transition.guards, order_status=order.status)

    from_status = assignment.status
    assignment.status = "REMOVED"
    assignment.removed_at = now
    session.flush()

    task.status = domain.derive_task_status(
        _active_assignment_statuses(session, task.id), cancelled=task.cancelled_at is not None
    )
    order.version += 1  # Order is the aggregate root (Q62).
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ASSIGNMENT",
        entity_id=assignment.id,
        action="remove",
        from_status=from_status,
        to_status="REMOVED",
        request_id=request_id,
    )
    return _task_detail(task, order, _load_assignees(session, task.id))


def cancel_task(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskCancel,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> TaskDetail:
    order = orders_service.lock_order(session, actor, order_id, body.version)
    task = _find_task(session, order.id, task_id)
    command = domain.find_task_command(specs.state_machines.task, "cancel")
    _check_task_status_allowed(task, command)
    _check_guards(command.guards, order_status=order.status, reason=body.reason)

    from_status = task.status
    task.cancelled_at = now
    task.cancel_reason = body.reason

    # remove_open_assignments effect: every still-open assignment of this task is force-REMOVED,
    # with no audit event of its own (only the task's own `cancel` event below) — same treatment
    # AC-DSP-048 asserts.
    open_assignments = session.scalars(
        select(Assignment).where(
            Assignment.task_id == task.id,
            Assignment.status.in_(("PENDING", "ACCEPTED", "IN_PROGRESS")),
        )
    ).all()
    for open_assignment in open_assignments:
        open_assignment.status = "REMOVED"
        open_assignment.removed_at = now

    task.status = domain.derive_task_status([], cancelled=True)
    order.version += 1  # Order is the aggregate root (Q62).
    # fire_order_reevaluate is a no-op here: its only consumer (order.all_tasks_done) needs guards
    # has_active_tasks/all_active_tasks_done, still PENDING_GUARDS tagged M5-03 — no task can reach
    # DONE yet (assignment.complete is M5), so the order can never actually re-evaluate from this
    # command. Same treatment as the notify_assignees skip (Q60).
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="TASK",
        entity_id=task.id,
        action="cancel",
        from_status=from_status,
        to_status=task.status,
        request_id=request_id,
    )
    return _task_detail(task, order, _load_assignees(session, task.id))


def get_task(session: Session, actor: Actor, order_id: uuid.UUID, task_id: uuid.UUID) -> TaskDetail:
    task = get_in_scope_or_404(
        session, select(Task).where(Task.id == task_id, Task.order_id == order_id), actor, TASK_RULES
    )
    order = session.get(Order, task.order_id)
    if order is None:
        raise AssertionError("task.order_id FK guarantees an order row exists")
    return _task_detail(task, order, _load_assignees(session, task.id))


def list_order_tasks(session: Session, actor: Actor, order_id: uuid.UUID) -> TaskListOut:
    order = get_in_scope_or_404(
        session, select(Order).where(Order.id == order_id), actor, orders_service.RULES
    )
    tasks = session.scalars(
        select(Task).where(Task.order_id == order.id).order_by(Task.created_at.asc())
    ).all()

    by_task: dict[uuid.UUID, list[TaskSummaryAssigneeOut]] = defaultdict(list)
    task_ids = [t.id for t in tasks]
    if task_ids:
        rows = session.execute(
            select(Assignment.task_id, Employee.id, Employee.full_name)
            .join(Employee, Employee.id == Assignment.employee_id)
            .where(Assignment.task_id.in_(task_ids))
            .order_by(Assignment.created_at.asc())
        ).all()
        for task_id, employee_id, full_name in rows:
            by_task[task_id].append(TaskSummaryAssigneeOut(employee_id=employee_id, full_name=full_name))

    return TaskListOut(
        items=[
            TaskSummary(
                id=t.id,
                code=t.code,
                title=t.title,
                status=t.status,
                estimated_hours=t.estimated_hours,
                due_at=t.due_at,
                priority=t.priority,
                assignees=by_task.get(t.id, []),
            )
            for t in tasks
        ]
    )


def count_pending_dispatch(session: Session, actor: Actor) -> int:  # CounterProvider shape
    return (
        session.scalar(select(func.count()).select_from(Order).where(Order.status == "PENDING_DISPATCH")) or 0
    )


def list_tasks(
    session: Session,
    actor: Actor,
    *,
    status: str | None,
    priority: str | None,
    assignee_id: uuid.UUID | None,
    due_from: date | None,
    due_to: date | None,
) -> TaskBoardOut:
    """GET /api/v1/tasks (M4-03a) — every task across every order, for the dispatch board.

    Scope reuses TASK_RULES/_task_assigned_clause as-is (Q61): TECHNICIAN sees every task they
    ever had an assignment on, REJECTED/REMOVED included — same rule `get_task` already applies.
    `assignee_id` is a separate, narrower filter (active assignments only) that intersects with
    scope rather than replacing it, so it can never surface a task outside the caller's scope.
    """
    if due_from is not None and due_to is not None and due_from > due_to:
        message = "Từ ngày không được sau Đến ngày."
        raise AppError(
            422,
            "VALIDATION_ERROR",
            message,
            errors=[{"field": "due_from", "code": "invalid_range", "message": message}],
        )

    query = apply_scope(select(Task, Order.code).join(Order, Order.id == Task.order_id), actor, TASK_RULES)
    if status is not None:
        query = query.where(Task.status == status)
    if priority is not None:
        query = query.where(Task.priority == priority)
    if due_from is not None:
        query = query.where(Task.due_at >= _vn_day_start_utc(due_from))
    if due_to is not None:
        query = query.where(Task.due_at < _vn_day_start_utc(due_to) + timedelta(days=1))
    if assignee_id is not None:
        query = query.where(
            Task.id.in_(
                select(Assignment.task_id).where(
                    Assignment.employee_id == assignee_id,
                    Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES),
                )
            )
        )

    rows = session.execute(query.order_by(Task.due_at.asc())).all()
    order_code_by_task = {task.id: order_code for task, order_code in rows}

    by_task: dict[uuid.UUID, list[TaskSummaryAssigneeOut]] = defaultdict(list)
    task_ids = list(order_code_by_task)
    if task_ids:
        assignee_rows = session.execute(
            select(Assignment.task_id, Employee.id, Employee.full_name)
            .join(Employee, Employee.id == Assignment.employee_id)
            .where(Assignment.task_id.in_(task_ids), Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES))
            .order_by(Assignment.created_at.asc())
        ).all()
        for task_id, employee_id, full_name in assignee_rows:
            by_task[task_id].append(TaskSummaryAssigneeOut(employee_id=employee_id, full_name=full_name))

    return TaskBoardOut(
        items=[
            TaskBoardItem(
                id=task.id,
                code=task.code,
                order_id=task.order_id,
                order_code=order_code_by_task[task.id],
                title=task.title,
                status=task.status,
                priority=task.priority,
                estimated_hours=task.estimated_hours,
                due_at=task.due_at,
                assignees=by_task.get(task.id, []),
            )
            for task, _ in rows
        ]
    )


_OPEN_ASSIGNMENT_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS")


def list_workload(session: Session, actor: Actor) -> EmployeeWorkloadOut:
    """GET /api/v1/tasks/workload (M4-04) — per active technician: how many assignments of
    theirs are currently open, total estimated hours, nearest due date.

    "Open" here is narrower than `_INACTIVE_ASSIGNMENT_STATUSES`: DONE is also excluded
    (AC-DSP-095), since workload counts by the caller's own assignment status, not the
    task's `derived_status` — one person can be DONE on a task while another is still
    IN_PROGRESS on it.

    Scope (Q70): `task.read`'s `assigned` scope has no natural meaning for "which employees
    appear in this aggregate," so a TECHNICIAN gets exactly their own row, nothing else.
    """
    employees_query = (
        select(Employee.id, Employee.full_name)
        .where(Employee.roles.any(EmployeeRole.role == "TECHNICIAN"), Employee.is_active.is_(True))
        .order_by(Employee.full_name)
    )
    if "all" not in actor.scopes:
        employees_query = employees_query.where(Employee.id == actor.id)
    employees = session.execute(employees_query).all()

    employee_ids = [employee_id for employee_id, _ in employees]
    aggregates: dict[uuid.UUID, tuple[int, Decimal, datetime]] = {}
    if employee_ids:
        agg_rows = session.execute(
            select(
                Assignment.employee_id,
                func.count(Assignment.id),
                func.sum(Task.estimated_hours),
                func.min(Task.due_at),
            )
            .join(Task, Task.id == Assignment.task_id)
            .where(
                Assignment.employee_id.in_(employee_ids),
                Assignment.status.in_(_OPEN_ASSIGNMENT_STATUSES),
            )
            .group_by(Assignment.employee_id)
        ).all()
        aggregates = {employee_id: (count, hours, due) for employee_id, count, hours, due in agg_rows}

    items = [
        EmployeeWorkloadItem(
            employee_id=employee_id,
            full_name=full_name,
            open_task_count=aggregates.get(employee_id, (0, Decimal(0), None))[0],
            total_estimated_hours=aggregates.get(employee_id, (0, Decimal(0), None))[1],
            nearest_due_at=aggregates.get(employee_id, (0, Decimal(0), None))[2],
        )
        for employee_id, full_name in employees
    ]
    items.sort(key=lambda item: (item.total_estimated_hours, item.full_name))
    return EmployeeWorkloadOut(items=items)
