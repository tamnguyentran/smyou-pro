"""/api/v1/customer-gifts — thin HTTP layer (M16-01a)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.customer_gifts import service
from app.modules.customer_gifts.schemas import (
    CustomerGiftCreate,
    CustomerGiftOut,
    CustomerGiftPage,
    CustomerGiftUpdate,
    GiftPhoto,
    GiftPhotoPage,
)

router = APIRouter(prefix="/api/v1/customer-gifts", tags=["customer-gifts"])
Reader = Annotated[Actor, Depends(require("customer_gift.read"))]
Manager = Annotated[Actor, Depends(require("customer_gift.manage"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
CONFLICTS = (409, "STALE_VERSION")


@router.get(
    "",
    operation_id="customer_gifts_list",
    summary="Danh sách bản ghi tặng quà của 1 khách hàng",
    response_model=CustomerGiftPage,
)
def list_gifts(
    session: DbSession,
    actor: Reader,
    customer_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CustomerGiftPage:
    return service.list_gifts(session, actor, customer_id=customer_id, limit=limit, offset=offset)


@router.get(
    "/{gift_id}",
    operation_id="customer_gifts_get",
    summary="Chi tiết bản ghi tặng quà",
    response_model=CustomerGiftOut,
    responses=_docs(NOT_FOUND),
)
def get_gift(gift_id: uuid.UUID, session: DbSession, actor: Reader) -> CustomerGiftOut:
    return service.get_gift(session, actor, gift_id)


@router.post(
    "",
    operation_id="customer_gifts_create",
    summary="Ghi nhận tặng quà khách hàng",
    status_code=201,
    response_model=CustomerGiftOut,
    responses=_docs((404, "NOT_FOUND (khách hàng/nhân viên)")),
)
def create_gift(
    body: CustomerGiftCreate, request: Request, session: DbSession, actor: Manager
) -> CustomerGiftOut:
    return service.create_gift(session, actor, body, request_id=get_request_id(request))


@router.patch(
    "/{gift_id}",
    operation_id="customer_gifts_update",
    summary="Sửa bản ghi tặng quà",
    response_model=CustomerGiftOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_gift(
    gift_id: uuid.UUID, body: CustomerGiftUpdate, request: Request, session: DbSession, actor: Manager
) -> CustomerGiftOut:
    return service.update_gift(session, actor, gift_id, body, request_id=get_request_id(request))


@router.post(
    "/{gift_id}/photos",
    operation_id="customer_gifts_upload_photo",
    summary="Tải ảnh tặng quà",
    status_code=201,
    response_model=GiftPhoto,
    responses=_docs(NOT_FOUND, (422, "INVALID_FILE_TYPE | FILE_TOO_LARGE | UNSUPPORTED_MEDIA_TYPE")),
)
def upload_photo(
    gift_id: uuid.UUID,
    request: Request,
    session: DbSession,
    actor: Manager,
    file: Annotated[UploadFile, File()],
) -> GiftPhoto:
    settings = request.app.state.settings
    max_bytes = settings.upload_max_mb * 1024 * 1024
    file_bytes = file.file.read(max_bytes + 1)
    return service.upload_photo(
        session,
        actor,
        gift_id,
        file_bytes=file_bytes,
        filename=file.filename or "upload",
        declared_mime=file.content_type or "application/octet-stream",
        settings=settings,
        now=request.app.state.clock(),
    )


@router.get(
    "/{gift_id}/photos",
    operation_id="customer_gifts_list_photos",
    summary="Danh sách ảnh tặng quà",
    response_model=GiftPhotoPage,
    responses=_docs(NOT_FOUND),
)
def list_photos(gift_id: uuid.UUID, session: DbSession, actor: Reader) -> GiftPhotoPage:
    return service.list_photos(session, actor, gift_id)
