"""Customer-care staff record their calls (M27-01a). Callers own the transaction; these never commit.

A call with a customer request also appends a `customer_potential_notes` row (Q192): the request becomes
the customer's current "Tiềm năng sử dụng dịch vụ", shared with the technicians' notes.
"""

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.customer_care_calls.models import CustomerCareCall
from app.modules.customer_care_calls.schemas import CareCallCreate, CareCallOut, CareCallPage
from app.modules.customer_potential.models import CustomerPotentialNote
from app.modules.customers.models import Customer
from app.modules.identity.models import Employee

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

# Q191: `own` = calls the actor recorded. Q197 (M27-03): no role holds `own` any more;
# kept so a future `own` grant stays scoped.
RULES: ScopeRules = {"own": lambda actor: CustomerCareCall.caller_id == actor.id}


def _vn_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=VIETNAM)


def _calls_query() -> Select[tuple[CustomerCareCall, str, str, str]]:
    return (
        select(CustomerCareCall, Customer.name, Customer.phone, Employee.full_name)
        .join(Customer, Customer.id == CustomerCareCall.customer_id)
        .join(Employee, Employee.id == CustomerCareCall.caller_id)
    )


def _out(call: CustomerCareCall, customer_name: str, customer_phone: str, caller_name: str) -> CareCallOut:
    return CareCallOut(
        id=call.id,
        customer_id=call.customer_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        caller_id=call.caller_id,
        caller_name=caller_name,
        offered=call.offered,
        customer_request=call.customer_request,
        called_at=call.called_at,
    )


def record_call(
    session: Session, actor: Actor, body: CareCallCreate, *, request_id: str | None = None
) -> CareCallOut:
    customer = session.get(Customer, body.customer_id)
    if customer is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy khách hàng.")
    call = CustomerCareCall(
        customer_id=customer.id,
        caller_id=actor.id,
        offered=body.offered,
        customer_request=body.customer_request,
    )
    session.add(call)
    session.flush()
    session.refresh(call)
    if call.customer_request is not None:
        session.add(
            CustomerPotentialNote(
                customer_id=customer.id,
                care_call_id=call.id,
                author_id=actor.id,
                note=call.customer_request,
                created_at=call.called_at,
            )
        )
        session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="CUSTOMER",
        entity_id=customer.id,
        action="care_call",
        data={"care_call_id": str(call.id)},
        request_id=request_id,
    )
    caller_name = session.scalar(select(Employee.full_name).where(Employee.id == actor.id))
    return _out(call, customer.name, customer.phone, caller_name or "")


def list_calls(
    session: Session,
    actor: Actor,
    *,
    customer_id: uuid.UUID | None = None,
    caller_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    limit: int,
    offset: int,
) -> CareCallPage:
    query = apply_scope(_calls_query(), actor, RULES)
    if customer_id is not None:
        query = query.where(CustomerCareCall.customer_id == customer_id)
    if caller_id is not None:
        query = query.where(CustomerCareCall.caller_id == caller_id)
    if date_from is not None:
        query = query.where(CustomerCareCall.called_at >= _vn_day_start_utc(date_from))
    if date_to is not None:
        query = query.where(CustomerCareCall.called_at < _vn_day_start_utc(date_to + timedelta(days=1)))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(func.unaccent(Customer.name).ilike(func.unaccent(pattern)), Customer.phone.ilike(pattern))
        )
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = session.execute(
        query.order_by(CustomerCareCall.called_at.desc(), CustomerCareCall.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return CareCallPage(
        items=[_out(call, name, phone, caller) for call, name, phone, caller in rows],
        total=total,
        limit=limit,
        offset=offset,
    )
