"""Technicians record the order customer's "Tiềm năng sử dụng dịch vụ" (M21-05a).

Notes are append-only and belong to the customer (Q156): the history of an order lists every note of
its customer, whichever order each was written on. Reads `dispatch.models`/`orders.models` directly,
the same kind of cross-module model read as `orders.service._assigned_clause` (ARCHITECTURE §3).
"""

import uuid

from sqlalchemy import ColumnElement, Select, select
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, get_in_scope_or_404
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.customer_potential.models import CustomerPotentialNote
from app.modules.customer_potential.schemas import CustomerPotentialNoteCreate, CustomerPotentialNoteOut
from app.modules.dispatch.models import Assignment, Task
from app.modules.identity.models import Employee
from app.modules.orders import service as orders
from app.modules.orders.models import Order

# Q154: accepted, started or finished — not merely offered (PENDING) or declined (REJECTED).
RECORDING_ASSIGNMENT_STATUSES = ("ACCEPTED", "IN_PROGRESS", "DONE")
CLOSED_ORDER_STATUSES = ("COMPLETED", "CANCELLED")

_GUARD_MESSAGES = {
    "order_open_for_potential_note": "Đơn đã hoàn tất hoặc đã huỷ, không thể ghi tiềm năng khách hàng.",
    "order_has_customer": "Đơn chưa gắn khách hàng trong danh bạ, không thể ghi tiềm năng.",
}


def _recording_assignment_clause(actor: Actor) -> ColumnElement[bool]:
    """`customer.potential.record`'s `assigned` scope — narrower than `order.read`'s: a PENDING or
    REJECTED assignment doesn't count, and such an order answers 404 like any out-of-scope one."""
    return Order.id.in_(
        select(Task.order_id)
        .join(Assignment, Assignment.task_id == Task.id)
        .where(Assignment.employee_id == actor.id, Assignment.status.in_(RECORDING_ASSIGNMENT_STATUSES))
    )


RECORD_RULES: ScopeRules = {"assigned": _recording_assignment_clause}


def _guard_failed(guard: str) -> AppError:
    return AppError(409, "GUARD_FAILED", _GUARD_MESSAGES[guard], extra={"guard": guard})


def _notes_query(customer_id: uuid.UUID) -> Select[tuple[CustomerPotentialNote, str, str]]:
    """M27-01a: notes from a customer-care call have no order — outer join."""
    return (
        select(CustomerPotentialNote, Order.code, Employee.full_name)
        .outerjoin(Order, Order.id == CustomerPotentialNote.order_id)
        .join(Employee, Employee.id == CustomerPotentialNote.author_id)
        .where(CustomerPotentialNote.customer_id == customer_id)
    )


def _out(note: CustomerPotentialNote, order_code: str | None, author_name: str) -> CustomerPotentialNoteOut:
    return CustomerPotentialNoteOut(
        id=note.id,
        customer_id=note.customer_id,
        order_id=note.order_id,
        order_code=order_code,
        source="ORDER" if note.order_id is not None else "CARE_CALL",
        note=note.note,
        author_id=note.author_id,
        author_name=author_name,
        created_at=note.created_at,
    )


def record_note(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: CustomerPotentialNoteCreate,
    *,
    request_id: str | None = None,
) -> CustomerPotentialNoteOut:
    # Lock the order row so a concurrent COMPLETE/CANCEL can't slip past the closed-order guard.
    order: Order = get_in_scope_or_404(
        session,
        select(Order).where(Order.id == order_id).with_for_update().execution_options(populate_existing=True),
        actor,
        RECORD_RULES,
    )
    if order.status in CLOSED_ORDER_STATUSES:
        raise _guard_failed("order_open_for_potential_note")
    if order.customer_id is None:
        raise _guard_failed("order_has_customer")
    note = CustomerPotentialNote(
        customer_id=order.customer_id, order_id=order.id, author_id=actor.id, note=body.note
    )
    session.add(note)
    session.flush()
    session.refresh(note)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="CUSTOMER",
        entity_id=order.customer_id,
        action="potential_note",
        data={"order_id": str(order.id), "order_code": order.code, "note_id": str(note.id)},
        request_id=request_id,
    )
    author_name = session.scalar(select(Employee.full_name).where(Employee.id == actor.id))
    return _out(note, order.code, author_name or "")


def list_notes(session: Session, actor: Actor, order_id: uuid.UUID) -> list[CustomerPotentialNoteOut]:
    """`actor.scopes` is bound to `order.read` — whoever can read the order reads its customer's notes."""
    order: Order = get_in_scope_or_404(
        session, select(Order).where(Order.id == order_id), actor, orders.RULES
    )
    if order.customer_id is None:
        return []
    stmt = _notes_query(order.customer_id).order_by(
        CustomerPotentialNote.created_at.desc(), CustomerPotentialNote.id.desc()
    )
    return [_out(note, code, name) for note, code, name in session.execute(stmt).all()]
