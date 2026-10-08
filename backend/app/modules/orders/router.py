"""/api/v1/orders — thin HTTP layer (M3-02a, M3-03a)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.audit.schemas import AuditEventPage
from app.modules.orders import service
from app.modules.orders.schemas import (
    ConfirmationAttachment,
    ConfirmationAttachmentPage,
    OrderCancel,
    OrderCommand,
    OrderContactUpdate,
    OrderCreate,
    OrderDetail,
    OrderLineCreate,
    OrderLineRemove,
    OrderLineUpdate,
    OrderPage,
    OrderSort,
    OrderStatus,
    OrderUpdate,
)

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
Creator = Annotated[Actor, Depends(require("order.create"))]
Reader = Annotated[Actor, Depends(require("order.read"))]
Editor = Annotated[Actor, Depends(require("order.edit_draft"))]
Submitter = Annotated[Actor, Depends(require("order.submit"))]
Canceler = Annotated[Actor, Depends(require("order.cancel"))]
ContactEditor = Annotated[Actor, Depends(require("order.edit_contact"))]
AfterSubmitLineEditor = Annotated[Actor, Depends(require("order.edit_lines_after_submit"))]
ConfirmationUploader = Annotated[Actor, Depends(require("order.upload_confirmation"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
CONFLICTS = (409, "STALE_VERSION | ORDER_NOT_DRAFT")
TRANSITION_CONFLICTS = (409, "STALE_VERSION | INVALID_TRANSITION | GUARD_FAILED")
AFTER_SUBMIT_CONFLICTS = (409, "STALE_VERSION | ORDER_NOT_SUBMITTED | ORDER_LOCKED")


@router.post(
    "", operation_id="orders_create", summary="Tạo đơn nháp", status_code=201, response_model=OrderDetail
)
def create_order(body: OrderCreate, request: Request, session: DbSession, actor: Creator) -> OrderDetail:
    now = request.app.state.clock()
    return service.create_order(
        session, actor, body, now=now, specs=request.app.state.specs, request_id=get_request_id(request)
    )


@router.get(
    "",
    operation_id="orders_list",
    summary="Danh sách đơn (tìm theo mã/tên khách/SĐT, lọc theo trạng thái)",
    response_model=OrderPage,
)
def list_orders(
    session: DbSession,
    actor: Reader,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status: OrderStatus | None = None,
    sort: OrderSort = "created_at_desc",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> OrderPage:
    return service.list_orders(session, actor, q=q, status=status, sort=sort, limit=limit, offset=offset)


@router.get(
    "/{order_id}",
    operation_id="orders_get",
    summary="Chi tiết đơn",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND),
)
def get_order(order_id: uuid.UUID, request: Request, session: DbSession, actor: Reader) -> OrderDetail:
    return service.get_order(session, actor, order_id, specs=request.app.state.specs)


@router.get(
    "/{order_id}/history",
    operation_id="orders_history",
    summary="Lịch sử thay đổi trạng thái của đơn",
    response_model=AuditEventPage,
    responses=_docs(NOT_FOUND),
)
def get_order_history(
    order_id: uuid.UUID,
    session: DbSession,
    actor: Reader,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditEventPage:
    return service.get_order_history(session, actor, order_id, limit=limit, offset=offset)


@router.post(
    "/{order_id}/confirmation-attachments",
    operation_id="orders_upload_confirmation_attachment",
    summary="Tải ảnh phiếu xác nhận",
    status_code=201,
    response_model=ConfirmationAttachment,
    responses=_docs(NOT_FOUND, (422, "INVALID_FILE_TYPE | FILE_TOO_LARGE | UNSUPPORTED_MEDIA_TYPE")),
)
def upload_confirmation_attachment(
    order_id: uuid.UUID,
    request: Request,
    session: DbSession,
    actor: ConfirmationUploader,
    file: Annotated[UploadFile, File()],
) -> ConfirmationAttachment:
    settings = request.app.state.settings
    max_bytes = settings.upload_max_mb * 1024 * 1024
    file_bytes = file.file.read(max_bytes + 1)
    return service.upload_confirmation_attachment(
        session,
        actor,
        order_id,
        file_bytes=file_bytes,
        filename=file.filename or "upload",
        declared_mime=file.content_type or "application/octet-stream",
        settings=settings,
        now=request.app.state.clock(),
        request_id=get_request_id(request),
    )


@router.get(
    "/{order_id}/confirmation-attachments",
    operation_id="orders_list_confirmation_attachments",
    summary="Danh sách ảnh phiếu xác nhận",
    response_model=ConfirmationAttachmentPage,
    responses=_docs(NOT_FOUND),
)
def list_confirmation_attachments(
    order_id: uuid.UUID, session: DbSession, actor: Reader
) -> ConfirmationAttachmentPage:
    return service.list_confirmation_attachments(session, actor, order_id)


@router.patch(
    "/{order_id}",
    operation_id="orders_update",
    summary="Sửa thông tin đơn nháp",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_order(
    order_id: uuid.UUID, body: OrderUpdate, request: Request, session: DbSession, actor: Editor
) -> OrderDetail:
    return service.update_order(
        session, actor, order_id, body, specs=request.app.state.specs, request_id=get_request_id(request)
    )


@router.post(
    "/{order_id}/submit",
    operation_id="orders_submit",
    summary="Gửi đơn cho Quản lý kỹ thuật",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, TRANSITION_CONFLICTS),
)
def submit_order(
    order_id: uuid.UUID, body: OrderCommand, request: Request, session: DbSession, actor: Submitter
) -> OrderDetail:
    now = request.app.state.clock()
    return service.submit_order(
        session,
        actor,
        order_id,
        body,
        now=now,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{order_id}/recall",
    operation_id="orders_recall",
    summary="Thu hồi đơn về Nháp",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, TRANSITION_CONFLICTS),
)
def recall_order(
    order_id: uuid.UUID, body: OrderCommand, request: Request, session: DbSession, actor: Submitter
) -> OrderDetail:
    now = request.app.state.clock()
    return service.recall_order(
        session,
        actor,
        order_id,
        body,
        now=now,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{order_id}/cancel",
    operation_id="orders_cancel",
    summary="Huỷ đơn",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, TRANSITION_CONFLICTS),
)
def cancel_order(
    order_id: uuid.UUID, body: OrderCancel, request: Request, session: DbSession, actor: Canceler
) -> OrderDetail:
    now = request.app.state.clock()
    return service.cancel_order(
        session,
        actor,
        order_id,
        body,
        now=now,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{order_id}/lines",
    operation_id="orders_add_line",
    summary="Thêm dòng hàng vào đơn nháp",
    status_code=201,
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def add_line(
    order_id: uuid.UUID, body: OrderLineCreate, request: Request, session: DbSession, actor: Editor
) -> OrderDetail:
    return service.add_line(
        session, actor, order_id, body, specs=request.app.state.specs, request_id=get_request_id(request)
    )


@router.patch(
    "/{order_id}/lines/{line_id}",
    operation_id="orders_update_line",
    summary="Sửa dòng hàng trong đơn nháp",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_line(
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineUpdate,
    request: Request,
    session: DbSession,
    actor: Editor,
) -> OrderDetail:
    return service.update_line(
        session,
        actor,
        order_id,
        line_id,
        body,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{order_id}/lines/{line_id}/remove",
    operation_id="orders_remove_line",
    summary="Xoá dòng hàng khỏi đơn nháp",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def remove_line(
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineRemove,
    request: Request,
    session: DbSession,
    actor: Editor,
) -> OrderDetail:
    return service.remove_line(
        session,
        actor,
        order_id,
        line_id,
        body,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.patch(
    "/{order_id}/contact",
    operation_id="orders_update_contact",
    summary="Sửa liên hệ/mô tả sau khi gửi",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, AFTER_SUBMIT_CONFLICTS),
)
def update_contact(
    order_id: uuid.UUID,
    body: OrderContactUpdate,
    request: Request,
    session: DbSession,
    actor: ContactEditor,
) -> OrderDetail:
    return service.update_contact(
        session, actor, order_id, body, specs=request.app.state.specs, request_id=get_request_id(request)
    )


@router.post(
    "/{order_id}/lines-after-submit",
    operation_id="orders_add_line_after_submit",
    summary="Thêm dòng hàng sau khi gửi",
    status_code=201,
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, AFTER_SUBMIT_CONFLICTS),
)
def add_line_after_submit(
    order_id: uuid.UUID,
    body: OrderLineCreate,
    request: Request,
    session: DbSession,
    actor: AfterSubmitLineEditor,
) -> OrderDetail:
    return service.add_line_after_submit(
        session, actor, order_id, body, specs=request.app.state.specs, request_id=get_request_id(request)
    )


@router.patch(
    "/{order_id}/lines-after-submit/{line_id}",
    operation_id="orders_update_line_after_submit",
    summary="Sửa dòng hàng sau khi gửi",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, AFTER_SUBMIT_CONFLICTS),
)
def update_line_after_submit(
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineUpdate,
    request: Request,
    session: DbSession,
    actor: AfterSubmitLineEditor,
) -> OrderDetail:
    return service.update_line_after_submit(
        session,
        actor,
        order_id,
        line_id,
        body,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )


@router.post(
    "/{order_id}/lines-after-submit/{line_id}/remove",
    operation_id="orders_remove_line_after_submit",
    summary="Xoá dòng hàng sau khi gửi",
    response_model=OrderDetail,
    responses=_docs(NOT_FOUND, AFTER_SUBMIT_CONFLICTS),
)
def remove_line_after_submit(
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineRemove,
    request: Request,
    session: DbSession,
    actor: AfterSubmitLineEditor,
) -> OrderDetail:
    return service.remove_line_after_submit(
        session,
        actor,
        order_id,
        line_id,
        body,
        specs=request.app.state.specs,
        request_id=get_request_id(request),
    )
