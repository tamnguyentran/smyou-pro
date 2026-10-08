"""GET /api/v1/assignments/me (M5-01) + accept/reject (M5-02) — the caller's own assignments.

Accept/reject authorize via direct `Assignment.employee_id == actor.id` ownership (not
`apply_scope`): the `assignment.respond` capability's scope is `self`, which has no entry in
`orders_service.RULES` (that RULES dict is keyed for `order.read`'s `own`/`assigned` scopes), so
reusing `orders_service.lock_order` here would silently 404 every caller. The order row is instead
locked directly by id once ownership of the assignment is established.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.core.errors import AppError
from app.core.spec_loader import Specs, Transition
from app.modules.assignments.schemas import (
    AssignmentAccept,
    AssignmentComplete,
    AssignmentReject,
    AssignmentStart,
    MyAssignmentOut,
    MyAssignmentsOut,
)
from app.modules.audit import service as audit
from app.modules.dispatch import domain
from app.modules.dispatch.models import Assignment, Task
from app.modules.orders.models import Order
from app.modules.workflow.guards import GUARDS

_ACTIVE_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS", "DONE")
# Same notion of "active" as dispatch/service.py's _INACTIVE_ASSIGNMENT_STATUSES/
# dispatch/domain.py's _INACTIVE_ASSIGNMENT_STATUSES — duplicated locally since both are private.
_INACTIVE_ASSIGNMENT_STATUSES = ("REJECTED", "REMOVED")

_GUARD_MESSAGES = {
    "order_in_dispatchable_state": "Đơn không ở trạng thái có thể điều phối đầu việc.",
    "task_not_cancelled": "Đầu việc đã bị huỷ.",
    "reject_reason_code_present": "Vui lòng chọn lý do từ chối.",
    "reject_reason_text_present": "Vui lòng nhập lý do (ít nhất 5 ký tự).",
}


def _row_out(row: Any) -> MyAssignmentOut:
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


def _select_mine(actor: Actor) -> Any:
    return (
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
        .where(Assignment.employee_id == actor.id)
    )


def list_my_assignments(session: Session, actor: Actor) -> MyAssignmentsOut:
    """No scope/apply_scope needed: always filtered by `actor.id`, no query param can widen it
    (AC-ASG-003 — no IDOR vector). Only the task's current cycle (AC-ASG-004: a `reopen` freezes
    the previous cycle's assignments, which must not resurface here)."""
    rows = session.execute(
        _select_mine(actor)
        .where(Assignment.status.in_(_ACTIVE_STATUSES), Assignment.cycle == Task.cycle)
        .order_by(Task.due_at.asc())
    ).all()
    return MyAssignmentsOut(items=[_row_out(row) for row in rows])


def count_pending_assignments(session: Session, actor: Actor) -> int:  # CounterProvider shape
    return (
        session.scalar(
            select(func.count())
            .select_from(Assignment)
            .where(Assignment.employee_id == actor.id, Assignment.status == "PENDING")
        )
        or 0
    )


def _find_own_assignment(session: Session, actor: Actor, assignment_id: uuid.UUID) -> tuple[Assignment, Task]:
    row = session.execute(
        select(Assignment, Task)
        .join(Task, Task.id == Assignment.task_id)
        .where(Assignment.id == assignment_id, Assignment.employee_id == actor.id)
    ).one_or_none()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy phân công.")
    assignment, task = row
    return assignment, task


def _lock_order(session: Session, order_id: uuid.UUID, version: int) -> Order:
    order = session.scalars(select(Order).where(Order.id == order_id).with_for_update()).one()
    if order.version != version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    return order


def _check_assignment_transition(assignment: Assignment, transition: Transition) -> None:
    if assignment.status not in transition.from_:
        raise AppError(409, "INVALID_TRANSITION", "Phân công đang ở trạng thái không cho phép thao tác này.")


def _check_guards(
    guard_names: list[str],
    *,
    order_status: str,
    cancelled_at: datetime | None,
    reason_code: str | None = None,
    reason_text: str | None = None,
) -> None:
    for name in guard_names:
        if name == "order_in_dispatchable_state":
            ok = GUARDS[name](order_status)
        elif name == "task_not_cancelled":
            ok = GUARDS[name](cancelled_at)
        elif name == "reject_reason_code_present":
            # Pydantic's Literal already rejects any other value with a 422 (AC-ASG-029) before
            # the service runs, so this guard can never actually fail here — checked anyway to
            # mirror spec/state_machines.yaml#assignment.transitions[reject].guards exactly.
            ok = GUARDS[name](reason_code)
        elif name == "reject_reason_text_present":
            ok = GUARDS[name](reason_text)
        else:
            raise AssertionError(f"assignment.respond command doesn't use guard {name!r}")
        if not ok:
            raise AppError(409, "GUARD_FAILED", _GUARD_MESSAGES[name], extra={"guard": name})


def _active_assignment_statuses(session: Session, task_id: uuid.UUID, cycle: int) -> list[str]:
    """Only the task's CURRENT cycle (spec/state_machines.yaml#task.derived_status) — a previous
    cycle's DONE assignment must not resurface once the task has been reopened (M6-03a)."""
    return list(
        session.scalars(
            select(Assignment.status).where(
                Assignment.task_id == task_id,
                Assignment.cycle == cycle,
                Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES),
            )
        ).all()
    )


def _has_revision_work(session: Session, order: Order) -> bool:
    """guard `revision_has_work_if_revision`: ≥1 non-cancelled task of the order was created or
    reopened in the order's current revision."""
    return (
        session.scalar(
            select(func.count())
            .select_from(Task)
            .where(
                Task.order_id == order.id,
                Task.cancelled_at.is_(None),
                (Task.created_in_revision == order.revision_no)
                | (Task.last_reopened_in_revision == order.revision_no),
            )
        )
        or 0
    ) > 0


def _reload(session: Session, actor: Actor, assignment_id: uuid.UUID) -> MyAssignmentOut:
    row = session.execute(_select_mine(actor).where(Assignment.id == assignment_id)).one()
    return _row_out(row)


def _active_task_statuses(session: Session, order_id: uuid.UUID) -> list[str]:
    """Derived status of every non-CANCELLED task of an order — feeds guards
    `has_active_tasks`/`all_active_tasks_done` (spec/state_machines.yaml#order.all_tasks_done)."""
    return list(
        session.scalars(
            select(Task.status).where(Task.order_id == order_id, Task.cancelled_at.is_(None))
        ).all()
    )


def accept_assignment(
    session: Session,
    actor: Actor,
    assignment_id: uuid.UUID,
    body: AssignmentAccept,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> MyAssignmentOut:
    assignment, task = _find_own_assignment(session, actor, assignment_id)
    order = _lock_order(session, task.order_id, body.version)
    transition = domain.find_assignment_transition(specs.state_machines.assignment, "accept")
    _check_assignment_transition(assignment, transition)
    _check_guards(transition.guards, order_status=order.status, cancelled_at=task.cancelled_at)

    from_status = assignment.status
    assignment.status = "ACCEPTED"
    assignment.accepted_at = now
    session.flush()

    task.status = domain.derive_task_status(
        _active_assignment_statuses(session, task.id, task.cycle), cancelled=task.cancelled_at is not None
    )
    order.version += 1  # Order is the aggregate root (Q62).
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ASSIGNMENT",
        entity_id=assignment.id,
        action="accept",
        from_status=from_status,
        to_status="ACCEPTED",
        request_id=request_id,
    )
    return _reload(session, actor, assignment.id)


def reject_assignment(
    session: Session,
    actor: Actor,
    assignment_id: uuid.UUID,
    body: AssignmentReject,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> MyAssignmentOut:
    assignment, task = _find_own_assignment(session, actor, assignment_id)
    order = _lock_order(session, task.order_id, body.version)
    transition = domain.find_assignment_transition(specs.state_machines.assignment, "reject")
    _check_assignment_transition(assignment, transition)
    _check_guards(
        transition.guards,
        order_status=order.status,
        cancelled_at=task.cancelled_at,
        reason_code=body.reason_code,
        reason_text=body.reason_text,
    )

    from_status = assignment.status
    assignment.status = "REJECTED"
    assignment.rejected_at = now
    assignment.reject_reason_code = body.reason_code
    assignment.reject_reason_text = body.reason_text
    session.flush()

    # notify_tech_leads/fire_order_reevaluate effects skipped (Q60-style, see spec §2 "Ngoài phạm
    # vi"): Thông báo module doesn't exist yet (M7-01), and fire_order_reevaluate's only consumer
    # (order.all_tasks_done) still needs PENDING_GUARDS has_active_tasks/all_active_tasks_done
    # (M5-03) — same treatment dispatch/service.py:cancel_task already documents.
    task.status = domain.derive_task_status(
        _active_assignment_statuses(session, task.id, task.cycle), cancelled=task.cancelled_at is not None
    )
    order.version += 1  # Order is the aggregate root (Q62).
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ASSIGNMENT",
        entity_id=assignment.id,
        action="reject",
        from_status=from_status,
        to_status="REJECTED",
        data={"reason_code": body.reason_code, "reason_text": body.reason_text},
        request_id=request_id,
    )
    return _reload(session, actor, assignment.id)


def start_assignment(
    session: Session,
    actor: Actor,
    assignment_id: uuid.UUID,
    body: AssignmentStart,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> MyAssignmentOut:
    assignment, task = _find_own_assignment(session, actor, assignment_id)
    order = _lock_order(session, task.order_id, body.version)
    transition = domain.find_assignment_transition(specs.state_machines.assignment, "start")
    _check_assignment_transition(assignment, transition)
    _check_guards(transition.guards, order_status=order.status, cancelled_at=task.cancelled_at)

    from_status = assignment.status
    assignment.status = "IN_PROGRESS"
    assignment.started_at = now
    session.flush()

    task.status = domain.derive_task_status(
        _active_assignment_statuses(session, task.id, task.cycle), cancelled=task.cancelled_at is not None
    )
    order.version += 1  # Order is the aggregate root (Q62).
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ASSIGNMENT",
        entity_id=assignment.id,
        action="start",
        from_status=from_status,
        to_status="IN_PROGRESS",
        request_id=request_id,
    )
    return _reload(session, actor, assignment.id)


def complete_assignment(
    session: Session,
    actor: Actor,
    assignment_id: uuid.UUID,
    body: AssignmentComplete,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> MyAssignmentOut:
    assignment, task = _find_own_assignment(session, actor, assignment_id)
    order = _lock_order(session, task.order_id, body.version)
    transition = domain.find_assignment_transition(specs.state_machines.assignment, "complete")
    _check_assignment_transition(assignment, transition)
    _check_guards(transition.guards, order_status=order.status, cancelled_at=task.cancelled_at)

    from_status = assignment.status
    assignment.status = "DONE"
    assignment.done_at = now
    assignment.completion_note = body.completion_note
    assignment.actual_hours = body.actual_hours
    session.flush()

    task.status = domain.derive_task_status(
        _active_assignment_statuses(session, task.id, task.cycle), cancelled=task.cancelled_at is not None
    )
    order.version += 1  # Order is the aggregate root (Q62) — bumped once per command.
    session.flush()

    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ASSIGNMENT",
        entity_id=assignment.id,
        action="complete",
        from_status=from_status,
        to_status="DONE",
        request_id=request_id,
    )

    # order.all_tasks_done (spec/state_machines.yaml#order): evaluated while the order is
    # IN_PROGRESS or REVISION (M6-03a) — No error surfaced to the actor if the guards don't pass —
    # the order simply stays put, same contract as dispatch/service.py's start_dispatch inline
    # system-transition.
    if task.status == "DONE" and order.status in ("IN_PROGRESS", "REVISION"):
        active_statuses = _active_task_statuses(session, order.id)
        if (
            GUARDS["has_active_tasks"](len(active_statuses))
            and GUARDS["all_active_tasks_done"](active_statuses)
            and GUARDS["revision_has_work_if_revision"](order.status, _has_revision_work(session, order))
        ):
            from_status = order.status
            order.status = "AWAITING_CONFIRMATION"
            session.flush()
            audit.record(
                session,
                actor_id=None,
                entity_type="ORDER",
                entity_id=order.id,
                action="all_tasks_done",
                from_status=from_status,
                to_status="AWAITING_CONFIRMATION",
                request_id=request_id,
            )

    return _reload(session, actor, assignment.id)
