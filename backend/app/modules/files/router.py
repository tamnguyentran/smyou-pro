"""/api/v1/attachments — serves stored files (M2-01a: product images; M6-01: order confirmation
photos). Capability is chosen per-record (`spec/permissions.yaml#dynamic_routes`): `PRODUCT` owners
check `catalog.read` (always scope `all` for the roles that hold it, so no row-scoping needed —
same as before M6-01), `ORDER` owners check `order.read` and, unless the caller's scope is `all`,
`orders.service.order_in_scope` (keeps `files` from importing `orders.models` directly)."""

import uuid
from dataclasses import replace
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.core.authz import Actor, effective_scopes, require_authenticated
from app.core.db import DbSession
from app.core.errors import AppError
from app.core.spec_loader import Specs
from app.modules.files import service
from app.modules.orders import service as orders_service

router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])
Authed = Annotated[Actor, Depends(require_authenticated())]


@router.get(
    "/{attachment_id}",
    operation_id="attachments_get",
    summary="Tải tệp đính kèm (ảnh sản phẩm, ảnh phiếu xác nhận)",
    responses={
        403: {"description": "problem+json — FORBIDDEN"},
        404: {"description": "problem+json — NOT_FOUND"},
    },
)
def get_attachment(attachment_id: uuid.UUID, request: Request, session: DbSession, actor: Authed) -> Response:
    attachment = service.get_or_404(session, attachment_id)
    specs: Specs = request.app.state.specs
    capability = "catalog.read" if attachment.owner_type == "PRODUCT" else "order.read"
    scopes = effective_scopes(specs.permissions, actor.roles, capability)
    if not scopes:
        raise AppError(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.")
    if attachment.owner_type == "ORDER" and "all" not in scopes:
        scoped_actor = replace(actor, capability=capability, scopes=scopes)
        if not orders_service.order_in_scope(session, scoped_actor, attachment.owner_id):
            raise AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.")
    settings = request.app.state.settings
    filename = attachment.original_filename.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        content=service.read_bytes(attachment, settings),
        media_type=attachment.mime_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
