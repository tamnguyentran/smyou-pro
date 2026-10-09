"""notifications: write path for the 13 `notify_*` effects (spec/state_machines.yaml) + read API
(M7-01a). Other modules call the `notify_*` functions below through this public service — never
insert `Notification` rows directly (ARCHITECTURE §3).

Recipient resolution and Vietnamese copy per effect are fixed by docs/specs/M7-01a-notifications-api.md
§3/§9 — not configurable by callers.
"""

import uuid
from collections.abc import Iterable
from datetime import datetime
from typing import Any, cast

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404
from app.modules.dispatch.models import Task
from app.modules.identity.models import Employee, EmployeeRole
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationOut, NotificationPage
from app.modules.orders.models import Order

RULES: ScopeRules = {"self": lambda actor: Notification.recipient_id == actor.id}


def _create(
    session: Session,
    *,
    recipient_id: uuid.UUID,
    type: str,
    title: str,
    body: str,
    entity_type: str,
    entity_id: uuid.UUID,
) -> None:
    session.add(
        Notification(
            recipient_id=recipient_id,
            type=type,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    )


def _notify_many(
    session: Session,
    recipient_ids: Iterable[uuid.UUID],
    *,
    type: str,
    title: str,
    body: str,
    entity_type: str,
    entity_id: uuid.UUID,
) -> None:
    for recipient_id in recipient_ids:
        _create(
            session,
            recipient_id=recipient_id,
            type=type,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
        )


def _active_tech_lead_ids(session: Session) -> list[uuid.UUID]:
    return list(
        session.scalars(
            select(Employee.id).where(
                Employee.roles.any(EmployeeRole.role == "TECH_LEAD"), Employee.is_active.is_(True)
            )
        )
    )


# ---------------- order effects ----------------


def notify_order_submitted(session: Session, order: Order) -> None:
    _notify_many(
        session,
        _active_tech_lead_ids(session),
        type="ORDER_SUBMITTED",
        title="Đơn hàng mới chờ điều phối",
        body=f"Đơn {order.code} đã được gửi, cần điều phối kỹ thuật.",
        entity_type="ORDER",
        entity_id=order.id,
    )


def notify_order_awaiting_confirmation(session: Session, order: Order) -> None:
    recipients = [*_active_tech_lead_ids(session), order.created_by]
    _notify_many(
        session,
        recipients,
        type="ORDER_AWAITING_CONFIRMATION",
        title="Đơn hàng chờ khách xác nhận",
        body=f"Đơn {order.code} đã hoàn thành mọi đầu việc, chờ khách xác nhận.",
        entity_type="ORDER",
        entity_id=order.id,
    )


def notify_order_completed(session: Session, order: Order) -> None:
    _create(
        session,
        recipient_id=order.created_by,
        type="ORDER_COMPLETED",
        title="Đơn hàng đã hoàn tất",
        body=f"Đơn {order.code} đã hoàn tất.",
        entity_type="ORDER",
        entity_id=order.id,
    )


def notify_order_revision_requested(session: Session, order: Order, reason: str) -> None:
    _create(
        session,
        recipient_id=order.created_by,
        type="ORDER_REVISION_REQUESTED",
        title="Đơn hàng cần chỉnh sửa",
        body=f"Đơn {order.code} chuyển sang Chỉnh sửa. Lý do: {reason}.",
        entity_type="ORDER",
        entity_id=order.id,
    )


# ---------------- task effects ----------------


def notify_task_assigned(
    session: Session, task: Task, order: Order, employee_ids: Iterable[uuid.UUID]
) -> None:
    _notify_many(
        session,
        employee_ids,
        type="TASK_ASSIGNED",
        title="Bạn được giao đầu việc mới",
        body=f'Đầu việc "{task.title}" của đơn {order.code} đã giao cho bạn.',
        entity_type="ORDER",
        entity_id=order.id,
    )


def notify_task_updated(
    session: Session, task: Task, order: Order, employee_ids: Iterable[uuid.UUID]
) -> None:
    _notify_many(
        session,
        employee_ids,
        type="TASK_UPDATED",
        title="Đầu việc đã được cập nhật",
        body=f'Đầu việc "{task.title}" của đơn {order.code} vừa được cập nhật.',
        entity_type="ORDER",
        entity_id=order.id,
    )


def notify_task_reopened(
    session: Session, task: Task, order: Order, employee_ids: Iterable[uuid.UUID], reason: str
) -> None:
    _notify_many(
        session,
        employee_ids,
        type="TASK_REOPENED",
        title="Đầu việc được mở lại",
        body=f'Đầu việc "{task.title}" của đơn {order.code} được mở lại. Lý do: {reason}.',
        entity_type="ORDER",
        entity_id=order.id,
    )


def notify_task_cancelled(
    session: Session, task: Task, order: Order, employee_ids: Iterable[uuid.UUID]
) -> None:
    _notify_many(
        session,
        employee_ids,
        type="TASK_CANCELLED",
        title="Đầu việc đã bị huỷ",
        body=f'Đầu việc "{task.title}" của đơn {order.code} đã bị huỷ.',
        entity_type="ORDER",
        entity_id=order.id,
    )


# ---------------- assignment effects ----------------


def notify_assignment_removed(session: Session, task: Task, order: Order, employee_id: uuid.UUID) -> None:
    _create(
        session,
        recipient_id=employee_id,
        type="ASSIGNMENT_REMOVED",
        title="Bạn đã được gỡ khỏi đầu việc",
        body=f'Bạn không còn được giao đầu việc "{task.title}" của đơn {order.code}.',
        entity_type="ORDER",
        entity_id=order.id,
    )


def notify_assignment_rejected(
    session: Session, task: Task, order: Order, rejecter_id: uuid.UUID, reason_text: str
) -> None:
    rejecter = session.get(Employee, rejecter_id)
    rejecter_name = rejecter.full_name if rejecter is not None else ""
    _notify_many(
        session,
        _active_tech_lead_ids(session),
        type="ASSIGNMENT_REJECTED",
        title="Một đầu việc bị từ chối",
        body=(
            f'{rejecter_name} đã từ chối đầu việc "{task.title}" của đơn {order.code}. Lý do: {reason_text}.'
        ),
        entity_type="ORDER",
        entity_id=order.id,
    )


def notify_assignment_done(session: Session, task: Task, order: Order) -> None:
    _notify_many(
        session,
        _active_tech_lead_ids(session),
        type="ASSIGNMENT_DONE",
        title="Một đầu việc đã hoàn thành",
        body=f'Đầu việc "{task.title}" của đơn {order.code} đã hoàn thành.',
        entity_type="ORDER",
        entity_id=order.id,
    )


# ---------------- read API (self-scope only) ----------------


def _out(notification: Notification) -> NotificationOut:
    return NotificationOut(
        id=notification.id,
        type=notification.type,
        title=notification.title,
        body=notification.body,
        entity_type=notification.entity_type,
        entity_id=notification.entity_id,
        read_at=notification.read_at,
        created_at=notification.created_at,
    )


def list_mine(session: Session, actor: Actor, *, limit: int, offset: int) -> NotificationPage:
    query = apply_scope(select(Notification), actor, RULES)
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered = query.order_by(Notification.created_at.desc())
    rows = session.scalars(ordered.limit(limit).offset(offset)).all()
    return NotificationPage(items=[_out(row) for row in rows], total=total, limit=limit, offset=offset)


def count_unread(session: Session, recipient_id: uuid.UUID) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.recipient_id == recipient_id, Notification.read_at.is_(None))
        )
        or 0
    )


def mark_read(
    session: Session, actor: Actor, notification_id: uuid.UUID, *, now: datetime
) -> NotificationOut:
    notification = get_in_scope_or_404(
        session, select(Notification).where(Notification.id == notification_id), actor, RULES
    )
    if notification.read_at is None:
        notification.read_at = now
        session.flush()
    return _out(notification)


def mark_all_read(session: Session, actor: Actor, *, now: datetime) -> int:
    result = session.execute(
        update(Notification)
        .where(Notification.recipient_id == actor.id, Notification.read_at.is_(None))
        .values(read_at=now)
    )
    return cast(CursorResult[Any], result).rowcount or 0
