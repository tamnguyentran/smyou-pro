"""Customer-gift use cases (M16-01a). Callers own the transaction; these never commit.

No delete route — mistakes are corrected via PATCH, which is fully audited (Q97).
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules
from app.core.config import Settings
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.customer_gifts.domain import total_amount as compute_total_amount
from app.modules.customer_gifts.models import CustomerGift
from app.modules.customer_gifts.schemas import (
    CustomerGiftCreate,
    CustomerGiftOut,
    CustomerGiftPage,
    CustomerGiftUpdate,
    EmployeeRef,
    GiftPhoto,
    GiftPhotoPage,
)
from app.modules.customers.models import Customer
from app.modules.files import service as files
from app.modules.files.models import Attachment
from app.modules.identity.models import Employee

# customer_gift.read / customer_gift.manage are `all` for every role holding them today (Q97) —
# kept as an explicit (empty) map rather than an implicit "no rule = no restriction" (see
# employees/service.py and customers/service.py for the same rationale).
RULES: ScopeRules = {}

CHANGED_FIELDS = (
    "occasion_name",
    "performed_date",
    "gift_name",
    "quantity",
    "unit_price",
    "other_cost",
    "performed_by",
    "requested_by",
    "note",
)


def _employee_ref(employee: Employee) -> EmployeeRef:
    return EmployeeRef(id=employee.id, code=employee.code, full_name=employee.full_name)


def _get_employee_or_422(session: Session, employee_id: uuid.UUID, *, field: str) -> Employee:
    employee = session.get(Employee, employee_id)
    if employee is None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Dữ liệu không hợp lệ.",
            errors=[{"field": field, "code": "not_found", "message": "Không tìm thấy nhân viên."}],
        )
    return employee


def _out(gift: CustomerGift, performed_by: Employee, requested_by: Employee) -> CustomerGiftOut:
    return CustomerGiftOut(
        id=gift.id,
        customer_id=gift.customer_id,
        occasion_name=gift.occasion_name,
        performed_date=gift.performed_date,
        gift_name=gift.gift_name,
        quantity=gift.quantity,
        unit_price=gift.unit_price,
        other_cost=gift.other_cost,
        total_amount=gift.total_amount,
        note=gift.note,
        performed_by=_employee_ref(performed_by),
        requested_by=_employee_ref(requested_by),
        created_by=gift.created_by,
        version=gift.version,
        created_at=gift.created_at,
        updated_at=gift.updated_at,
    )


def _employee(session: Session, employee_id: uuid.UUID) -> Employee:
    """FK-guaranteed to exist — `.one()` raises instead of needing an `is None` narrowing check."""
    return session.scalars(select(Employee).where(Employee.id == employee_id)).one()


def _with_employees(session: Session, gift: CustomerGift) -> CustomerGiftOut:
    performed_by = _employee(session, gift.performed_by)
    requested_by = _employee(session, gift.requested_by)
    return _out(gift, performed_by, requested_by)


def _get_or_404(session: Session, gift_id: uuid.UUID) -> CustomerGift:
    gift = session.get(CustomerGift, gift_id)
    if gift is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy bản ghi tặng quà.")
    return gift


def create_gift(
    session: Session, actor: Actor, body: CustomerGiftCreate, *, request_id: str | None = None
) -> CustomerGiftOut:
    if session.get(Customer, body.customer_id) is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy khách hàng.")
    performed_by = _get_employee_or_422(session, body.performed_by, field="performed_by")
    requested_by = _get_employee_or_422(session, body.requested_by, field="requested_by")
    gift = CustomerGift(
        customer_id=body.customer_id,
        occasion_name=body.occasion_name,
        performed_date=body.performed_date,
        gift_name=body.gift_name,
        quantity=body.quantity,
        unit_price=body.unit_price,
        other_cost=body.other_cost,
        total_amount=compute_total_amount(
            quantity=body.quantity, unit_price=body.unit_price, other_cost=body.other_cost
        ),
        note=body.note,
        performed_by=body.performed_by,
        requested_by=body.requested_by,
        created_by=actor.id,
        version=1,
    )
    session.add(gift)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="CUSTOMER_GIFT",
        entity_id=gift.id,
        action="create",
        request_id=request_id,
    )
    return _out(gift, performed_by, requested_by)


def get_gift(session: Session, actor: Actor, gift_id: uuid.UUID) -> CustomerGiftOut:
    gift = _get_or_404(session, gift_id)
    return _with_employees(session, gift)


def list_gifts(
    session: Session, actor: Actor, *, customer_id: uuid.UUID, limit: int, offset: int
) -> CustomerGiftPage:
    query = select(CustomerGift).where(CustomerGift.customer_id == customer_id)
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered = query.order_by(CustomerGift.performed_date.desc(), CustomerGift.created_at.desc())
    rows = session.scalars(ordered.limit(limit).offset(offset)).all()
    return CustomerGiftPage(
        items=[_with_employees(session, gift) for gift in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


def update_gift(
    session: Session,
    actor: Actor,
    gift_id: uuid.UUID,
    body: CustomerGiftUpdate,
    *,
    request_id: str | None = None,
) -> CustomerGiftOut:
    gift = _get_or_404(session, gift_id)
    if gift.version != body.version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    if "performed_by" in changes:
        _get_employee_or_422(session, changes["performed_by"], field="performed_by")
    if "requested_by" in changes:
        _get_employee_or_422(session, changes["requested_by"], field="requested_by")
    wanted = {f: changes[f] for f in CHANGED_FIELDS if f in changes}
    changed_fields: dict[str, dict[str, object]] = {}
    for field, new_value in wanted.items():
        old_value = getattr(gift, field)
        if old_value != new_value:
            changed_fields[field] = {"from": _jsonable(old_value), "to": _jsonable(new_value)}
            setattr(gift, field, new_value)
    quantity = changes.get("quantity", gift.quantity)
    unit_price = changes.get("unit_price", gift.unit_price)
    other_cost = changes.get("other_cost", gift.other_cost)
    new_total = compute_total_amount(quantity=quantity, unit_price=unit_price, other_cost=other_cost)
    if new_total != gift.total_amount:
        changed_fields["total_amount"] = {"from": gift.total_amount, "to": new_total}
        gift.total_amount = new_total
    gift.version += 1
    session.flush()
    if changed_fields:
        audit.record(
            session,
            actor_id=actor.id,
            entity_type="CUSTOMER_GIFT",
            entity_id=gift.id,
            action="update",
            data={"changed_fields": changed_fields},
            request_id=request_id,
        )
    return _with_employees(session, gift)


def _jsonable(value: object) -> object:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def upload_photo(
    session: Session,
    actor: Actor,
    gift_id: uuid.UUID,
    *,
    file_bytes: bytes,
    filename: str,
    declared_mime: str,
    settings: Settings,
    now: datetime,
) -> GiftPhoto:
    gift = _get_or_404(session, gift_id)
    attachment = files.store_image(
        session,
        owner_type="CUSTOMER_GIFT",
        owner_id=gift.id,
        kind="GIFT_PHOTO",
        revision_no=1,
        file_bytes=file_bytes,
        filename=filename,
        declared_mime=declared_mime,
        uploaded_by=actor.id,
        settings=settings,
        now=now,
    )
    session.flush()
    uploader = _employee(session, actor.id)
    return _photo_out(attachment, uploader)


def _photo_out(attachment: Attachment, uploader: Employee) -> GiftPhoto:
    return GiftPhoto(
        id=attachment.id,
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
        uploaded_by=attachment.uploaded_by,
        uploaded_by_name=uploader.full_name,
        created_at=attachment.created_at,
    )


def list_photos(session: Session, actor: Actor, gift_id: uuid.UUID) -> GiftPhotoPage:
    gift = _get_or_404(session, gift_id)
    rows = session.execute(
        select(Attachment, Employee)
        .join(Employee, Employee.id == Attachment.uploaded_by)
        .where(
            Attachment.owner_type == "CUSTOMER_GIFT",
            Attachment.owner_id == gift.id,
            Attachment.kind == "GIFT_PHOTO",
        )
        .order_by(Attachment.created_at.desc())
    ).all()
    return GiftPhotoPage(items=[_photo_out(attachment, employee) for attachment, employee in rows])
