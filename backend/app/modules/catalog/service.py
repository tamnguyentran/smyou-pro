"""Product catalog use cases (M2-01a). Callers own the transaction; these never commit."""

import logging
import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.core.config import Settings
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.catalog.models import Product
from app.modules.catalog.schemas import ProductCreate, ProductOut, ProductPage, ProductUpdate
from app.modules.files import service as files

logger = logging.getLogger(__name__)

SKU_TAKEN = "Mã hàng đã được dùng cho sản phẩm khác."
# catalog.read / catalog.manage are `all` for every role holding them today; see employees/service.py
# for why this stays an explicit (empty) map rather than an implicit "no rule = no restriction".
RULES: ScopeRules = {}


def _out(product: Product) -> ProductOut:
    return ProductOut(
        id=product.id,
        sku=product.sku,
        name=product.name,
        category=product.category,
        brand=product.brand,
        unit=product.unit,
        price=product.price,
        vat_rate=product.vat_rate,
        price_fixed=product.price_fixed,
        warranty_months=product.warranty_months,
        specs=product.specs,
        image_attachment_id=product.image_attachment_id,
        is_active=product.is_active,
        version=product.version,
    )


def _log(action: str, product: Product, actor: Actor) -> None:
    logger.info("product %s: %s by %s", product.id, action, actor.id)


def _sku_taken() -> AppError:
    return AppError(
        409, "CONFLICT", SKU_TAKEN, errors=[{"field": "sku", "code": "taken", "message": SKU_TAKEN}]
    )


def _flush(session: Session) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint == "uq_products_sku":
            raise _sku_taken() from exc
        raise


def _locked(session: Session, actor: Actor, product_id: uuid.UUID, version: int) -> Product:
    stmt = apply_scope(select(Product).where(Product.id == product_id), actor, RULES)
    stmt = stmt.with_for_update().execution_options(populate_existing=True)
    product = session.scalars(stmt).one_or_none()
    if product is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy sản phẩm.")
    if product.version != version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    return product


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_products(
    session: Session,
    actor: Actor,
    *,
    q: str | None,
    category: str | None,
    brand: str | None,
    is_active: bool | None,
    limit: int,
    offset: int,
) -> ProductPage:
    query = apply_scope(select(Product), actor, RULES)
    if q and q.strip():
        pattern = _like(q.strip())
        query = query.where(
            or_(Product.sku.ilike(pattern), func.unaccent(Product.name).ilike(func.unaccent(pattern)))
        )
    if category is not None:
        query = query.where(Product.category == category)
    if brand is not None:
        query = query.where(Product.brand == brand)
    if is_active is not None:
        query = query.where(Product.is_active.is_(is_active))
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered = query.order_by(Product.sku)
    rows = session.scalars(ordered.limit(limit).offset(offset)).all()
    return ProductPage(items=[_out(p) for p in rows], total=total, limit=limit, offset=offset)


def get_product(session: Session, actor: Actor, product_id: uuid.UUID) -> ProductOut:
    product: Product = get_in_scope_or_404(
        session, select(Product).where(Product.id == product_id), actor, RULES
    )
    return _out(product)


def create_product(
    session: Session, actor: Actor, body: ProductCreate, *, request_id: str | None = None
) -> ProductOut:
    product = Product(
        sku=body.sku,
        name=body.name,
        category=body.category,
        brand=body.brand,
        unit=body.unit,
        price=body.price,
        vat_rate=body.vat_rate,
        price_fixed=body.price_fixed,
        warranty_months=body.warranty_months,
        specs=body.specs,
        is_active=True,
        version=1,
    )
    session.add(product)
    _flush(session)
    _log("create", product, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="PRODUCT",
        entity_id=product.id,
        action="create",
        request_id=request_id,
    )
    return _out(product)


def update_product(
    session: Session,
    actor: Actor,
    product_id: uuid.UUID,
    body: ProductUpdate,
    *,
    request_id: str | None = None,
) -> ProductOut:
    product = _locked(session, actor, product_id, body.version)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    changed_fields = sorted(f for f, value in changes.items() if getattr(product, f) != value)
    for field in changed_fields:
        setattr(product, field, changes[field])
    product.version += 1
    _flush(session)
    _log("update", product, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="PRODUCT",
        entity_id=product.id,
        action="update",
        data={"changed_fields": changed_fields},
        request_id=request_id,
    )
    return _out(product)


def deactivate(
    session: Session, actor: Actor, product_id: uuid.UUID, *, version: int, request_id: str | None = None
) -> ProductOut:
    product = _locked(session, actor, product_id, version)
    if not product.is_active:
        raise AppError(409, "INVALID_TRANSITION", "Sản phẩm đã ngừng kinh doanh.")
    product.is_active = False
    product.version += 1
    session.flush()
    _log("deactivate", product, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="PRODUCT",
        entity_id=product.id,
        action="deactivate",
        from_status="ACTIVE",
        to_status="INACTIVE",
        request_id=request_id,
    )
    return _out(product)


def activate(
    session: Session, actor: Actor, product_id: uuid.UUID, *, version: int, request_id: str | None = None
) -> ProductOut:
    product = _locked(session, actor, product_id, version)
    if product.is_active:
        raise AppError(409, "INVALID_TRANSITION", "Sản phẩm đang hoạt động.")
    product.is_active = True
    product.version += 1
    session.flush()
    _log("activate", product, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="PRODUCT",
        entity_id=product.id,
        action="activate",
        from_status="INACTIVE",
        to_status="ACTIVE",
        request_id=request_id,
    )
    return _out(product)


def upload_image(
    session: Session,
    actor: Actor,
    product_id: uuid.UUID,
    *,
    file_bytes: bytes,
    filename: str,
    declared_mime: str,
    settings: Settings,
    now: datetime,
    request_id: str | None = None,
) -> uuid.UUID:
    product: Product = get_in_scope_or_404(
        session, select(Product).where(Product.id == product_id), actor, RULES
    )
    attachment = files.store_image(
        session,
        owner_type="PRODUCT",
        owner_id=product.id,
        kind="PRODUCT_IMAGE",
        file_bytes=file_bytes,
        filename=filename,
        declared_mime=declared_mime,
        uploaded_by=actor.id,
        settings=settings,
        now=now,
    )
    product.image_attachment_id = attachment.id
    session.flush()
    _log("image", product, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="PRODUCT",
        entity_id=product.id,
        action="image",
        data={"image_attachment_id": str(attachment.id)},
        request_id=request_id,
    )
    return attachment.id
