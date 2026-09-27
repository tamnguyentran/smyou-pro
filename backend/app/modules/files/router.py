"""/api/v1/attachments — serves stored files (M2-01a: product images only).

Capability is hard-coded to `catalog.read` for now (the only owner today is PRODUCT_IMAGE); M6-01 must
generalize this per `owner_type`/`kind` when it adds TASK_PHOTO/CUSTOMER_CONFIRMATION.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.files import service

router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])
Reader = Annotated[Actor, Depends(require("catalog.read"))]


@router.get(
    "/{attachment_id}",
    operation_id="attachments_get",
    summary="Tải tệp đính kèm (ảnh sản phẩm)",
    responses={404: {"description": "problem+json — NOT_FOUND"}},
)
def get_attachment(
    attachment_id: uuid.UUID, request: Request, session: DbSession, _actor: Reader
) -> Response:
    attachment = service.get_or_404(session, attachment_id)
    settings = request.app.state.settings
    return Response(content=service.read_bytes(attachment, settings), media_type=attachment.mime_type)
