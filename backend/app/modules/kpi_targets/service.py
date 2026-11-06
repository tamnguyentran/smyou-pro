"""`/api/v1/kpi-targets` use cases (M21-01a). Callers own the transaction; never commit."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.departments.models import Department
from app.modules.identity.models import Employee
from app.modules.kpi_targets.models import EmployeeKpiTarget
from app.modules.kpi_targets.schemas import (
    KpiTargetCopy,
    KpiTargetCopyResult,
    KpiTargetPage,
    KpiTargetRowOut,
    KpiTargetSet,
)

ENTITY_TYPE = "KPI_TARGET"
MAX_COPY_MONTHS = 12


def _stale() -> AppError:
    return AppError(409, "STALE_VERSION", "Dữ liệu đã thay đổi, vui lòng tải lại.")


def parse_month(value: str) -> date:
    """`YYYY-MM` (already pattern-checked by the schema) → first day of that month."""
    year, month = value.split("-")
    return date(int(year), int(month), 1)


def _label(month: date) -> str:
    return month.strftime("%Y-%m")


def _add_months(month: date, count: int) -> date:
    index = month.year * 12 + month.month - 1 + count
    return date(index // 12, index % 12 + 1, 1)


def _months_between(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + end.month - start.month


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _rows_query(month: date) -> Any:
    return (
        select(Employee, Department.name, EmployeeKpiTarget)
        .outerjoin(Department, Department.id == Employee.department_id)
        .outerjoin(
            EmployeeKpiTarget,
            and_(EmployeeKpiTarget.employee_id == Employee.id, EmployeeKpiTarget.month == month),
        )
    )


def _row(
    employee: Employee, department_name: str | None, target: EmployeeKpiTarget | None
) -> KpiTargetRowOut:
    return KpiTargetRowOut(
        employee_id=employee.id,
        employee_code=employee.code,
        employee_name=employee.full_name,
        department_name=department_name,
        employee_status="ACTIVE" if employee.is_active else "INACTIVE",
        phone=employee.phone,
        email=employee.email,
        target=target.net_revenue_target if target else None,
        version=target.version if target else None,
        updated_at=target.updated_at if target else None,
    )


def list_targets(
    session: Session,
    actor: Actor,
    *,
    month: str,
    department_id: uuid.UUID | None,
    q: str | None,
    limit: int,
    offset: int,
) -> KpiTargetPage:
    first_day = parse_month(month)
    # Everyone still working, plus leavers only in the months they had a target (history stays visible).
    query = _rows_query(first_day).where(or_(Employee.is_active, EmployeeKpiTarget.id.is_not(None)))
    if department_id is not None:
        query = query.where(Employee.department_id == department_id)
    if q and q.strip():
        # Same matching as GET /employees (M20-08).
        pattern = _like(q.strip())
        query = query.where(
            or_(
                func.unaccent(Employee.full_name).ilike(func.unaccent(pattern)),
                Employee.code.ilike(pattern),
                Employee.username.ilike(pattern),
                Employee.email.ilike(pattern),
                Employee.phone.ilike(pattern),
            )
        )
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    # NV999 < NV1000: shorter codes first, then alphabetical
    ordered = query.order_by(func.length(Employee.code), Employee.code).limit(limit).offset(offset)
    return KpiTargetPage(
        items=[_row(e, d, t) for e, d, t in session.execute(ordered).all()],
        total=total,
        limit=limit,
        offset=offset,
    )


def _employee_or_404(session: Session, employee_id: uuid.UUID) -> Employee:
    employee = session.get(Employee, employee_id)
    if employee is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy nhân viên.")
    return employee


def _locked_target(session: Session, employee_id: uuid.UUID, month: date) -> EmployeeKpiTarget | None:
    stmt = (
        select(EmployeeKpiTarget)
        .where(EmployeeKpiTarget.employee_id == employee_id, EmployeeKpiTarget.month == month)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return session.scalars(stmt).one_or_none()


def _record(
    session: Session,
    actor: Actor,
    entity_id: uuid.UUID,
    action: str,
    data: dict[str, Any],
    request_id: str | None,
) -> None:
    audit.record(
        session,
        actor_id=actor.id,
        entity_type=ENTITY_TYPE,
        entity_id=entity_id,
        action=action,
        data=data,
        request_id=request_id,
    )


def set_target(
    session: Session,
    actor: Actor,
    employee_id: uuid.UUID,
    month: str,
    body: KpiTargetSet,
    *,
    request_id: str | None = None,
) -> KpiTargetRowOut:
    employee = _employee_or_404(session, employee_id)
    first_day = parse_month(month)
    target = _locked_target(session, employee_id, first_day)
    old_value: int | None = None
    if target is None:
        if body.version is not None:
            raise _stale()  # deleted since the caller loaded it
        target = EmployeeKpiTarget(
            employee_id=employee_id,
            month=first_day,
            net_revenue_target=body.net_revenue_target,
            version=1,
            updated_by=actor.id,
        )
        session.add(target)
    else:
        if body.version != target.version:
            raise _stale()
        if target.net_revenue_target == body.net_revenue_target:
            # No-op edit: keep the version so other open forms don't get a spurious STALE_VERSION.
            return _row(employee, _department_name(session, employee), target)
        old_value = target.net_revenue_target
        target.net_revenue_target = body.net_revenue_target
        target.version += 1
        target.updated_by = actor.id
    try:
        session.flush()
    except IntegrityError as exc:
        raise _stale() from exc  # concurrent create of the same (employee, month)
    _record(
        session,
        actor,
        target.id,
        "kpi_target.set",
        {"employee_id": str(employee_id), "month": month, "from": old_value, "to": body.net_revenue_target},
        request_id,
    )
    session.refresh(target)
    return _row(employee, _department_name(session, employee), target)


def _department_name(session: Session, employee: Employee) -> str | None:
    if employee.department_id is None:
        return None
    return session.scalar(select(Department.name).where(Department.id == employee.department_id))


def delete_target(
    session: Session, actor: Actor, employee_id: uuid.UUID, month: str, *, request_id: str | None = None
) -> None:
    _employee_or_404(session, employee_id)
    target = _locked_target(session, employee_id, parse_month(month))
    if target is None:
        raise AppError(404, "NOT_FOUND", "Nhân viên chưa có chỉ tiêu tháng này.")
    data = {"employee_id": str(employee_id), "month": month, "from": target.net_revenue_target}
    session.delete(target)
    session.flush()
    _record(session, actor, target.id, "kpi_target.delete", data, request_id)


def copy_targets(
    session: Session, actor: Actor, body: KpiTargetCopy, *, request_id: str | None = None
) -> KpiTargetCopyResult:
    source_month, last_month = parse_month(body.from_month), parse_month(body.to_month)
    span = _months_between(source_month, last_month)
    if not 1 <= span <= MAX_COPY_MONTHS:
        message = f"Tháng cuối phải sau tháng nguồn và cách tối đa {MAX_COPY_MONTHS} tháng."
        raise AppError(
            422,
            "VALIDATION_ERROR",
            message,
            errors=[{"field": "to_month", "code": "out_of_range", "message": message}],
        )
    # Q148: the whole source month, regardless of the list's department/search filters.
    source = {
        t.employee_id: t.net_revenue_target
        for t in session.scalars(select(EmployeeKpiTarget).where(EmployeeKpiTarget.month == source_month))
    }
    created = overwritten = skipped = 0
    for offset in range(1, span + 1):
        month = _add_months(source_month, offset)
        existing = {
            t.employee_id: t
            for t in session.scalars(
                select(EmployeeKpiTarget)
                .where(EmployeeKpiTarget.month == month, EmployeeKpiTarget.employee_id.in_(source))
                .with_for_update()
            )
        }
        for employee_id, value in source.items():
            current = existing.get(employee_id)
            if current is None:
                session.add(
                    EmployeeKpiTarget(
                        employee_id=employee_id,
                        month=month,
                        net_revenue_target=value,
                        version=1,
                        updated_by=actor.id,
                    )
                )
                created += 1
            elif body.overwrite:
                if current.net_revenue_target != value:
                    current.net_revenue_target = value
                    current.version += 1
                    current.updated_by = actor.id
                overwritten += 1
            else:
                skipped += 1
    try:
        session.flush()
    except IntegrityError as exc:
        raise _stale() from exc
    result = KpiTargetCopyResult(created=created, overwritten=overwritten, skipped=skipped)
    # One summary event per copy (the batch has no single row to hang it on).
    _record(
        session,
        actor,
        uuid.uuid4(),
        "kpi_target.copy",
        {
            "from_month": body.from_month,
            "to_month": body.to_month,
            "overwrite": body.overwrite,
            **result.model_dump(),
        },
        request_id,
    )
    return result
