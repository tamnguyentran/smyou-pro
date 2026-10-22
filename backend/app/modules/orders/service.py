"""Order management use cases (M3-02a, M3-03a). Callers own the transaction; these never commit."""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.authz import Actor, ScopeRules, apply_scope, effective_scopes, get_in_scope_or_404
from app.core.config import Settings
from app.core.errors import AppError
from app.core.sequences import next_value
from app.core.spec_loader import Specs
from app.modules.audit import service as audit
from app.modules.audit.schemas import AuditEventPage
from app.modules.catalog.models import Product, Service
from app.modules.customers.models import Customer
from app.modules.dispatch import domain as dispatch_domain
from app.modules.dispatch.models import OPEN_TASK_STATUSES_EXCLUDE, Assignment, Task
from app.modules.files import service as files
from app.modules.files.models import Attachment
from app.modules.identity.models import Employee
from app.modules.notifications import service as notifications
from app.modules.orders import domain
from app.modules.orders.models import Order, OrderLine, OrderRevision
from app.modules.orders.schemas import (
    ConfirmationAttachment,
    ConfirmationAttachmentPage,
    OrderCancel,
    OrderCommand,
    OrderComplete,
    OrderContactUpdate,
    OrderCreate,
    OrderCsatUpdate,
    OrderDetail,
    OrderLineCreate,
    OrderLineOut,
    OrderLineRemove,
    OrderLineUpdate,
    OrderPage,
    OrderRevise,
    OrderRevisionRequestCreate,
    OrderRevisionRequestOut,
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
CUSTOM_LINE_DISABLED = "Chỉ được chọn Sản phẩm hoặc Dịch vụ."

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
# safe only because every role holding those capabilities gets `all`). `order.submit`/`order.cancel`
# define "own" the same way (spec/permissions.yaml), so this one dict covers every order capability's
# scope check.
def _assigned_clause(actor: Actor) -> ColumnElement[bool]:
    """TECHNICIAN `assigned` scope (M4-01a): "a task where the user has (or had) an assignment"
    (spec/permissions.yaml) — no status filter, so a rejected/removed assignment still counts.
    Reads `dispatch.models` directly (Task/Assignment), the same kind of cross-module model read as
    the `identity.models.Employee` join documented in ARCHITECTURE §3."""
    return Order.id.in_(
        select(Task.order_id)
        .join(Assignment, Assignment.task_id == Task.id)
        .where(Assignment.employee_id == actor.id)
    )


RULES: ScopeRules = {"own": lambda actor: Order.created_by == actor.id, "assigned": _assigned_clause}

_GUARD_MESSAGES = {
    "customer_present": "Đơn cần có khách hàng trước khi gửi.",
    "has_lines_or_description": "Đơn cần có ít nhất 1 dòng hàng hoặc mô tả công việc.",
    "service_address_present": "Đơn cần có địa chỉ thi công.",
    "order_has_no_tasks": "Đơn đang có đầu việc, không thể thực hiện thao tác này.",
    "reason_present": "Vui lòng nhập lý do (ít nhất 5 ký tự).",
    "confirmation_attachment_in_current_revision": (
        "Cần tải ảnh phiếu xác nhận có chữ ký khách trước khi hoàn tất đơn."
    ),
    "confirmation_attachment_not_uploaded": "Đơn đã có ảnh khách ký xác nhận, không thể huỷ.",
    "signer_name_present": "Vui lòng nhập tên người ký.",
    "order_completed": "Chỉ ghi phản hồi khách hàng khi đơn đã Hoàn tất.",
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


def _diff_fields(before: dict[str, object], after: dict[str, object]) -> dict[str, dict[str, object]]:
    """`{field: {"before", "after"}}` (both `_json_safe`'d) for every key of `before` whose value in
    `after` actually differs — shared by `update_contact` and `_apply_line_changes` for the M3-04a
    audit diff; unchanged fields are omitted."""
    return {
        field: {"before": _json_safe(old), "after": _json_safe(after[field])}
        for field, old in before.items()
        if old != after[field]
    }


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


def _require_completed(order: Order) -> None:
    """`AC-CSK-003`: CSAT can only be recorded while the order's *current* status is `COMPLETED` —
    a `REVISION`'d order can't, even though it was completed before (Q89, 2026-10-21 default)."""
    if order.status != "COMPLETED":
        raise AppError(
            409, "GUARD_FAILED", _GUARD_MESSAGES["order_completed"], extra={"guard": "order_completed"}
        )


def lock_order(session: Session, actor: Actor, order_id: uuid.UUID, version: int) -> Order:
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
        # "assigned" (order.complete's TECHNICIAN scope) needs no extra check here, same reasoning
        # as `_can_upload_confirmation`/`_can_complete`: the order was only fetched in the first
        # place because `order.read`'s own `assigned` scope (`RULES["assigned"]`) already matched it.
        if "all" in scopes or ("own" in scopes and order.created_by == actor.id) or "assigned" in scopes:
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


def _can_upload_confirmation(order: Order, actor: Actor, specs: Specs) -> bool:
    """`order.upload_confirmation`'s scopes are all/assigned (no `own`). `assigned` needs no extra
    query here: it's the same capability-independent `RULES["assigned"]` task/assignment clause
    `order.read` already checked to fetch this order in the first place — see `_assigned_clause`."""
    if order.status != "AWAITING_CONFIRMATION":
        return False
    scopes = effective_scopes(specs.permissions, actor.roles, "order.upload_confirmation")
    return "all" in scopes or "assigned" in scopes


def _can_complete(order: Order, actor: Actor, specs: Specs) -> bool:
    """Same capability-independent `assigned` scope as `_can_upload_confirmation` — guard outcomes
    (e.g. missing attachment, AC-ORD-137) never factor into this, only capability+scope+status."""
    if order.status != "AWAITING_CONFIRMATION":
        return False
    scopes = effective_scopes(specs.permissions, actor.roles, "order.complete")
    return "all" in scopes or "assigned" in scopes


def _can_revise(order: Order, actor: Actor, specs: Specs) -> bool:
    """`order.revise` grants only `all` (spec/permissions.yaml) — no `own`/`assigned` branch
    needed, unlike `_can_complete`."""
    if order.status not in {"AWAITING_CONFIRMATION", "COMPLETED"}:
        return False
    scopes = effective_scopes(specs.permissions, actor.roles, "order.revise")
    return "all" in scopes


def _has_pending_revision_request(session: Session, order: Order) -> bool:
    # Review: skip the extra audit_events query on the hot write paths of every other status —
    # a pending request only exists once an order has reached COMPLETED at least once.
    if order.status not in ("COMPLETED", "REVISION"):
        return False
    latest = audit.latest_action(
        session, entity_type="ORDER", entity_id=order.id, actions=("revision_requested", "request_revision")
    )
    return latest == "revision_requested"


def _out(session: Session, order: Order, actor: Actor, specs: Specs) -> OrderDetail:
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
        csat_rating=order.csat_rating,
        csat_comment=order.csat_comment,
        csat_recorded_by=order.csat_recorded_by,
        csat_recorded_at=order.csat_recorded_at,
        revision_no=order.revision_no,
        created_by=order.created_by,
        version=order.version,
        lines=[_line_out(line) for line in lines],
        allowed_commands=_allowed_commands(order, actor, specs),
        can_edit_contact=_can_edit_after_submit(order, actor, specs, "order.edit_contact"),
        can_edit_lines_after_submit=_can_edit_after_submit(
            order, actor, specs, "order.edit_lines_after_submit"
        ),
        can_upload_confirmation=_can_upload_confirmation(order, actor, specs),
        can_complete=_can_complete(order, actor, specs),
        can_revise=_can_revise(order, actor, specs),
        has_pending_revision_request=_has_pending_revision_request(session, order),
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
        revision_no=order.revision_no,
        csat_rating=order.csat_rating,
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
    return _out(session, order, actor, specs)


def get_order(session: Session, actor: Actor, order_id: uuid.UUID, *, specs: Specs) -> OrderDetail:
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.lines))
    order = get_in_scope_or_404(session, stmt, actor, RULES)
    return _out(session, order, actor, specs)


def list_orders(
    session: Session,
    actor: Actor,
    *,
    q: str | None,
    status: str | None,
    sort: str = "created_at_desc",
    mine: bool = False,
    overdue: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
    csat_rating: int | None = None,
    now: datetime,
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
    if mine:
        query = query.where(Order.created_by == actor.id)
    if date_from is not None:
        query = query.where(Order.completed_at >= _vn_day_start_utc(date_from))
    if date_to is not None:
        query = query.where(Order.completed_at < _vn_day_start_utc(date_to + timedelta(days=1)))
    if csat_rating is not None:
        query = query.where(Order.csat_rating == csat_rating)
    if overdue:
        query = query.where(
            Order.status.notin_(("COMPLETED", "CANCELLED")),
            Order.id.in_(
                select(Task.order_id).where(Task.status.notin_(OPEN_TASK_STATUSES_EXCLUDE), Task.due_at < now)
            ),
        )
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    if sort == "dispatch":
        # M4-01a dispatch queue (spec §4): priority desc, then requested_date asc (null last).
        priority_rank = case(
            (Order.priority == "URGENT", 4),
            (Order.priority == "HIGH", 3),
            (Order.priority == "NORMAL", 2),
            else_=1,
        )
        ordered = query.order_by(
            priority_rank.desc(), Order.requested_date.asc().nulls_last(), Order.created_at.asc()
        )
    else:
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


def order_in_scope(session: Session, actor: Actor, order_id: uuid.UUID) -> bool:
    """Non-raising scope check for `files/router.py`'s dynamic `attachments_get` (M6-01) — it needs
    to tell "order outside caller's scope" from "order exists and is visible" without importing
    `orders.models`/`RULES` directly (ARCHITECTURE §3: cross-module calls go through a service's
    public function, not its models). `actor.scopes` must already be bound to the capability the
    caller decided applies (`order.read`)."""
    stmt = apply_scope(select(Order.id).where(Order.id == order_id), actor, RULES)
    return session.scalars(stmt).first() is not None


def upload_confirmation_attachment(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    *,
    file_bytes: bytes,
    filename: str,
    declared_mime: str,
    settings: Settings,
    now: datetime,
    request_id: str | None = None,
) -> ConfirmationAttachment:
    order = get_in_scope_or_404(session, select(Order).where(Order.id == order_id), actor, RULES)
    attachment = files.store_image(
        session,
        owner_type="ORDER",
        owner_id=order.id,
        kind="CUSTOMER_CONFIRMATION",
        revision_no=order.revision_no,
        file_bytes=file_bytes,
        filename=filename,
        declared_mime=declared_mime,
        uploaded_by=actor.id,
        settings=settings,
        now=now,
    )
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="confirmation_upload",
        data={"attachment_id": str(attachment.id), "revision_no": order.revision_no},
        request_id=request_id,
    )
    uploader = session.scalars(select(Employee).where(Employee.id == actor.id)).one()
    return ConfirmationAttachment(
        id=attachment.id,
        revision_no=attachment.revision_no,
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
        uploaded_by=attachment.uploaded_by,
        uploaded_by_name=uploader.full_name,
        created_at=attachment.created_at,
    )


def list_confirmation_attachments(
    session: Session, actor: Actor, order_id: uuid.UUID
) -> ConfirmationAttachmentPage:
    order = get_in_scope_or_404(session, select(Order).where(Order.id == order_id), actor, RULES)
    rows = session.execute(
        select(Attachment, Employee)
        .join(Employee, Employee.id == Attachment.uploaded_by)
        .where(
            Attachment.owner_type == "ORDER",
            Attachment.owner_id == order.id,
            Attachment.kind == "CUSTOMER_CONFIRMATION",
        )
        .order_by(Attachment.created_at.desc())
    ).all()
    return ConfirmationAttachmentPage(
        items=[
            ConfirmationAttachment(
                id=attachment.id,
                revision_no=attachment.revision_no,
                mime_type=attachment.mime_type,
                size_bytes=attachment.size_bytes,
                uploaded_by=attachment.uploaded_by,
                uploaded_by_name=employee.full_name,
                created_at=attachment.created_at,
            )
            for attachment, employee in rows
        ]
    )


def _check_guards(
    session: Session,
    order: Order,
    guard_names: list[str],
    reason: str | None,
    *,
    signer_name: str | None = None,
) -> None:
    for name in guard_names:
        if name == "customer_present":
            ok = GUARDS[name](order.customer_id, order.customer_name, order.customer_phone)
        elif name == "has_lines_or_description":
            ok = GUARDS[name](len(order.lines), order.work_description)
        elif name == "service_address_present":
            ok = GUARDS[name](order.service_address)
        elif name == "order_has_no_tasks":
            task_count = session.scalar(
                select(func.count()).select_from(Task).where(Task.order_id == order.id)
            )
            ok = GUARDS[name](task_count or 0)
        elif name == "reason_present":
            ok = GUARDS[name](reason)
        elif (
            name == "confirmation_attachment_in_current_revision"
            or name == "confirmation_attachment_not_uploaded"
        ):
            has_attachment = (
                session.scalar(
                    select(func.count())
                    .select_from(Attachment)
                    .where(
                        Attachment.owner_type == "ORDER",
                        Attachment.owner_id == order.id,
                        Attachment.kind == "CUSTOMER_CONFIRMATION",
                        Attachment.revision_no == order.revision_no,
                    )
                )
                or 0
            ) > 0
            ok = GUARDS[name](has_attachment)
        elif name == "signer_name_present":
            ok = GUARDS[name](signer_name)
        else:
            raise AssertionError(f"order transitions don't use guard {name!r}")
        if not ok:
            raise AppError(409, "GUARD_FAILED", _GUARD_MESSAGES[name], extra={"guard": name})


# Same notion of "active" as assignments/service.py/dispatch/service.py's _ACTIVE_STATUSES/
# _INACTIVE_ASSIGNMENT_STATUSES (duplicated locally — both are private to their own module).
_ACTIVE_ASSIGNMENT_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS", "DONE")
_OPEN_ASSIGNMENT_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS")


def reevaluate_dispatch_state(
    session: Session, order: Order, actor: Actor, *, now: datetime, request_id: str | None
) -> None:
    """spec/state_machines.yaml#order `start_dispatch`/`undispatch` — system transitions
    re-evaluated after every task/assignment change (Q90, 2026-10-19, reverses Q81). Only one of
    the two can ever fire, since each requires the order to already be in the other's `to` state."""
    if order.status not in ("PENDING_DISPATCH", "IN_PROGRESS"):
        return
    has_active = (
        session.scalar(
            select(func.count())
            .select_from(Assignment)
            .join(Task, Task.id == Assignment.task_id)
            .where(Task.order_id == order.id, Assignment.status.in_(_ACTIVE_ASSIGNMENT_STATUSES))
        )
        or 0
    ) > 0
    if order.status == "PENDING_DISPATCH" and GUARDS["has_active_assignment"](has_active):
        to_status = "IN_PROGRESS"
        action = "start_dispatch"
    elif order.status == "IN_PROGRESS" and GUARDS["no_active_assignment"](has_active):
        to_status = "PENDING_DISPATCH"
        action = "undispatch"
    else:
        return
    from_status = order.status
    order.status = to_status
    session.flush()
    if action == "start_dispatch":
        notifications.notify_order_dispatch_started(session, order)
    else:
        notifications.notify_order_undispatched(session, order)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action=action,
        from_status=from_status,
        to_status=to_status,
        request_id=request_id,
    )


def _cancel_open_assignments_and_notify(session: Session, order: Order, now: datetime) -> None:
    """`cancel_active`'s `cancel_open_tasks` effect (docs/product/WORKFLOWS.md#L92): every task of
    the order that isn't DONE is cancelled, and every still-open assignment is force-REMOVED (same
    treatment as dispatch/service.py's `cancel_task`), each notified — no audit event of its own,
    only the order's own `cancel_active` event."""
    open_assignments = session.scalars(
        select(Assignment)
        .join(Task, Task.id == Assignment.task_id)
        .where(Task.order_id == order.id, Assignment.status.in_(_OPEN_ASSIGNMENT_STATUSES))
    ).all()
    for assignment in open_assignments:
        assignment.status = "REMOVED"
        assignment.removed_at = now
    session.flush()
    tasks_by_id = {
        task.id: task
        for task in session.scalars(select(Task).where(Task.order_id == order.id, Task.status != "DONE"))
    }
    for task in tasks_by_id.values():
        task.cancelled_at = now
        task.status = dispatch_domain.derive_task_status([], cancelled=True)
    for assignment in open_assignments:
        notifications.notify_assignment_removed(
            session, tasks_by_id[assignment.task_id], order, assignment.employee_id
        )


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
    signer_name: str | None = None,
) -> Order:
    order = lock_order(session, actor, order_id, version)
    t = domain.find_transition(specs.state_machines.order, command)
    if order.status not in t.from_:
        raise AppError(409, "INVALID_TRANSITION", "Không thể thực hiện thao tác này ở trạng thái hiện tại.")
    _check_guards(session, order, t.guards, reason, signer_name=signer_name)

    from_status = order.status
    order.status = t.to
    if command == "submit":
        order.submitted_at = now
    elif command in ("cancel", "cancel_active"):
        order.cancelled_at = now
        order.cancel_reason = reason
    elif command == "complete":
        order.completed_at = now
        order.confirmation_signer_name = signer_name
    elif command == "request_revision":
        order.revision_no += 1
        session.add(
            OrderRevision(
                order_id=order.id, revision_no=order.revision_no, reason=reason, requested_by=actor.id
            )
        )
    _bump(order)
    session.flush()
    if command == "cancel_active":
        _cancel_open_assignments_and_notify(session, order, now)
    if command == "submit":
        notifications.notify_order_submitted(session, order)
    elif command == "complete":
        notifications.notify_order_completed(session, order)
    elif command == "request_revision":
        notifications.notify_order_revision_requested(session, order, reason or "")
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
    return _out(session, order, actor, specs)


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
    return _out(session, order, actor, specs)


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
    return _out(session, order, actor, specs)


def cancel_active_order(
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
        "cancel_active",
        reason=body.reason,
        now=now,
        specs=specs,
        request_id=request_id,
    )
    return _out(session, order, actor, specs)


def complete_order(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderComplete,
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
        "complete",
        reason=None,
        now=now,
        specs=specs,
        request_id=request_id,
        signer_name=body.confirmation_signer_name,
    )
    return _out(session, order, actor, specs)


def request_revision(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderRevise,
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
        "request_revision",
        reason=body.reason,
        now=now,
        specs=specs,
        request_id=request_id,
    )
    return _out(session, order, actor, specs)


def count_revision_orders(session: Session, actor: Actor) -> int:  # CounterProvider shape
    return session.scalar(select(func.count()).select_from(Order).where(Order.status == "REVISION")) or 0


def record_csat(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderCsatUpdate,
    *,
    now: datetime,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    """M15-02a (AC-CSK-001...005): overwrite-only, no history of past calls (Q89 default) — the
    audit event is the only record of *who* called/when a prior value was replaced."""
    order = lock_order(session, actor, order_id, body.version)
    _require_completed(order)
    order.csat_rating = body.csat_rating
    order.csat_comment = body.csat_comment
    order.csat_recorded_by = actor.id
    order.csat_recorded_at = now
    _bump(order)
    session.flush()
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="csat_recorded",
        data={"csat_rating": body.csat_rating, "csat_comment": body.csat_comment},
        request_id=request_id,
    )
    return _out(session, order, actor, specs)


def request_revision_from_customer_care(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderRevisionRequestCreate,
    *,
    request_id: str | None = None,
) -> OrderRevisionRequestOut:
    """M15-03 (AC-CSK-020...023): CSKH báo QLKT cần xem lại đơn — chỉ ghi audit_event +
    notification, không tự đổi trạng thái đơn (Q93: cho gửi nhiều lần, không chặn trùng).
    Không có `version` trong request body vì thao tác này không sửa chính hàng `orders`, nhưng
    vẫn `with_for_update()` — review: khoá hàng để chờ transaction `request_revision` (QLKT,
    dùng `lock_order`) đang chạy cùng lúc commit trước, tránh ghi `revision_requested` "trễ" (seq
    cao hơn) đè lên trạng thái đã được QLKT xử lý, khiến badge báo sai "chưa xử lý"."""
    stmt = select(Order).where(Order.id == order_id).with_for_update()
    order = get_in_scope_or_404(session, stmt, actor, RULES)
    _require_completed(order)
    event = audit.record(
        session,
        actor_id=actor.id,
        entity_type="ORDER",
        entity_id=order.id,
        action="revision_requested",
        data={"note": body.note},
        request_id=request_id,
    )
    notifications.notify_order_csk_revision_requested(session, order, body.note)
    return OrderRevisionRequestOut(
        id=event.id, order_id=order.id, note=body.note, requested_by=actor.id, requested_at=event.occurred_at
    )


def _vn_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=VIETNAM)


def get_csat_summary(
    session: Session,
    actor: Actor,
    *,
    date_from: date | None,
    date_to: date | None,
    customer_id: uuid.UUID | None,
    created_by: uuid.UUID | None,
    now: datetime,
) -> dict[str, int]:
    today_vn = now.astimezone(VIETNAM).date()
    date_from = date_from or today_vn.replace(day=1)
    date_to = date_to or today_vn
    query = apply_scope(
        select(Order.csat_rating, func.count())
        .where(
            Order.status == "COMPLETED",
            Order.completed_at >= _vn_day_start_utc(date_from),
            Order.completed_at < _vn_day_start_utc(date_to + timedelta(days=1)),
        )
        .group_by(Order.csat_rating),
        actor,
        RULES,
    )
    if customer_id is not None:
        query = query.where(Order.customer_id == customer_id)
    if created_by is not None:
        query = query.where(Order.created_by == created_by)
    counts = {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0, "none": 0}
    for rating, count in session.execute(query).all():
        counts[str(rating) if rating is not None else "none"] = count
    return counts


def update_order(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderUpdate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = lock_order(session, actor, order_id, body.version)
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
    return _out(session, order, actor, specs)


def _find_line(order: Order, line_id: uuid.UUID) -> OrderLine:
    line = next((candidate for candidate in order.lines if candidate.id == line_id), None)
    if line is None:
        raise _not_found(NOT_FOUND_LINE)
    return line


def _build_line(session: Session, order: Order, body: OrderLineCreate) -> OrderLine:
    # M15-06: dòng hàng mới chỉ được chọn từ danh mục; dòng CUSTOM lịch sử vẫn đọc/sửa được
    # qua `_apply_line_changes`, chỉ `_build_line` (tạo mới) chặn ở đây.
    if body.item_type == "CUSTOM":
        raise _field_error("item_type", CUSTOM_LINE_DISABLED, code="invalid")
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

    return _diff_fields(before, {field: getattr(line, field) for field in _LINE_DIFF_FIELDS})


def add_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderLineCreate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = lock_order(session, actor, order_id, body.version)
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
    return _out(session, order, actor, specs)


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
    order = lock_order(session, actor, order_id, body.version)
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
    return _out(session, order, actor, specs)


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
    order = lock_order(session, actor, order_id, body.version)
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
    return _out(session, order, actor, specs)


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
    order = lock_order(session, actor, order_id, body.version)
    _require_editable_after_submit(order)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})

    sent = {
        field: ("" if field in NON_NULL_TEXT_FIELDS and changes[field] is None else changes[field])
        for field in CONTACT_FIELDS
        if field in changes
    }
    before = {field: getattr(order, field) for field in sent}
    for field, value in sent.items():
        setattr(order, field, value)
    diff = _diff_fields(before, sent)

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
    return _out(session, order, actor, specs)


def add_line_after_submit(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderLineCreate,
    *,
    specs: Specs,
    request_id: str | None = None,
) -> OrderDetail:
    order = lock_order(session, actor, order_id, body.version)
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
    return _out(session, order, actor, specs)


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
    order = lock_order(session, actor, order_id, body.version)
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
    return _out(session, order, actor, specs)


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
    order = lock_order(session, actor, order_id, body.version)
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
    return _out(session, order, actor, specs)
