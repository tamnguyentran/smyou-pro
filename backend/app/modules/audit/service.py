"""Shared audit write path + read query for the Nhật ký hệ thống page (M1-05).

Other modules call record() through this public function — never insert AuditEvent rows
directly (ARCHITECTURE §3: cross-module calls go through a module's public service). Later
modules (M3 orders, M4 tasks, ...) call this same function for the `audit` effect declared in
spec/state_machines.yaml.
"""

import uuid
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope
from app.core.errors import AppError
from app.modules.audit.domain import EntityType
from app.modules.audit.models import AuditEvent
from app.modules.audit.schemas import ActorSummary, AuditEventOut, AuditEventPage
from app.modules.identity.models import Employee

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")
_ENTITY_TYPES = {e.value for e in EntityType}
# audit.read grants only `all` today (MANAGER); kept for the same reason employees.service keeps
# an empty RULES dict — a narrower scope added later fails closed instead of leaking rows.
RULES: ScopeRules = {}


def record(
    session: Session,
    *,
    actor_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    from_status: str | None = None,
    to_status: str | None = None,
    data: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> None:
    if entity_type not in _ENTITY_TYPES:
        raise ValueError(f"unknown audit entity_type: {entity_type!r}")
    session.add(
        AuditEvent(
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            from_status=from_status,
            to_status=to_status,
            data=data,
            request_id=request_id,
        )
    )


def _vn_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=VIETNAM)


def _out(event: AuditEvent, employee: Employee | None) -> AuditEventOut:
    actor = (
        ActorSummary(id=employee.id, code=employee.code, full_name=employee.full_name)
        if employee is not None
        else None
    )
    return AuditEventOut(
        id=event.id,
        occurred_at=event.occurred_at,
        actor=actor,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        action=event.action,
        from_status=event.from_status,
        to_status=event.to_status,
        data=event.data,
    )


def list_events(
    session: Session,
    actor: Actor,
    *,
    entity_type: str | None,
    actor_id: uuid.UUID | None,
    occurred_from: date | None,
    occurred_to: date | None,
    limit: int,
    offset: int,
) -> AuditEventPage:
    if occurred_from is not None and occurred_to is not None and occurred_from > occurred_to:
        message = "Từ ngày không được sau Đến ngày."
        raise AppError(
            422,
            "VALIDATION_ERROR",
            message,
            errors=[{"field": "occurred_from", "code": "invalid_range", "message": message}],
        )

    query = select(AuditEvent, Employee).outerjoin(Employee, Employee.id == AuditEvent.actor_id)
    query = apply_scope(query, actor, RULES)
    if entity_type is not None:
        query = query.where(AuditEvent.entity_type == entity_type)
    if actor_id is not None:
        query = query.where(AuditEvent.actor_id == actor_id)
    if occurred_from is not None:
        query = query.where(AuditEvent.occurred_at >= _vn_day_start_utc(occurred_from))
    if occurred_to is not None:
        query = query.where(AuditEvent.occurred_at < _vn_day_start_utc(occurred_to) + timedelta(days=1))

    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered = query.order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
    rows = session.execute(ordered.limit(limit).offset(offset)).all()
    items = [_out(event, employee) for event, employee in rows]
    return AuditEventPage(items=items, total=total, limit=limit, offset=offset)
