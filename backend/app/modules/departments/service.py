"""`/api/v1/departments` use cases (M17-02a). Callers own the transaction; never commit."""

import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.departments.models import Department
from app.modules.departments.schemas import DepartmentOut, DepartmentPage, DepartmentUpdate

DUPLICATE_NAME = "Tên phòng ban đã tồn tại."
# employee.read / employee.manage are `all` for every role holding them — see employees/service.py.
RULES: ScopeRules = {}


def _duplicate_name() -> AppError:
    return AppError(
        409,
        "DUPLICATE_NAME",
        DUPLICATE_NAME,
        errors=[{"field": "name", "code": "taken", "message": DUPLICATE_NAME}],
    )


def _flush(session: Session) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint == "uq_departments_name_active":
            raise _duplicate_name() from exc
        raise


def _save(
    session: Session,
    actor: Actor,
    department: Department,
    action: str,
    data: dict[str, Any],
    request_id: str | None,
) -> DepartmentOut:
    """Flush (mapping the unique index to DUPLICATE_NAME), audit, and return fresh timestamps."""
    _flush(session)
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="DEPARTMENT",
        entity_id=department.id,
        action=action,
        data=data,
        request_id=request_id,
    )
    session.refresh(department)
    return DepartmentOut.model_validate(department)


def _locked(session: Session, actor: Actor, department_id: uuid.UUID, version: int) -> Department:
    stmt = apply_scope(select(Department).where(Department.id == department_id), actor, RULES)
    stmt = stmt.with_for_update().execution_options(populate_existing=True)
    department = session.scalars(stmt).one_or_none()
    if department is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy phòng ban.")
    if department.version != version:
        raise AppError(409, "STALE_VERSION", "Dữ liệu đã thay đổi, vui lòng tải lại.")
    return department


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_departments(
    session: Session, actor: Actor, *, q: str | None, is_active: bool | None, limit: int, offset: int
) -> DepartmentPage:
    query = apply_scope(select(Department), actor, RULES)
    if q and q.strip():
        pattern = _like(q.strip())
        query = query.where(
            or_(
                Department.name.ilike(pattern),
                func.unaccent(Department.name).ilike(func.unaccent(pattern)),
            )
        )
    if is_active is not None:
        query = query.where(Department.is_active.is_(is_active))
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    # Accent-free ordering keeps "Kế…" < "Kinh…" < "Kỹ…" regardless of the DB collation.
    ordered = query.order_by(func.lower(func.unaccent(Department.name)), Department.name, Department.id)
    rows = session.scalars(ordered.limit(limit).offset(offset)).all()
    return DepartmentPage(
        items=[DepartmentOut.model_validate(d) for d in rows], total=total, limit=limit, offset=offset
    )


def get_department(session: Session, actor: Actor, department_id: uuid.UUID) -> DepartmentOut:
    department: Department = get_in_scope_or_404(
        session, select(Department).where(Department.id == department_id), actor, RULES
    )
    return DepartmentOut.model_validate(department)


def create_department(
    session: Session, actor: Actor, name: str, *, request_id: str | None = None
) -> DepartmentOut:
    department = Department(name=name, is_active=True, version=1)
    session.add(department)
    return _save(session, actor, department, "create", {"name": name}, request_id)


def rename_department(
    session: Session,
    actor: Actor,
    department_id: uuid.UUID,
    body: DepartmentUpdate,
    *,
    request_id: str | None = None,
) -> DepartmentOut:
    department = _locked(session, actor, department_id, body.version)
    if department.name == body.name:
        # No-op edit: keep the version so other open forms don't get a spurious STALE_VERSION.
        return DepartmentOut.model_validate(department)
    old_name = department.name
    department.name = body.name
    department.version += 1
    return _save(
        session, actor, department, "rename", {"name": {"from": old_name, "to": body.name}}, request_id
    )


def set_active(
    session: Session,
    actor: Actor,
    department_id: uuid.UUID,
    *,
    active: bool,
    version: int,
    request_id: str | None = None,
) -> DepartmentOut:
    department = _locked(session, actor, department_id, version)
    if department.is_active == active:
        message = "Phòng ban đang hoạt động." if active else "Phòng ban đã ngừng hoạt động."
        raise AppError(409, "INVALID_STATE", message)
    department.is_active = active
    department.version += 1
    return _save(session, actor, department, "activate" if active else "deactivate", {}, request_id)
