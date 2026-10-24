"""`/api/v1/product-service-groups` use cases (M16-07). Callers own the transaction; never commit."""

import logging
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.core.errors import AppError
from app.modules.catalog.models import ProductServiceGroup
from app.modules.catalog.schemas import (
    ProductServiceGroupCreate,
    ProductServiceGroupOut,
    ProductServiceGroupPage,
    ProductServiceGroupUpdate,
)

logger = logging.getLogger(__name__)

NAME_TAKEN = "Tên nhóm đã được dùng cho nhóm khác đang hoạt động."
# catalog.read / catalog.manage are `all` for every role holding them — see catalog/service.py.
RULES: ScopeRules = {}


def _log(action: str, group: ProductServiceGroup, actor: Actor) -> None:
    logger.info("product_service_group %s: %s by %s", group.id, action, actor.id)


def _name_taken() -> AppError:
    return AppError(
        409, "CONFLICT", NAME_TAKEN, errors=[{"field": "name", "code": "taken", "message": NAME_TAKEN}]
    )


def _out(group: ProductServiceGroup) -> ProductServiceGroupOut:
    return ProductServiceGroupOut(
        id=group.id, name=group.name, is_active=group.is_active, version=group.version
    )


def _flush(session: Session) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint == "uq_product_service_groups_name_active":
            raise _name_taken() from exc
        raise


def _locked(session: Session, actor: Actor, group_id: uuid.UUID, version: int) -> ProductServiceGroup:
    stmt = apply_scope(select(ProductServiceGroup).where(ProductServiceGroup.id == group_id), actor, RULES)
    stmt = stmt.with_for_update().execution_options(populate_existing=True)
    group = session.scalars(stmt).one_or_none()
    if group is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy nhóm.")
    if group.version != version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    return group


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_groups(
    session: Session, actor: Actor, *, q: str | None, is_active: bool | None, limit: int, offset: int
) -> ProductServiceGroupPage:
    query = apply_scope(select(ProductServiceGroup), actor, RULES)
    if q and q.strip():
        pattern = _like(q.strip())
        query = query.where(
            or_(
                ProductServiceGroup.name.ilike(pattern),
                func.unaccent(ProductServiceGroup.name).ilike(func.unaccent(pattern)),
            )
        )
    if is_active is not None:
        query = query.where(ProductServiceGroup.is_active.is_(is_active))
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered = query.order_by(ProductServiceGroup.name)
    rows = session.scalars(ordered.limit(limit).offset(offset)).all()
    return ProductServiceGroupPage(items=[_out(g) for g in rows], total=total, limit=limit, offset=offset)


def get_group(session: Session, actor: Actor, group_id: uuid.UUID) -> ProductServiceGroupOut:
    group: ProductServiceGroup = get_in_scope_or_404(
        session, select(ProductServiceGroup).where(ProductServiceGroup.id == group_id), actor, RULES
    )
    return _out(group)


def create_group(session: Session, actor: Actor, body: ProductServiceGroupCreate) -> ProductServiceGroupOut:
    group = ProductServiceGroup(name=body.name, is_active=True, version=1)
    session.add(group)
    _flush(session)
    _log("create", group, actor)
    return _out(group)


def update_group(
    session: Session, actor: Actor, group_id: uuid.UUID, body: ProductServiceGroupUpdate
) -> ProductServiceGroupOut:
    group = _locked(session, actor, group_id, body.version)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    for field, value in changes.items():
        setattr(group, field, value)
    group.version += 1
    _flush(session)
    _log("update", group, actor)
    return _out(group)


def deactivate(
    session: Session, actor: Actor, group_id: uuid.UUID, *, version: int
) -> ProductServiceGroupOut:
    group = _locked(session, actor, group_id, version)
    if not group.is_active:
        raise AppError(409, "INVALID_TRANSITION", "Nhóm đã ngừng hoạt động.")
    group.is_active = False
    group.version += 1
    session.flush()
    _log("deactivate", group, actor)
    return _out(group)


def activate(session: Session, actor: Actor, group_id: uuid.UUID, *, version: int) -> ProductServiceGroupOut:
    group = _locked(session, actor, group_id, version)
    if group.is_active:
        raise AppError(409, "INVALID_TRANSITION", "Nhóm đang hoạt động.")
    group.is_active = True
    group.version += 1
    _flush(session)
    _log("activate", group, actor)
    return _out(group)
