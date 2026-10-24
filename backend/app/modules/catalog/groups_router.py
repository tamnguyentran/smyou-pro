"""`/api/v1/product-service-groups` — thin HTTP layer (M16-07)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.catalog import groups_service as service
from app.modules.catalog.schemas import (
    ProductServiceGroupCreate,
    ProductServiceGroupOut,
    ProductServiceGroupPage,
    ProductServiceGroupUpdate,
    VersionRequest,
)

router = APIRouter(prefix="/api/v1/product-service-groups", tags=["product-service-groups"])
Reader = Annotated[Actor, Depends(require("catalog.read"))]
Manager = Annotated[Actor, Depends(require("catalog.manage"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
CONFLICTS = (409, "STALE_VERSION | CONFLICT (name) | INVALID_TRANSITION")


@router.get(
    "",
    operation_id="product_service_groups_list",
    summary="Danh sách nhóm sản phẩm/dịch vụ (tìm, lọc, phân trang)",
    response_model=ProductServiceGroupPage,
)
def list_groups(
    session: DbSession,
    actor: Reader,
    q: Annotated[str | None, Query(max_length=100)] = None,
    is_active: bool | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ProductServiceGroupPage:
    return service.list_groups(session, actor, q=q, is_active=is_active, limit=limit, offset=offset)


@router.get(
    "/{group_id}",
    operation_id="product_service_groups_get",
    summary="Chi tiết nhóm sản phẩm/dịch vụ",
    response_model=ProductServiceGroupOut,
    responses=_docs(NOT_FOUND),
)
def get_group(group_id: uuid.UUID, session: DbSession, actor: Reader) -> ProductServiceGroupOut:
    return service.get_group(session, actor, group_id)


@router.post(
    "",
    operation_id="product_service_groups_create",
    summary="Tạo nhóm sản phẩm/dịch vụ",
    status_code=201,
    response_model=ProductServiceGroupOut,
    responses=_docs((409, "CONFLICT (name)")),
)
def create_group(
    body: ProductServiceGroupCreate, session: DbSession, actor: Manager
) -> ProductServiceGroupOut:
    return service.create_group(session, actor, body)


@router.patch(
    "/{group_id}",
    operation_id="product_service_groups_update",
    summary="Sửa nhóm sản phẩm/dịch vụ",
    response_model=ProductServiceGroupOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_group(
    group_id: uuid.UUID, body: ProductServiceGroupUpdate, session: DbSession, actor: Manager
) -> ProductServiceGroupOut:
    return service.update_group(session, actor, group_id, body)


@router.post(
    "/{group_id}/deactivate",
    operation_id="product_service_groups_deactivate",
    summary="Ngừng hoạt động nhóm sản phẩm/dịch vụ",
    response_model=ProductServiceGroupOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def deactivate(
    group_id: uuid.UUID, body: VersionRequest, session: DbSession, actor: Manager
) -> ProductServiceGroupOut:
    return service.deactivate(session, actor, group_id, version=body.version)


@router.post(
    "/{group_id}/activate",
    operation_id="product_service_groups_activate",
    summary="Mở lại hoạt động nhóm sản phẩm/dịch vụ",
    response_model=ProductServiceGroupOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def activate(
    group_id: uuid.UUID, body: VersionRequest, session: DbSession, actor: Manager
) -> ProductServiceGroupOut:
    return service.activate(session, actor, group_id, version=body.version)
