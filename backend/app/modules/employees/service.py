"""Employee management use cases (M1-04a). Callers own the transaction; these never commit.

Every command logs "employee <target>: <action> by <actor>" — never a password (Q38).
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.core.errors import AppError
from app.core.security import hash_password
from app.core.sequences import next_value
from app.modules.employees.domain import employee_code, last_code_number, temporary_password
from app.modules.employees.schemas import (
    EmployeeCreate,
    EmployeeOut,
    EmployeePage,
    EmployeeUpdate,
    EmployeeWithPassword,
)
from app.modules.identity.models import ROLES, Employee, EmployeeRole
from app.modules.identity.service import revoke_all_sessions

logger = logging.getLogger(__name__)

# One lock for every change that can remove an active Manager: the "still ≥ 1 active Manager"
# count then always sees the other request's committed result (AC-EMP-008).
_MANAGER_LOCK = 20260926_01
EMAIL_TAKEN = "Email đã được dùng cho nhân viên khác."
# employee.read / employee.manage are `all` for every role holding them today; any narrower scope
# added to permissions.yaml later fails closed (no rule → no rows) until a rule is written here.
RULES: ScopeRules = {}


def _out(employee: Employee, now: datetime) -> EmployeeOut:
    held = {r.role for r in employee.roles}
    return EmployeeOut(
        id=employee.id,
        code=employee.code,
        full_name=employee.full_name,
        email=employee.email,
        phone=employee.phone,
        department=employee.department,
        title=employee.title,
        roles=[role for role in ROLES if role in held],
        is_active=employee.is_active,
        is_locked=employee.locked_until is not None and now < employee.locked_until,
        must_change_password=employee.must_change_password,
        version=employee.version,
    )


def _log(action: str, employee: Employee, actor: Actor) -> None:
    logger.info("employee %s: %s by %s", employee.id, action, actor.id)


def _email_taken() -> AppError:
    return AppError(
        409, "CONFLICT", EMAIL_TAKEN, errors=[{"field": "email", "code": "taken", "message": EMAIL_TAKEN}]
    )


def _ensure_email_free(session: Session, email: str, *, except_id: uuid.UUID | None = None) -> None:
    query = select(Employee.id).where(Employee.email == email)  # citext: case-insensitive
    if except_id is not None:
        query = query.where(Employee.id != except_id)
    if session.scalar(query) is not None:
        raise _email_taken()


def _flush(session: Session) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint == "uq_employees_email":  # a concurrent request took the email meanwhile
            raise _email_taken() from exc
        raise


def _locked(session: Session, employee_id: uuid.UUID, version: int) -> Employee:
    employee = session.get(Employee, employee_id, with_for_update=True, populate_existing=True)
    if employee is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy nhân viên.")
    if employee.version != version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    return employee


def _serialize_manager_changes(session: Session) -> None:
    session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _MANAGER_LOCK})


def _require_another_active_manager(session: Session, employee_id: uuid.UUID) -> None:
    others = session.scalar(
        select(func.count())
        .select_from(Employee)
        .join(EmployeeRole, EmployeeRole.employee_id == Employee.id)
        .where(EmployeeRole.role == "MANAGER", Employee.is_active, Employee.id != employee_id)
    )
    if not others:
        raise AppError(409, "LAST_MANAGER", "Phải còn ít nhất một Quản lý chung đang hoạt động.")


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_employees(
    session: Session,
    actor: Actor,
    *,
    q: str | None,
    role: str | None,
    is_active: bool | None,
    limit: int,
    offset: int,
    now: datetime,
) -> EmployeePage:
    query = apply_scope(select(Employee), actor, RULES)
    if q and q.strip():
        pattern = _like(q.strip())
        query = query.where(
            or_(
                func.unaccent(Employee.full_name).ilike(func.unaccent(pattern)),
                Employee.code.ilike(pattern),
                Employee.email.ilike(pattern),
                Employee.phone.ilike(pattern),
            )
        )
    if role is not None:
        query = query.where(Employee.roles.any(EmployeeRole.role == role))
    if is_active is not None:
        query = query.where(Employee.is_active.is_(is_active))
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    # NV999 < NV1000: shorter codes first, then alphabetical
    ordered = query.order_by(func.length(Employee.code), Employee.code)
    rows = session.scalars(ordered.limit(limit).offset(offset)).all()
    return EmployeePage(items=[_out(e, now) for e in rows], total=total, limit=limit, offset=offset)


def get_employee(session: Session, actor: Actor, employee_id: uuid.UUID, *, now: datetime) -> EmployeeOut:
    employee: Employee = get_in_scope_or_404(
        session, select(Employee).where(Employee.id == employee_id), actor, RULES
    )
    return _out(employee, now)


def create_employee(
    session: Session, actor: Actor, body: EmployeeCreate, *, now: datetime
) -> EmployeeWithPassword:
    _ensure_email_free(session, body.email)
    codes = list(session.scalars(select(Employee.code)))
    number = next_value(session, "employee", at_least_after=last_code_number(codes))
    password = temporary_password(body.email)
    employee = Employee(
        code=employee_code(number),
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        department=body.department,
        title=body.title or None,
        password_hash=hash_password(password),
        must_change_password=True,
        is_active=True,
        failed_login_count=0,
        password_changed_at=now,
        version=1,
        roles=[EmployeeRole(role=role) for role in dict.fromkeys(body.roles)],
    )
    session.add(employee)
    _flush(session)
    _log("create", employee, actor)
    return EmployeeWithPassword(employee=_out(employee, now), temporary_password=password)


def update_employee(
    session: Session, actor: Actor, employee_id: uuid.UUID, body: EmployeeUpdate, *, now: datetime
) -> EmployeeOut:
    employee = _locked(session, employee_id, body.version)
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    if "email" in changes and changes["email"] is not None:
        _ensure_email_free(session, changes["email"], except_id=employee.id)
    for field in ("full_name", "email", "department"):
        if changes.get(field) is not None:
            setattr(employee, field, changes[field])
    for field in ("phone", "title"):
        if field in changes:
            setattr(employee, field, changes[field] or None)
    employee.version += 1
    _flush(session)
    _log("update", employee, actor)
    return _out(employee, now)


def set_roles(
    session: Session, actor: Actor, employee_id: uuid.UUID, *, version: int, roles: list[str], now: datetime
) -> EmployeeOut:
    _serialize_manager_changes(session)
    employee = _locked(session, employee_id, version)
    wanted = set(roles)
    held = {r.role for r in employee.roles}
    if "MANAGER" in held and "MANAGER" not in wanted and employee.is_active:
        _require_another_active_manager(session, employee.id)
    employee.roles = [r for r in employee.roles if r.role in wanted]
    employee.roles.extend(EmployeeRole(role=role) for role in ROLES if role in wanted - held)
    employee.version += 1
    session.flush()
    _log(f"roles {sorted(wanted)}", employee, actor)
    return _out(employee, now)


def deactivate(
    session: Session, actor: Actor, employee_id: uuid.UUID, *, version: int, now: datetime
) -> EmployeeOut:
    if employee_id == actor.id:
        raise AppError(409, "CANNOT_DEACTIVATE_SELF", "Bạn không thể tự khoá tài khoản của mình.")
    _serialize_manager_changes(session)
    employee = _locked(session, employee_id, version)
    if not employee.is_active:
        raise AppError(409, "INVALID_TRANSITION", "Tài khoản đã bị khoá.")
    if any(r.role == "MANAGER" for r in employee.roles):
        _require_another_active_manager(session, employee.id)
    employee.is_active = False
    employee.version += 1
    revoke_all_sessions(session, employee.id, now=now)  # signed out on every device (Q34)
    session.flush()
    _log("deactivate", employee, actor)
    return _out(employee, now)


def activate(
    session: Session, actor: Actor, employee_id: uuid.UUID, *, version: int, now: datetime
) -> EmployeeOut:
    employee = _locked(session, employee_id, version)
    if employee.is_active:
        raise AppError(409, "INVALID_TRANSITION", "Tài khoản đang hoạt động.")
    employee.is_active = True
    employee.version += 1
    session.flush()
    _log("activate", employee, actor)
    return _out(employee, now)


def reset_password(
    session: Session, actor: Actor, employee_id: uuid.UUID, *, version: int, now: datetime
) -> EmployeeWithPassword:
    employee = _locked(session, employee_id, version)
    password = temporary_password(employee.email)
    employee.password_hash = hash_password(password)
    employee.must_change_password = True
    employee.password_changed_at = now  # also invalidates access tokens already issued
    employee.failed_login_count = 0
    employee.locked_until = None  # clears a temporary lock-out (Q37)
    employee.version += 1
    revoke_all_sessions(session, employee.id, now=now)
    session.flush()
    _log("reset-password", employee, actor)
    return EmployeeWithPassword(employee=_out(employee, now), temporary_password=password)
