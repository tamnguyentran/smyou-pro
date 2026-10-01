"""Order management use cases (M3-02a, M3-03a). Callers own the transaction; these never commit."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.authz import Actor, ScopeRules, apply_scope, effective_scopes, get_in_scope_or_404
from app.core.errors import AppError
from app.core.sequences import next_value
from app.core.spec_loader import Specs
from app.modules.audit import service as audit
from app.modules.audit.schemas import AuditEventPage
from app.modules.catalog.models import Product, Service
from app.modules.customers.models import Customer
from app.modules.identity.models import Employee
from app.modules.orders import domain
from app.modules.orders.models import Order, OrderLine
from app.modules.orders.schemas import (
    OrderCancel,
    OrderCommand,
    OrderContactUpdate,
    OrderCreate,
    OrderDetail,
    OrderLineCreate,
    OrderLineOut,
    OrderLineRemove,
    OrderLineUpdate,
    OrderPage,
    OrderSummary,
    OrderUpdate,
)
from app.modules.workflow.guards import GUARDS

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")
NOT_FOUND_ORDER = "Không tìm thấy đơn hàng."
NOT_FOUND_LINE = "Không tìm thấy dòng hàng."
NOT_FOUND_CUSTOMER = "Không tìm thấy khách hàng."
NOT_FOUND_PRODUCT = "Không tìm thấy sản phẩm."
NOT_FOUND_SERVICE = "Không tìm thấy dịch vụ."
ORDER_NOT_DRAFT = "Đơn phải đang ở trạng thái Nháp mới thực hiện được thao tác này."
ORDER_NOT_SUBMITTED = "Đơn chưa được gửi — dùng chức năng sửa đơn nháp."
ORDER_LOCKED = "Đơn đã hoàn tất hoặc đã huỷ, không thể sửa."
PRICE_FIXED = "Đơn giá của dòng này cố định theo danh mục."
DISCOUNT_EXCEEDS_GROSS = "Giảm giá không được lớn hơn tiền hàng của dòng."
ITEM_INACTIVE = "Sản phẩm/dịch vụ này đã ngừng kinh doanh."
VAT_REQUIRED_FOR_CUSTOM = "VAT bắt buộc cho dòng tự do."

CUSTOMER_FIELDS = ("customer_id", "customer_name", "customer_phone", "customer_email", "customer_tax_code")
HEADER_FIELDS = (
    "division",
    "service_address",
    "work_description",
    "priority",
    "requested_date",
    "payment_status",
    "payment_method",
)
# These two columns are NOT NULL (default "") — OrderCreate already coerces None to "" for them
# (`body.service_address or ""` below); OrderUpdate's schema is nullable the same way (so a client
# can clear the field), so PATCH needs the same coercion or `null` here trips the DB constraint.
NON_NULL_TEXT_FIELDS = {"service_address", "work_description"}
# M3-04a (Q57): fields `order.edit_contact` may change once the order is no longer DRAFT — a subset
# of HEADER_FIELDS/CUSTOMER_FIELDS, deliberately excluding `customer_id` (no re-linking to a
# different customer record after submit, only correcting the snapshot text) and the
# dispatch/accounting fields (division/priority/requested_date/payment_*).
CONTACT_FIELDS = (
    "customer_name",
    "customer_phone",
    "customer_email",
    "customer_tax_code",
    "service_address",
    "work_description",
)
# M3-04a (Q57): statuses where `order.edit_contact`/`order.edit_lines_after_submit` apply — after
# DRAFT (which uses order.edit_draft instead) and before the order is COMPLETED/CANCELLED for good.
# REVISION is included: that's exactly when a contact/line correction is often needed.
EDITABLE_AFTER_SUBMIT_STATUSES = frozenset(
    {"PENDING_DISPATCH", "IN_PROGRESS", "AWAITING_CONFIRMATION", "REVISION"}
)

# order.edit_draft genuinely grants SALE only `own` (unlike customers/audit's empty `{}`, which is
# safe only because every role holding those capabilities gets `all`). `assigned` (TECHNICIAN) has
# no rule yet: Task/Assignment don't exist until M4/M5, so it fails closed (no rows) — correct,
# since a DRAFT order can never have an assignment. `order.submit`/`order.cancel` define "own" the
# same way (spec/permissions.yaml), so this one dict covers every order capability's scope check.
RULES: ScopeRules = {"own": lambda actor: Order.created_by == actor.id}

_GUARD_MESSAGES = {
    "customer_present": "Đơn cần có khách hàng trước khi gửi.",
    "has_lines_or_description": "Đơn cần có ít nhất 1 dòng hàng hoặc mô tả công việc.",
    "service_address_present": "Đơn cần có địa chỉ thi công.",
    "order_has_no_tasks": "Đơn đang có đầu việc, không thể thực hiện thao tác này.",
    "reason_present": "Vui lòng nhập lý do (ít nhất 5 ký tự).",
}


@dataclass(frozen=True)
class _ItemSnapshot:
    product_id: uuid.UUID | None
    service_id: uuid.UUID | None
    sku_snapshot: str | None
    name_snapshot: str
    unit_snapshot: str
    specs_snapshot: str | None
    warranty_months_snapshot: int | None
    catalog_price_snapshot: int | None
    price_fixed: bool
    default_vat_rate: Decimal | None


def _not_found(message: str) -> AppError:
    return AppError(404, "NOT_FOUND", message)


def _field_error(field: str, message: str, *, code: str = "not_found") -> AppError:
    return AppError(
        422, "VALIDATION_ERROR", message, errors=[{"field": field, "code": code, "message": message}]
    )


def _order_not_draft() -> AppError:
    return AppError(409, "ORDER_NOT_DRAFT", ORDER_NOT_DRAFT)


def _order_not_submitted() -> AppError:
    return AppError(409, "ORDER_NOT_SUBMITTED", ORDER_NOT_SUBMITTED)


def _order_locked() -> AppError:
    return AppError(409, "ORDER_LOCKED", ORDER_LOCKED)


def _json_safe(value: object) -> object:
    """`audit_events.data` is JSONB — `Decimal`/`UUID` aren't natively serializable."""
    if isinstance(value, Decimal | uuid.UUID):
        return str(value)
    return value


def _price_fixed_error() -> AppError:
    return AppError(
        422,
        "PRICE_FIXED",
        PRICE_FIXED,
        errors=[{"field": "unit_price", "code": "price_fixed", "message": PRICE_FIXED}],
    )


def _discount_exceeds_gross() -> AppError:
    return AppError(
        422,
        "DISCOUNT_EXCEEDS_GROSS",
        DISCOUNT_EXCEEDS_GROSS,
        errors=[{"field": "line_discount", "code": "exceeds_gross", "message": DISCOUNT_EXCEEDS_GROSS}],
    )


def _item_inactive(field: str) -> AppError:
    return AppError(
        422,
        "ITEM_INACTIVE",
        ITEM_INACTIVE,
        errors=[{"field": field, "code": "inactive", "message": ITEM_INACTIVE}],
    )


def _require_draft(order: Order) -> None:
    if order.status != "DRAFT":
        raise _order_not_draft()


def _require_editable_after_submit(order: Order) -> None:
    if order.status == "DRAFT":
        raise _order_not_submitted()
    if order.status not in EDITABLE_AFTER_SUBMIT_STATUSES:
        raise _order_locked()


def _locked(session: Session, actor: Actor, order_id: uuid.UUID, version: int) -> Order:
    stmt = apply_scope(select(Order).where(Order.id == order_id), actor, RULES)
    stmt = stmt.options(selectinload(Order.lines)).with_for_update().execution_options(populate_existing=True)
    order = session.scalars(stmt).one_or_none()
    if order is None:
        raise _not_found(NOT_FOUND_ORDER)
    if order.version != version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    return order


def _bump(order: Order) -> None:
    order.version += 1


def _recompute_order_totals(order: Order) -> None:
    lines = [
        domain.LineTotals(line.line_gross, line.line_discount, line.line_vat, line.line_total)
        for line in order.lines
    ]
    totals = domain.sum_order(lines)
    order.subtotal = totals.subtotal
    order.discount_amount = totals.discount_amount
    order.vat_amount = totals.vat_amount
    order.total = totals.total


def _line_out(line: OrderLine) -> OrderLineOut:
    return OrderLineOut(
        id=line.id,
        position=line.position,
        item_type=line.item_type,
        product_id=line.product_id,
        service_id=line.service_id,
        sku_snapshot=line.sku_snapshot,
        name_snapshot=line.name_snapshot,
        unit_snapshot=line.unit_snapshot,
        specs_snapshot=line.specs_snapshot,
        warranty_months_snapshot=line.warranty_months_snapshot,
        catalog_price_snapshot=line.catalog_price_snapshot,
        price_fixed=line.price_fixed,
        vat_rate=line.vat_rate,
        quantity=line.quantity,
        unit_price=line.unit_price,
        is_gift=line.is_gift,
        line_discount=line.line_discount,
        line_gross=line.line_gross,
        line_vat=line.line_vat,
        line_total=line.line_total,
        note=line.note,
    )


def _allowed_commands(order: Order, actor: Actor, specs: Specs) -> list[str]:
    """State-machine commands the actor may currently invoke on this order (ARCHITECTURE §4:
    the frontend shows/hides action buttons from this list, never re-deriving the rule itself).

    Iterates `spec/state_machines.yaml#order.transitions` in file order (submit, recall, …, cancel),
    which is why the resulting lists match the spec's expected order exactly. Only checks capability
    + scope — a listed command can still fail its own guards at execution time (409 GUARD_FAILED).
    """
    commands = []
    for t in specs.state_machines.order.transitions:
        if t.actor is not None or t.capability is None:
            continue  # system-only transition (e.g. start_dispatch) — never actor-invoked
        if order.status not in t.from_:
            continue
        scopes = effective_scopes(specs.permissions, actor.roles, t.capability)
        if "all" in scopes or ("own" in scopes and order.created_by == actor.id):
            commands.append(t.command)
    return commands


def _can_edit_after_submit(order: Order, actor: Actor, specs: Specs, capability: str) -> bool:
    """Whether `actor` could call the M3-04a contact/line-after-submit routes on this order right
    now — exposed on `OrderDetail` so the frontend never re-derives permission/state (CLAUDE.md
    rule 4), same spirit as `_allowed_commands`."""
    if order.status not in EDITABLE_AFTER_SUBMIT_STATUSES:
        return False
    scopes = effective_scopes(specs.permissions, actor.roles, capability)
    return "all" in scopes or ("own" in scopes and order.created_by == actor.id)


def _out(order: Order, actor: Actor, specs: Specs) -> OrderDetail:
    lines = sorted(order.lines, key=lambda line: line.position)
    return OrderDetail(
        id=order.id,
        code=order.code,
        status=order.status,
        division=order.division,
        customer_id=order.customer_id,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        customer_email=order.customer_email,
        customer_tax_code=order.customer_tax_code,
        service_address=order.service_address,
        work_description=order.work_description,
        priority=order.priority,
        requested_date=order.requested_date,
        subtotal=order.subtotal,
        discount_amount=order.discount_amount,
        vat_amount=order.vat_amount,
        total=order.total,
        payment_status=order.payment_status,
        payment_method=order.payment_method,
        revision_no=order.revision_no,
        created_by=order.created_by,
        version=order.version,
        lines=[_line_out(line) for line in lines],
        allowed_commands=_allowed_commands(order, actor, specs),
        can_edit_contact=_can_edit_after_submit(order, actor, specs, "order.edit_contact"),
        can_edit_lines_after_submit=_can_edit_after_submit(
            order, actor, specs, "order.edit_lines_after_submit"
        ),
    )


def _summary(order: Order, created_by_name: str | None) -> OrderSummary:
    return OrderSummary(
        id=order.id,
        code=order.code,
        status=order.status,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        division=order.division,
        priority=order.priority,
        total=order.total,
        requested_date=order.requested_date,
        created_by=order.created_by,
        created_by_name=created_by_name,
        created_at=order.created_at,
    )


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _resolve_customer(
    session: Session,
    customer_id: uuid.UUID | None,
    customer_name: str | None,
    customer_phone: str | None,
    customer_email: str | None,
    customer_tax_code: str | None,
) -> tuple[uuid.UUID | None, str | None, str | None, str | None, str | None]:
    if customer_id is None:
        return None, customer_name, customer_phone, customer_email, customer_tax_code
    customer = session.get(Customer, customer_id)
    if customer is None:
        raise _field_error("customer_id", NOT_FOUND_CUSTOMER)
    return customer.id, customer.name, customer.phone, customer.email, customer.tax_code


def _snapshot_item(session: Session, body: OrderLineCreate) -> _ItemSnapshot:
    if body.item_type == "PRODUCT":
        product = session.get(Product, body.product_id) if body.product_id else None
        if product is None:
            raise _field_error("product_id", NOT_FOUND_PRODUCT)
        if not product.is_active:
            raise _item_inactive("product_id")
        return _ItemSnapshot(
            product_id=product.id,
            service_id=None,
            sku_snapshot=product.sku,
            name_snapshot=product.name,
            unit_snapshot=product.unit,
            specs_snapshot=product.specs,
            warranty_months_snapshot=product.warranty_months,
            catalog_price_snapshot=product.price,
            price_fixed=product.price_fixed,
            default_vat_rate=product.vat_rate,
        )
    if body.item_type == "SERVICE":
        service_row = session.get(Service, body.service_id) if body.service_id else None
        if service_row is None:
            raise _field_error("service_id", NOT_FOUND_SERVICE)
        if not service_row.is_active:
            raise _item_inactive("service_id")
        return _ItemSnapshot(
            product_id=None,
            service_id=service_row.id,
            sku_snapshot=None,
            name_snapshot=service_row.name,
            unit_snapshot=service_row.unit,
            specs_snapshot=None,
            warranty_months_snapshot=None,
            catalog_price_snapshot=service_row.price,
            price_fixed=service_row.price_fixed,
            default_vat_rate=service_row.vat_rate,
        )
    # CUSTOM — schema field_validators already guarantee name/unit are present.
    if body.name is None or body.unit is None:
        raise AssertionError("OrderLineCreate schema should require name/unit for CUSTOM lines")
    return _ItemSnapshot(
        product_id=None,
        service_id=None,
        sku_snapshot=None,
        name_snapshot=body.name,
        unit_snapshot=body.unit,
        specs_snapshot=body.specs,
        warranty_months_snapshot=body.warranty_months,
        catalog_price_snapshot=None,
        price_fixed=False,
        default_vat_rate=None,
    )


def _resolve_pricing(
    *,
    quantity: Decimal,
    is_gift: bool,
    unit_price_in: int,
    vat_rate_in: Decimal | None,
    line_discount: int,
    price_fixed: bool,
    catalog_price_snapshot: int | None,
    default_vat_rate: Decimal | None,
) -> tuple[int, Decimal, domain.LineTotals]:
    unit_price = 0 if is_gift else unit_price_in
    if not is_gift and price_fixed and unit_price != catalog_price_snapshot:
        raise _price_fixed_error()
    vat_rate = vat_rate_in if vat_rate_in is not None else default_vat_rate
    if vat_rate is None:
        raise AssertionError("caller must reject a CUSTOM line with no vat_rate before pricing it")
    line_gross_preview = domain.round_half_up(quantity * unit_price)
    if line_discount > line_gross_preview:
        raise _discount_exceeds_gross()
    totals = domain.price_line(quantity, unit_price, vat_rate, line_discount)
    return unit_price, vat_rate, totals


def create_order(
    session: Session,
    actor: Actor,
    body: OrderCreate,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    customer_id, customer_name, customer_phone, customer_email, customer_tax_code = _resolve_customer(
        session,
        body.customer_id,
        body.customer_name,
        body.customer_phone,
        body.customer_email,
        body.customer_tax_code,
    )
    period = now.astimezone(VIETNAM).strftime("%y%m")
    number = next_value(session, "order", period=period)
    order = Order(
        code=domain.order_code(period, number),
        status="DRAFT",
        division=body.division,
        customer_id=customer_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        customer_tax_code=customer_tax_code,
        service_address=body.service_address or "",
        work_description=body.work_description or "",
        priority=body.priority,
        requested_date=body.requested_date,
        payment_status=body.payment_status,
        payment_method=body.payment_method,
        created_by=actor.id,
        version=1,
    )
    session.add(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="create",
        request_id=request_id,
    )
    return _out(order, actor, specs)


def get_order(session: Session, actor: Actor, order_id: uuid.UUID, *, specs: Specs) -> OrderDetail:
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.lines))
    order = get_in_scope_or_404(session, stmt, actor, RULES)
    return _out(order, actor, specs)


def list_orders(
    session: Session,
    actor: Actor,
    *,
    q: str | None,
    status: str | None,
    limit: int,
    offset: int,
) -> OrderPage:
    query = apply_scope(
        select(Order, Employee).outerjoin(Employee, Employee.id == Order.created_by), actor, RULES
    )
    if q and q.strip():
        pattern = _like(q.strip())
        query = query.where(
            or_(
                Order.code.ilike(pattern),
                func.unaccent(Order.customer_name).ilike(func.unaccent(pattern)),
                Order.customer_phone.ilike(pattern),
            )
        )
    if status is not None:
        query = query.where(Order.status == status)
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered = query.order_by(Order.created_at.desc())
    rows = session.execute(ordered.limit(limit).offset(offset)).all()
    return OrderPage(
        items=[_summary(o, employee.full_name if employee else None) for o, employee in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


def get_order_history(
    session: Session, actor: Actor, order_id: uuid.UUID, *, limit: int, offset: int
) -> AuditEventPage:
    # Visibility is established by `order.read`'s own scope on the parent order — the history rows
    # themselves are not re-scoped by audit.read (Manager-only, the system-wide Nhật ký page; see
    # spec Q55). `get_in_scope_or_404` 404s here exactly like `get_order` does.
    order = get_in_scope_or_404(session, select(Order).where(Order.id == order_id), actor, RULES)
    return audit.list_events_for_entity(
        session, entity_type="ORDER", entity_id=order.id, limit=limit, offset=offset
    )


def _check_guards(order: Order, guard_names: list[str], reason: str | None) -> None:
    for name in guard_names:
        if name == "customer_present":
            ok = GUARDS[name](order.customer_id, order.customer_name, order.customer_phone)
        elif name == "has_lines_or_description":
            ok = GUARDS[name](len(order.lines), order.work_description)
        elif name == "service_address_present":
            ok = GUARDS[name](order.service_address)
        elif name == "order_has_no_tasks":
            # `tasks` doesn't exist until M4-01 — always 0 at this milestone (spec §8).
            ok = GUARDS[name](0)
        elif name == "reason_present":
            ok = GUARDS[name](reason)
        else:
            raise AssertionError(f"order transitions don't use guard {name!r}")
        if not ok:
            raise AppError(409, "GUARD_FAILED", _GUARD_MESSAGES[name], extra={"guard": name})


def _apply_transition(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    version: int,
    command: str,
    *,
    reason: str | None,
    now: datetime,
    specs: Specs,
    request_id: str | None,
) -> Order:
    order = _locked(session, actor, order_id, version)
    t = domain.find_transition(specs.state_machines.order, command)
    if order.status not in t.from_:
        raise AppError(409, "INVALID_TRANSITION", "Không thể thực hiện thao tác này ở trạng thái hiện tại.")
    _check_guards(order, t.guards, reason)

    from_status = order.status
    order.status = t.to
    if command == "submit":
        order.submitted_at = now
    elif command == "cancel":
        order.cancelled_at = now
        order.cancel_reason = reason
    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action=command,
        from_status=from_status,
        to_status=order.status,
        data={"reason": reason} if reason else None,
        request_id=request_id,
    )
    return order


def submit_order(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderCommand,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _apply_transition(
        session,
        actor,
        order_id,
        body.version,
        "submit",
        reason=None,
        now=now,
        specs=specs,
        request_id=request_id,
    )
    return _out(order, actor, specs)


def recall_order(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderCommand,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _apply_transition(
        session,
        actor,
        order_id,
        body.version,
        "recall",
        reason=None,
        now=now,
        specs=specs,
        request_id=request_id,
    )
    return _out(order, actor, specs)


def cancel_order(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderCancel,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _apply_transition(
        session,
        actor,
        order_id,
        body.version,
        "cancel",
        reason=body.reason,
        now=now,
        specs=specs,
        request_id=request_id,
    )
    return _out(order, actor, specs)


def update_order(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderUpdate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_draft(order)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    changed_fields: list[str] = []

    if set(CUSTOMER_FIELDS) & changes.keys():
        effective_customer_id = changes.get("customer_id", order.customer_id)
        resolved = _resolve_customer(
            session,
            effective_customer_id,
            changes.get("customer_name", order.customer_name),
            changes.get("customer_phone", order.customer_phone),
            changes.get("customer_email", order.customer_email),
            changes.get("customer_tax_code", order.customer_tax_code),
        )
        for field, value in zip(CUSTOMER_FIELDS, resolved, strict=True):
            if getattr(order, field) != value:
                changed_fields.append(field)
            setattr(order, field, value)

    for field in HEADER_FIELDS:
        if field in changes:
            value = changes[field]
            if field in NON_NULL_TEXT_FIELDS and value is None:
                value = ""
            if getattr(order, field) != value:
                changed_fields.append(field)
            setattr(order, field, value)

    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="update",
        data={"changed_fields": sorted(changed_fields)},
        request_id=request_id,
    )
    return _out(order, actor, specs)


def _find_line(order: Order, line_id: uuid.UUID) -> OrderLine:
    line = next((candidate for candidate in order.lines if candidate.id == line_id), None)
    if line is None:
        raise _not_found(NOT_FOUND_LINE)
    return line


def _build_line(session: Session, order: Order, body: OrderLineCreate) -> OrderLine:
    if body.item_type == "CUSTOM" and body.vat_rate is None:
        raise _field_error("vat_rate", VAT_REQUIRED_FOR_CUSTOM, code="required")
    snapshot = _snapshot_item(session, body)
    unit_price, vat_rate, totals = _resolve_pricing(
        quantity=body.quantity,
        is_gift=body.is_gift,
        unit_price_in=body.unit_price,
        vat_rate_in=body.vat_rate,
        line_discount=body.line_discount,
        price_fixed=snapshot.price_fixed,
        catalog_price_snapshot=snapshot.catalog_price_snapshot,
        default_vat_rate=snapshot.default_vat_rate,
    )
    return OrderLine(
        order_id=order.id,
        position=max((line.position for line in order.lines), default=0) + 1,
        item_type=body.item_type,
        product_id=snapshot.product_id,
        service_id=snapshot.service_id,
        sku_snapshot=snapshot.sku_snapshot,
        name_snapshot=snapshot.name_snapshot,
        unit_snapshot=snapshot.unit_snapshot,
        specs_snapshot=snapshot.specs_snapshot,
        warranty_months_snapshot=snapshot.warranty_months_snapshot,
        catalog_price_snapshot=snapshot.catalog_price_snapshot,
        price_fixed=snapshot.price_fixed,
        vat_rate=vat_rate,
        quantity=body.quantity,
        unit_price=unit_price,
        is_gift=body.is_gift,
        line_discount=totals.line_discount,
        line_gross=totals.line_gross,
        line_vat=totals.line_vat,
        line_total=totals.line_total,
        note=body.note,
    )


# Fields `_apply_line_changes` tracks for the M3-04a audit diff. Captured for ALL of these
# regardless of what the client sent on `OrderLineUpdate` — pricing side effects (e.g.
# `is_gift=True` zeroing `unit_price` in `_resolve_pricing`) must still show up in the diff,
# since it's money data needed for dispute resolution (spec M3-04a §2/§4, AC-ORD-106).
_LINE_DIFF_FIELDS = ("quantity", "unit_price", "vat_rate", "is_gift", "line_discount", "note")


def _apply_line_changes(line: OrderLine, body: OrderLineUpdate) -> dict[str, dict[str, object]]:
    """Mutates `line` exactly as before this item existed, and additionally returns a
    `{field: {"before", "after"}}` diff (every tracked field whose value actually changed,
    including side effects of fields the client sent) — `update_line` (DRAFT) ignores the
    return value; `update_line_after_submit` (M3-04a) puts it straight into `audit_events.data`."""
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    before = {field: getattr(line, field) for field in _LINE_DIFF_FIELDS}

    quantity = changes.get("quantity", line.quantity)
    is_gift = changes.get("is_gift", line.is_gift)
    unit_price_in = changes.get("unit_price", line.unit_price)
    vat_rate_in = changes.get("vat_rate", line.vat_rate)
    line_discount = changes.get("line_discount", line.line_discount)

    unit_price, vat_rate, totals = _resolve_pricing(
        quantity=quantity,
        is_gift=is_gift,
        unit_price_in=unit_price_in,
        vat_rate_in=vat_rate_in,
        line_discount=line_discount,
        price_fixed=line.price_fixed,
        catalog_price_snapshot=line.catalog_price_snapshot,
        default_vat_rate=line.vat_rate,
    )
    line.quantity = quantity
    line.is_gift = is_gift
    line.unit_price = unit_price
    line.vat_rate = vat_rate
    line.line_discount = totals.line_discount
    line.line_gross = totals.line_gross
    line.line_vat = totals.line_vat
    line.line_total = totals.line_total
    if "note" in changes:
        line.note = changes["note"]

    return {
        field: {"before": _json_safe(old), "after": _json_safe(getattr(line, field))}
        for field, old in before.items()
        if old != getattr(line, field)
    }


def add_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderLineCreate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_draft(order)
    line = _build_line(session, order, body)
    order.lines.append(line)
    _recompute_order_totals(order)
    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="add_line",
        request_id=request_id,
    )
    return _out(order, actor, specs)


def update_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineUpdate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_draft(order)
    line = _find_line(order, line_id)
    _apply_line_changes(line, body)

    _recompute_order_totals(order)
    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="update_line",
        request_id=request_id,
    )
    return _out(order, actor, specs)


def remove_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineRemove,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_draft(order)
    line = _find_line(order, line_id)

    order.lines.remove(line)
    _recompute_order_totals(order)
    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="remove_line",
        request_id=request_id,
    )
    return _out(order, actor, specs)


# ---------------- M3-04a: sửa liên hệ / dòng hàng sau khi gửi ----------------


def update_contact(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderContactUpdate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_editable_after_submit(order)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})

    diff: dict[str, dict[str, object]] = {}
    for field in CONTACT_FIELDS:
        if field not in changes:
            continue
        value = changes[field]
        if field in NON_NULL_TEXT_FIELDS and value is None:
            value = ""
        before = getattr(order, field)
        if before != value:
            diff[field] = {"before": _json_safe(before), "after": _json_safe(value)}
        setattr(order, field, value)

    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="edit_contact",
        data={"changes": diff},
        request_id=request_id,
    )
    return _out(order, actor, specs)


def add_line_after_submit(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderLineCreate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_editable_after_submit(order)
    line = _build_line(session, order, body)
    order.lines.append(line)
    _recompute_order_totals(order)
    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="add_line_after_submit",
        data={"line_id": str(line.id), "item": line.name_snapshot, "line_total": line.line_total},
        request_id=request_id,
    )
    return _out(order, actor, specs)


def update_line_after_submit(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineUpdate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_editable_after_submit(order)
    line = _find_line(order, line_id)
    diff = _apply_line_changes(line, body)

    _recompute_order_totals(order)
    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="update_line_after_submit",
        data={"line_id": str(line.id), "item": line.name_snapshot, "changes": diff},
        request_id=request_id,
    )
    return _out(order, actor, specs)


def remove_line_after_submit(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineRemove,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_editable_after_submit(order)
    line = _find_line(order, line_id)
    removed_item, removed_total = line.name_snapshot, line.line_total

    order.lines.remove(line)
    _recompute_order_totals(order)
    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="remove_line_after_submit",
        data={"line_id": str(line_id), "item": removed_item, "line_total": removed_total},
        request_id=request_id,
    )
    return _out(order, actor, specs)
