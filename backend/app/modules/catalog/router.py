"""/api/v1/products, /api/v1/services — thin HTTP layer (M2-01a, M2-02).

State changes are named commands, never a PATCH of status.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.catalog import service
from app.modules.catalog.import_csv import MAX_FILE_BYTES
from app.modules.catalog.schemas import (
    Category,
    ImageUploaded,
    ImportCommitResult,
    ImportPreview,
    ProductCreate,
    ProductOut,
    ProductPage,
    ProductUpdate,
    ServiceCategory,
    ServiceCreate,
    ServiceOut,
    ServicePage,
    ServiceUnit,
    ServiceUpdate,
    VersionRequest,
)

router = APIRouter(prefix="/api/v1/products", tags=["products"])
services_router = APIRouter(prefix="/api/v1/services", tags=["services"])
Reader = Annotated[Actor, Depends(require("catalog.read"))]
Manager = Annotated[Actor, Depends(require("catalog.manage"))]


def _docs(*lines: tuple[int, str]) -> dict[int | str, dict[str, Any]]:
    return {status: {"description": f"problem+json — {text}"} for status, text in lines}


NOT_FOUND = (404, "NOT_FOUND")
CONFLICTS = (409, "STALE_VERSION | CONFLICT (sku/code) | INVALID_TRANSITION")


def _now(request: Request) -> datetime:
    now: datetime = request.app.state.clock()
    return now


@router.get(
    "",
    operation_id="products_list",
    summary="Danh sách sản phẩm (tìm, lọc, phân trang)",
    response_model=ProductPage,
)
def list_products(
    session: DbSession,
    actor: Reader,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Category | None = None,
    brand: Annotated[str | None, Query(max_length=60)] = None,
    is_active: bool | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ProductPage:
    return service.list_products(
        session, actor, q=q, category=category, brand=brand, is_active=is_active, limit=limit, offset=offset
    )


@router.get(
    "/{product_id}",
    operation_id="products_get",
    summary="Chi tiết sản phẩm",
    response_model=ProductOut,
    responses=_docs(NOT_FOUND),
)
def get_product(product_id: uuid.UUID, session: DbSession, actor: Reader) -> ProductOut:
    return service.get_product(session, actor, product_id)


@router.post(
    "",
    operation_id="products_create",
    summary="Thêm sản phẩm",
    status_code=201,
    response_model=ProductOut,
    responses=_docs((409, "CONFLICT (sku)")),
)
def create_product(body: ProductCreate, request: Request, session: DbSession, actor: Manager) -> ProductOut:
    return service.create_product(session, actor, body, request_id=get_request_id(request))


@router.patch(
    "/{product_id}",
    operation_id="products_update",
    summary="Sửa thông tin sản phẩm",
    response_model=ProductOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_product(
    product_id: uuid.UUID, body: ProductUpdate, request: Request, session: DbSession, actor: Manager
) -> ProductOut:
    return service.update_product(session, actor, product_id, body, request_id=get_request_id(request))


@router.post(
    "/{product_id}/deactivate",
    operation_id="products_deactivate",
    summary="Ngừng kinh doanh",
    response_model=ProductOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def deactivate(
    product_id: uuid.UUID, body: VersionRequest, request: Request, session: DbSession, actor: Manager
) -> ProductOut:
    return service.deactivate(
        session, actor, product_id, version=body.version, request_id=get_request_id(request)
    )


@router.post(
    "/{product_id}/activate",
    operation_id="products_activate",
    summary="Mở lại kinh doanh",
    response_model=ProductOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def activate(
    product_id: uuid.UUID, body: VersionRequest, request: Request, session: DbSession, actor: Manager
) -> ProductOut:
    return service.activate(
        session, actor, product_id, version=body.version, request_id=get_request_id(request)
    )


@router.post(
    "/{product_id}/image",
    operation_id="products_upload_image",
    summary="Tải ảnh sản phẩm",
    response_model=ImageUploaded,
    responses=_docs(NOT_FOUND, (422, "INVALID_FILE_TYPE | FILE_TOO_LARGE | UNSUPPORTED_MEDIA_TYPE")),
)
def upload_image(
    product_id: uuid.UUID,
    request: Request,
    session: DbSession,
    actor: Manager,
    file: Annotated[UploadFile, File()],
) -> ImageUploaded:
    settings = request.app.state.settings
    max_bytes = settings.upload_max_mb * 1024 * 1024
    file_bytes = file.file.read(max_bytes + 1)
    attachment_id = service.upload_image(
        session,
        actor,
        product_id,
        file_bytes=file_bytes,
        filename=file.filename or "upload",
        declared_mime=file.content_type or "application/octet-stream",
        settings=settings,
        now=_now(request),
        request_id=get_request_id(request),
    )
    return ImageUploaded(image_attachment_id=attachment_id)


@router.post(
    "/import/preview",
    operation_id="products_import_preview",
    summary="Xem trước import sản phẩm từ CSV",
    response_model=ImportPreview,
    responses=_docs((422, "EMPTY_FILE | MISSING_COLUMNS | TOO_MANY_ROWS | INVALID_FILE | FILE_TOO_LARGE")),
)
def import_products_preview(
    session: DbSession, actor: Manager, file: Annotated[UploadFile, File()]
) -> ImportPreview:
    file_bytes = file.file.read(MAX_FILE_BYTES + 1)
    return service.import_products_preview(session, actor, file_bytes)


@router.post(
    "/import/commit",
    operation_id="products_import_commit",
    summary="Xác nhận import sản phẩm từ CSV",
    status_code=201,
    response_model=ImportCommitResult,
    responses=_docs(
        (422, "EMPTY_FILE|MISSING_COLUMNS|TOO_MANY_ROWS|INVALID_FILE|FILE_TOO_LARGE|IMPORT_HAS_ERRORS")
    ),
)
def import_products_commit(
    request: Request, session: DbSession, actor: Manager, file: Annotated[UploadFile, File()]
) -> ImportCommitResult:
    file_bytes = file.file.read(MAX_FILE_BYTES + 1)
    return service.import_products_commit(session, actor, file_bytes, request_id=get_request_id(request))


@services_router.get(
    "",
    operation_id="services_list",
    summary="Danh sách dịch vụ (tìm, lọc, phân trang)",
    response_model=ServicePage,
)
def list_services(
    session: DbSession,
    actor: Reader,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: ServiceCategory | None = None,
    unit: ServiceUnit | None = None,
    is_active: bool | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ServicePage:
    return service.list_services(
        session, actor, q=q, category=category, unit=unit, is_active=is_active, limit=limit, offset=offset
    )


@services_router.get(
    "/{service_id}",
    operation_id="services_get",
    summary="Chi tiết dịch vụ",
    response_model=ServiceOut,
    responses=_docs(NOT_FOUND),
)
def get_service(service_id: uuid.UUID, session: DbSession, actor: Reader) -> ServiceOut:
    return service.get_service(session, actor, service_id)


@services_router.post(
    "",
    operation_id="services_create",
    summary="Thêm dịch vụ",
    status_code=201,
    response_model=ServiceOut,
    responses=_docs((409, "CONFLICT (code)")),
)
def create_service(body: ServiceCreate, request: Request, session: DbSession, actor: Manager) -> ServiceOut:
    return service.create_service(session, actor, body, request_id=get_request_id(request))


@services_router.patch(
    "/{service_id}",
    operation_id="services_update",
    summary="Sửa thông tin dịch vụ",
    response_model=ServiceOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def update_service(
    service_id: uuid.UUID, body: ServiceUpdate, request: Request, session: DbSession, actor: Manager
) -> ServiceOut:
    return service.update_service(session, actor, service_id, body, request_id=get_request_id(request))


@services_router.post(
    "/{service_id}/deactivate",
    operation_id="services_deactivate",
    summary="Ngừng kinh doanh",
    response_model=ServiceOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def deactivate_service(
    service_id: uuid.UUID, body: VersionRequest, request: Request, session: DbSession, actor: Manager
) -> ServiceOut:
    return service.deactivate_service(
        session, actor, service_id, version=body.version, request_id=get_request_id(request)
    )


@services_router.post(
    "/{service_id}/activate",
    operation_id="services_activate",
    summary="Mở lại kinh doanh",
    response_model=ServiceOut,
    responses=_docs(NOT_FOUND, CONFLICTS),
)
def activate_service(
    service_id: uuid.UUID, body: VersionRequest, request: Request, session: DbSession, actor: Manager
) -> ServiceOut:
    return service.activate_service(
        session, actor, service_id, version=body.version, request_id=get_request_id(request)
    )


@services_router.post(
    "/import/preview",
    operation_id="services_import_preview",
    summary="Xem trước import dịch vụ từ CSV",
    response_model=ImportPreview,
    responses=_docs((422, "EMPTY_FILE | MISSING_COLUMNS | TOO_MANY_ROWS | INVALID_FILE | FILE_TOO_LARGE")),
)
def import_services_preview(
    session: DbSession, actor: Manager, file: Annotated[UploadFile, File()]
) -> ImportPreview:
    file_bytes = file.file.read(MAX_FILE_BYTES + 1)
    return service.import_services_preview(session, actor, file_bytes)


@services_router.post(
    "/import/commit",
    operation_id="services_import_commit",
    summary="Xác nhận import dịch vụ từ CSV",
    status_code=201,
    response_model=ImportCommitResult,
    responses=_docs(
        (422, "EMPTY_FILE|MISSING_COLUMNS|TOO_MANY_ROWS|INVALID_FILE|FILE_TOO_LARGE|IMPORT_HAS_ERRORS")
    ),
)
def import_services_commit(
    request: Request, session: DbSession, actor: Manager, file: Annotated[UploadFile, File()]
) -> ImportCommitResult:
    file_bytes = file.file.read(MAX_FILE_BYTES + 1)
    return service.import_services_commit(session, actor, file_bytes, request_id=get_request_id(request))
