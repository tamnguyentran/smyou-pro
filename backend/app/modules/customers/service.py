"""Customer management use cases (M3-01). Callers own the transaction; these never commit."""

import logging
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.core.errors import AppError
from app.core.sequences import next_value
from app.modules.audit import service as audit
from app.modules.customers.domain import customer_code, last_code_number
from app.modules.customers.models import Customer
from app.modules.customers.schemas import (
    CustomerCreate,
    CustomerMatchOut,
    CustomerOut,
    CustomerPage,
    CustomerUpdate,
    CustomerWritten,
)

logger = logging.getLogger(__name__)

CODE_TAKEN = "Mã khách hàng đã được dùng cho khách hàng khác."
# customer.read / customer.manage are `all` for every role holding them today; see
# employees/service.py for why this stays an explicit (empty) map rather than an implicit
# "no rule = no restriction".
RULES: ScopeRules = {}


def _out(customer: Customer) -> CustomerOut:
    return CustomerOut(
        id=customer.id,
        code=customer.code,
        type=customer.type,
        name=customer.name,
        contact_person=customer.contact_person,
        phone=customer.phone,
        email=customer.email,
        tax_code=customer.tax_code,
        address=customer.address,
        note=customer.note,
        created_by=customer.created_by,
        version=customer.version,
    )


def _written(customer: Customer, matches: list[CustomerMatchOut]) -> CustomerWritten:
    return CustomerWritten(**_out(customer).model_dump(), duplicate_phone_matches=matches)


def _log(action: str, customer: Customer, actor: Actor) -> None:
    logger.info("customer %s: %s by %s", customer.id, action, actor.id)


def _code_taken() -> AppError:
    return AppError(
        409, "CONFLICT", CODE_TAKEN, errors=[{"field": "code", "code": "taken", "message": CODE_TAKEN}]
    )


def _flush(session: Session) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint == "uq_customers_code":
            raise _code_taken() from exc
        raise


def _locked(session: Session, actor: Actor, customer_id: uuid.UUID, version: int) -> Customer:
    stmt = apply_scope(select(Customer).where(Customer.id == customer_id), actor, RULES)
    stmt = stmt.with_for_update().execution_options(populate_existing=True)
    customer = session.scalars(stmt).one_or_none()
    if customer is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy khách hàng.")
    if customer.version != version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    return customer


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _duplicate_matches(
    session: Session, phone: str, *, except_id: uuid.UUID | None = None
) -> list[CustomerMatchOut]:
    """Cảnh báo, không phải lỗi (spec §4): các khách hàng khác cùng SĐT đã chuẩn hoá."""
    query = select(Customer).where(Customer.phone == phone)
    if except_id is not None:
        query = query.where(Customer.id != except_id)
    rows = session.scalars(query.order_by(Customer.code)).all()
    return [CustomerMatchOut(id=c.id, code=c.code, name=c.name, phone=c.phone) for c in rows]


def list_customers(
    session: Session,
    actor: Actor,
    *,
    q: str | None,
    customer_type: str | None,
    limit: int,
    offset: int,
) -> CustomerPage:
    query = apply_scope(select(Customer), actor, RULES)
    if q and q.strip():
        pattern = _like(q.strip())
        query = query.where(
            or_(
                func.unaccent(Customer.name).ilike(func.unaccent(pattern)),
                Customer.phone.ilike(pattern),
                Customer.tax_code.ilike(pattern),
            )
        )
    if customer_type is not None:
        query = query.where(Customer.type == customer_type)
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered = query.order_by(Customer.code)
    rows = session.scalars(ordered.limit(limit).offset(offset)).all()
    return CustomerPage(items=[_out(c) for c in rows], total=total, limit=limit, offset=offset)


def get_customer(session: Session, actor: Actor, customer_id: uuid.UUID) -> CustomerOut:
    customer: Customer = get_in_scope_or_404(
        session, select(Customer).where(Customer.id == customer_id), actor, RULES
    )
    return _out(customer)


def create_customer(
    session: Session, actor: Actor, body: CustomerCreate, *, request_id: str | None = None
) -> CustomerWritten:
    codes = list(session.scalars(select(Customer.code)))
    number = next_value(session, "customer", at_least_after=last_code_number(codes))
    customer = Customer(
        code=customer_code(number),
        type=body.type,
        name=body.name,
        contact_person=body.contact_person,
        phone=body.phone,
        email=body.email,
        tax_code=body.tax_code,
        address=body.address,
        note=body.note,
        created_by=actor.id,
        version=1,
    )
    session.add(customer)
    _flush(session)
    matches = _duplicate_matches(session, customer.phone, except_id=customer.id)
    _log("create", customer, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="CUSTOMER",
        entity_id=customer.id,
        action="create",
        request_id=request_id,
    )
    return _written(customer, matches)


def update_customer(
    session: Session,
    actor: Actor,
    customer_id: uuid.UUID,
    body: CustomerUpdate,
    *,
    request_id: str | None = None,
) -> CustomerWritten:
    customer = _locked(session, actor, customer_id, body.version)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    # Required fields sent as null are ignored; optional ones sent empty are cleared (like employees).
    wanted = {f: changes[f] for f in ("type", "name", "phone") if changes.get(f) is not None}
    wanted |= {
        f: changes[f] for f in ("contact_person", "email", "tax_code", "address", "note") if f in changes
    }
    changed_fields = sorted(f for f, value in wanted.items() if getattr(customer, f) != value)
    for field in changed_fields:
        setattr(customer, field, wanted[field])
    customer.version += 1
    _flush(session)
    matches = _duplicate_matches(session, customer.phone, except_id=customer.id)
    _log("update", customer, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="CUSTOMER",
        entity_id=customer.id,
        action="update",
        data={"changed_fields": changed_fields},
        request_id=request_id,
    )
    return _written(customer, matches)
