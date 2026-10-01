"""Task/assignment use cases (M4-01a). Callers own the transaction; these never commit."""

import uuid
from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor, get_in_scope_or_404
from app.core.errors import AppError
from app.core.spec_loader import Specs
from app.modules.audit import service as audit
from app.modules.dispatch import domain
from app.modules.dispatch.models import Assignment, Task
from app.modules.dispatch.schemas import (
    TaskAssigneeOut,
    TaskCreate,
    TaskDetail,
    TaskListOut,
    TaskSummary,
    TaskSummaryAssigneeOut,
)
from app.modules.identity.models import Employee, EmployeeRole
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order
from app.modules.workflow.guards import GUARDS

_GUARD_MESSAGES = {
    "order_in_dispatchable_state": "Đơn không ở trạng thái có thể điều phối đầu việc.",
    "at_least_one_assignee": "Cần giao việc cho ít nhất 1 kỹ thuật viên.",
    "assignees_are_active_technicians": "Người được giao phải là kỹ thuật viên đang hoạt động.",
    "estimated_hours_positive": "Số giờ ước lượng phải lớn hơn 0, tối đa 200 và là bội số của 0.25.",
    "due_at_not_in_past": "Hạn hoàn thành không được ở quá khứ.",
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


def _check_task_guards(
    guard_names: list[str],
    *,
    order_status: str,
    assignee_count: int,
    valid_technician_count: int,
    estimated_hours: Decimal,
    due_at: datetime,
    now: datetime,
) -> None:
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
        else:
            raise AssertionError(f"task create doesn't use guard {name!r}")
        if not ok:
            raise AppError(409, "GUARD_FAILED", _GUARD_MESSAGES[name], extra={"guard": name})


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
    _check_task_guards(
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

    names: dict[uuid.UUID, str] = dict(
        session.execute(select(Employee.id, Employee.full_name).where(Employee.id.in_(body.assignee_ids)))
        .tuples()
        .all()
    )
    assignees = [
        TaskAssigneeOut(employee_id=a.employee_id, full_name=names.get(a.employee_id, ""), status=a.status)
        for a in assignments
    ]

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
