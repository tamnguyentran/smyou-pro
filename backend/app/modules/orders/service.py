"""Order management use cases (M3-02a). Callers own the transaction; these never commit."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.core.errors import AppError
from app.core.sequences import next_value
from app.modules.audit import service as audit
from app.modules.catalog.models import Product, Service
from app.modules.customers.models import Customer
from app.modules.orders import domain
from app.modules.orders.models import Order, OrderLine
from app.modules.orders.schemas import (
    OrderCreate,
    OrderDetail,
    OrderLineCreate,
    OrderLineOut,
    OrderLineRemove,
    OrderLineUpdate,
    OrderUpdate,
)

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")
NOT_FOUND_ORDER = "Không tìm thấy đơn hàng."
NOT_FOUND_LINE = "Không tìm thấy dòng hàng."
NOT_FOUND_CUSTOMER = "Không tìm thấy khách hàng."
NOT_FOUND_PRODUCT = "Không tìm thấy sản phẩm."
NOT_FOUND_SERVICE = "Không tìm thấy dịch vụ."
ORDER_NOT_DRAFT = "Đơn phải đang ở trạng thái Nháp mới thực hiện được thao tác này."
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

# order.edit_draft genuinely grants SALE only `own` (unlike customers/audit's empty `{}`, which is
# safe only because every role holding those capabilities gets `all`). `assigned` (TECHNICIAN) has
# no rule yet: Task/Assignment don't exist until M4/M5, so it fails closed (no rows) — correct,
# since a DRAFT order can never have an assignment.
RULES: ScopeRules = {"own": lambda actor: Order.created_by == actor.id}


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


def _out(order: Order) -> OrderDetail:
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
    )


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
    session: Session, actor: Actor, body: OrderCreate, *, now: datetime, request_id: str | None = None
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
    return _out(order)


def get_order(session: Session, actor: Actor, order_id: uuid.UUID) -> OrderDetail:
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.lines))
    order = get_in_scope_or_404(session, stmt, actor, RULES)
    return _out(order)


def update_order(
    session: Session, actor: Actor, order_id: uuid.UUID, body: OrderUpdate, *, request_id: str | None = None
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
    return _out(order)


def add_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderLineCreate,
    *,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_draft(order)
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
    line = OrderLine(
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
    return _out(order)


def update_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineUpdate,
    *,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_draft(order)
    line = next((candidate for candidate in order.lines if candidate.id == line_id), None)
    if line is None:
        raise _not_found(NOT_FOUND_LINE)

    changes = body.model_dump(exclude_unset=True, exclude={"version"})
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
    return _out(order)


def remove_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineRemove,
    *,
    request_id: str | None = None,
) -> OrderDetail:
    order = _locked(session, actor, order_id, body.version)
    _require_draft(order)
    line = next((candidate for candidate in order.lines if candidate.id == line_id), None)
    if line is None:
        raise _not_found(NOT_FOUND_LINE)

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
    return _out(order)
