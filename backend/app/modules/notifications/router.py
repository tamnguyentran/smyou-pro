"""/api/v1/notifications — read + mark-read for the caller's own notifications (M7-01a)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    MarkAllReadResult,
    NotificationOut,
    NotificationPage,
    UnreadCount,
)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])
Reader = Annotated[Actor, Depends(require("notification.read"))]


@router.get(
    "",
    operation_id="notifications_list",
    summary="Danh sách thông báo của người đang đăng nhập",
    response_model=NotificationPage,
)
def list_mine(
    session: DbSession,
    actor: Reader,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> NotificationPage:
    return service.list_mine(session, actor, limit=limit, offset=offset)


@router.get(
    "/unread-count",
    operation_id="notifications_unread_count",
    summary="Số thông báo chưa đọc của người đang đăng nhập",
    response_model=UnreadCount,
)
def unread_count(session: DbSession, actor: Reader) -> UnreadCount:
    return UnreadCount(count=service.count_unread(session, actor.id))


@router.post(
    "/{notification_id}/read",
    operation_id="notifications_mark_read",
    summary="Đánh dấu 1 thông báo đã đọc",
    response_model=NotificationOut,
    responses={404: {"description": "problem+json — NOT_FOUND: không thuộc người gọi"}},
)
def mark_read(
    request: Request, session: DbSession, actor: Reader, notification_id: uuid.UUID
) -> NotificationOut:
    now = request.app.state.clock()
    return service.mark_read(session, actor, notification_id, now=now)


@router.post(
    "/mark-all-read",
    operation_id="notifications_mark_all_read",
    summary="Đánh dấu tất cả thông báo của người gọi đã đọc",
    response_model=MarkAllReadResult,
)
def mark_all_read(request: Request, session: DbSession, actor: Reader) -> MarkAllReadResult:
    now = request.app.state.clock()
    return MarkAllReadResult(count=service.mark_all_read(session, actor, now=now))
