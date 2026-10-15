"""/api/v1/notifications — read + mark-read for the caller's own notifications (M7-01a)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect

from app.core.authz import Actor, effective_scopes, require
from app.core.db import DbSession
from app.modules.notifications import realtime, service
from app.modules.notifications.schemas import (
    MarkAllReadResult,
    NotificationOut,
    NotificationPage,
    PushSubscriptionIn,
    PushUnsubscribeIn,
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


@router.post(
    "/push-subscriptions",
    operation_id="notifications_push_subscribe",
    summary="Đăng ký nhận Web Push trên thiết bị/trình duyệt hiện tại",
    status_code=204,
)
def subscribe_push(session: DbSession, actor: Reader, body: PushSubscriptionIn) -> None:
    service.subscribe_push(
        session, actor, endpoint=body.endpoint, p256dh=body.keys.p256dh, auth=body.keys.auth
    )


@router.post(
    "/push-subscriptions/unsubscribe",
    operation_id="notifications_push_unsubscribe",
    summary="Bỏ đăng ký Web Push trên thiết bị/trình duyệt hiện tại",
    status_code=204,
)
def unsubscribe_push(session: DbSession, actor: Reader, body: PushUnsubscribeIn) -> None:
    service.unsubscribe_push(session, actor, endpoint=body.endpoint)


@router.websocket("/ws")
async def notifications_ws(websocket: WebSocket) -> None:
    """Kênh realtime cho thông báo của chính người gọi (M7-03, `spec/permissions.yaml#websocket_routes`
    capability `notification.read`). Không dùng `require()` — đó là dependency chỉ áp cho APIRoute,
    dịch lỗi ra response HTTP; ở đây tự xác thực bằng cookie rồi đóng socket nếu thất bại, có test
    integration riêng xác nhận (không nằm trong ma trận RBAC tự sinh của APIRoute).

    Mở 1 transaction DB ngắn chỉ để xác thực rồi đóng ngay — không giữ session suốt đời kết nối
    (có thể kéo dài nhiều giờ), tránh chiếm connection pool/transaction treo.
    """
    factory = websocket.app.state.session_factory
    with factory() as session, session.begin():
        actor = websocket.app.state.authenticator(websocket, session)
    if actor is None:
        await websocket.close(code=4401)
        return
    scopes = effective_scopes(websocket.app.state.specs.permissions, actor.roles, "notification.read")
    if not scopes:
        await websocket.close(code=4403)
        return

    await websocket.accept()
    realtime.connect(actor.id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        realtime.disconnect(actor.id, websocket)
