"""GET /api/v1/assignments/me (M5-01) — the caller's own active-cycle assignments."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.modules.assignments.schemas import MyAssignmentOut, MyAssignmentsOut
from app.modules.dispatch.models import Assignment, Task
from app.modules.orders.models import Order

_ACTIVE_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS", "DONE")


def list_my_assignments(session: Session, actor: Actor) -> MyAssignmentsOut:
    """No scope/apply_scope needed: always filtered by `actor.id`, no query param can widen it
    (AC-ASG-003 — no IDOR vector). Only the task's current cycle (AC-ASG-004: a `reopen` freezes
    the previous cycle's assignments, which must not resurface here)."""
    rows = session.execute(
        select(
            Assignment,
            Task,
            Order.id,
            Order.code,
            Order.customer_name,
            Order.customer_phone,
            Order.service_address,
        )
        .join(Task, Task.id == Assignment.task_id)
        .join(Order, Order.id == Task.order_id)
        .where(
            Assignment.employee_id == actor.id,
            Assignment.status.in_(_ACTIVE_STATUSES),
            Assignment.cycle == Task.cycle,
        )
        .order_by(Task.due_at.asc())
    ).all()
    return MyAssignmentsOut(
        items=[
            MyAssignmentOut(
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
                customer_name=customer_name,
                customer_phone=customer_phone,
                service_address=service_address,
            )
            for assignment, task, order_id, order_code, customer_name, customer_phone, service_address in rows
        ]
    )


def count_pending_assignments(session: Session, actor: Actor) -> int:  # CounterProvider shape
    return (
        session.scalar(
            select(func.count())
            .select_from(Assignment)
            .where(Assignment.employee_id == actor.id, Assignment.status == "PENDING")
        )
        or 0
    )
