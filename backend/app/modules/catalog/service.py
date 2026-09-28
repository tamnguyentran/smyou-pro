"""Product & service catalog use cases (M2-01a, M2-02). Callers own the transaction; these never commit."""

import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import cast

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.core.config import Settings
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.catalog import import_csv
from app.modules.catalog.models import Product, Service
from app.modules.catalog.schemas import (
    ImportCommitResult,
    ImportPreview,
    ProductCreate,
    ProductOut,
    ProductPage,
    ProductUpdate,
    ServiceCreate,
    ServiceOut,
    ServicePage,
    ServiceUpdate,
)
from app.modules.files import service as files

logger = logging.getLogger(__name__)

SKU_TAKEN = "Mã hàng đã được dùng cho sản phẩm khác."
CODE_TAKEN = "Mã dịch vụ đã được dùng cho dịch vụ khác."
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


def _out_service(service: Service) -> ServiceOut:
    hours = service.default_estimated_hours
    return ServiceOut(
        id=service.id,
        code=service.code,
        name=service.name,
        category=service.category,
        unit=service.unit,
        price=service.price,
        vat_rate=service.vat_rate,
        price_fixed=service.price_fixed,
        default_estimated_hours=hours if hours is None else hours.quantize(Decimal("0.01")),
        description=service.description,
        is_active=service.is_active,
        version=service.version,
    )


def _log_service(action: str, service: Service, actor: Actor) -> None:
    logger.info("service %s: %s by %s", service.id, action, actor.id)


def _code_taken() -> AppError:
    return AppError(
        409, "CONFLICT", CODE_TAKEN, errors=[{"field": "code", "code": "taken", "message": CODE_TAKEN}]
    )


def _flush_service(session: Session) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint == "uq_services_code":
            raise _code_taken() from exc
        raise


def _service_locked(session: Session, actor: Actor, service_id: uuid.UUID, version: int) -> Service:
    stmt = apply_scope(select(Service).where(Service.id == service_id), actor, RULES)
    stmt = stmt.with_for_update().execution_options(populate_existing=True)
    service = session.scalars(stmt).one_or_none()
    if service is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy dịch vụ.")
    if service.version != version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    return service


def list_services(
    session: Session,
    actor: Actor,
    *,
    q: str | None,
    category: str | None,
    unit: str | None,
    is_active: bool | None,
    limit: int,
    offset: int,
) -> ServicePage:
    query = apply_scope(select(Service), actor, RULES)
    if q and q.strip():
        pattern = _like(q.strip())
        query = query.where(
            or_(Service.code.ilike(pattern), func.unaccent(Service.name).ilike(func.unaccent(pattern)))
        )
    if category is not None:
        query = query.where(Service.category == category)
    if unit is not None:
        query = query.where(Service.unit == unit)
    if is_active is not None:
        query = query.where(Service.is_active.is_(is_active))
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered = query.order_by(Service.code)
    rows = session.scalars(ordered.limit(limit).offset(offset)).all()
    return ServicePage(items=[_out_service(s) for s in rows], total=total, limit=limit, offset=offset)


def get_service(session: Session, actor: Actor, service_id: uuid.UUID) -> ServiceOut:
    service: Service = get_in_scope_or_404(
        session, select(Service).where(Service.id == service_id), actor, RULES
    )
    return _out_service(service)


def create_service(
    session: Session, actor: Actor, body: ServiceCreate, *, request_id: str | None = None
) -> ServiceOut:
    service = Service(
        code=body.code,
        name=body.name,
        category=body.category,
        unit=body.unit,
        price=body.price,
        vat_rate=body.vat_rate,
        price_fixed=body.price_fixed,
        default_estimated_hours=body.default_estimated_hours,
        description=body.description,
        is_active=True,
        version=1,
    )
    session.add(service)
    _flush_service(session)
    _log_service("create", service, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="SERVICE",
        entity_id=service.id,
        action="create",
        request_id=request_id,
    )
    return _out_service(service)


def update_service(
    session: Session,
    actor: Actor,
    service_id: uuid.UUID,
    body: ServiceUpdate,
    *,
    request_id: str | None = None,
) -> ServiceOut:
    service = _service_locked(session, actor, service_id, body.version)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    changed_fields = sorted(f for f, value in changes.items() if getattr(service, f) != value)
    for field in changed_fields:
        setattr(service, field, changes[field])
    service.version += 1
    _flush_service(session)
    _log_service("update", service, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="SERVICE",
        entity_id=service.id,
        action="update",
        data={"changed_fields": changed_fields},
        request_id=request_id,
    )
    return _out_service(service)


def deactivate_service(
    session: Session, actor: Actor, service_id: uuid.UUID, *, version: int, request_id: str | None = None
) -> ServiceOut:
    service = _service_locked(session, actor, service_id, version)
    if not service.is_active:
        raise AppError(409, "INVALID_TRANSITION", "Dịch vụ đã ngừng kinh doanh.")
    service.is_active = False
    service.version += 1
    session.flush()
    _log_service("deactivate", service, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="SERVICE",
        entity_id=service.id,
        action="deactivate",
        from_status="ACTIVE",
        to_status="INACTIVE",
        request_id=request_id,
    )
    return _out_service(service)


def activate_service(
    session: Session, actor: Actor, service_id: uuid.UUID, *, version: int, request_id: str | None = None
) -> ServiceOut:
    service = _service_locked(session, actor, service_id, version)
    if service.is_active:
        raise AppError(409, "INVALID_TRANSITION", "Dịch vụ đang hoạt động.")
    service.is_active = True
    service.version += 1
    session.flush()
    _log_service("activate", service, actor)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="SERVICE",
        entity_id=service.id,
        action="activate",
        from_status="INACTIVE",
        to_status="ACTIVE",
        request_id=request_id,
    )
    return _out_service(service)


def _import_products(session: Session, file_bytes: bytes) -> list[import_csv.RowResult]:
    rows = import_csv.read_rows(file_bytes, "product")
    results = import_csv.validate_rows("product", rows)
    import_csv.mark_taken(session, "product", results, taken_message=SKU_TAKEN)
    return results


def import_products_preview(session: Session, actor: Actor, file_bytes: bytes) -> ImportPreview:
    results = _import_products(session, file_bytes)
    return ImportPreview(**import_csv.build_preview(results))


def import_products_commit(
    session: Session, actor: Actor, file_bytes: bytes, *, request_id: str | None = None
) -> ImportCommitResult:
    results = _import_products(session, file_bytes)
    preview = import_csv.build_preview(results)
    if preview["invalid_count"] > 0:
        raise AppError(422, "IMPORT_HAS_ERRORS", "Còn dòng lỗi, chưa nhập được dữ liệu nào.", extra=preview)
    created = 0
    for result in results:
        if result.parsed is None:
            continue
        create_product(session, actor, cast(ProductCreate, result.parsed), request_id=request_id)
        created += 1
    return ImportCommitResult(created=created)


def _import_services(session: Session, file_bytes: bytes) -> list[import_csv.RowResult]:
    rows = import_csv.read_rows(file_bytes, "service")
    results = import_csv.validate_rows("service", rows)
    import_csv.mark_taken(session, "service", results, taken_message=CODE_TAKEN)
    return results


def import_services_preview(session: Session, actor: Actor, file_bytes: bytes) -> ImportPreview:
    results = _import_services(session, file_bytes)
    return ImportPreview(**import_csv.build_preview(results))


def import_services_commit(
    session: Session, actor: Actor, file_bytes: bytes, *, request_id: str | None = None
) -> ImportCommitResult:
    results = _import_services(session, file_bytes)
    preview = import_csv.build_preview(results)
    if preview["invalid_count"] > 0:
        raise AppError(422, "IMPORT_HAS_ERRORS", "Còn dòng lỗi, chưa nhập được dữ liệu nào.", extra=preview)
    created = 0
    for result in results:
        if result.parsed is None:
            continue
        create_service(session, actor, cast(ServiceCreate, result.parsed), request_id=request_id)
        created += 1
    return ImportCommitResult(created=created)
