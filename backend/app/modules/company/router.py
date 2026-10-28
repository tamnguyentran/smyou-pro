"""/api/v1/company-profile — thin HTTP layer (M17-01)."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.core.request_id import get_request_id
from app.modules.company import service
from app.modules.company.schemas import CompanyProfileOut, CompanyProfileUpdate

router = APIRouter(prefix="/api/v1/company-profile", tags=["company-profile"])
Manager = Annotated[Actor, Depends(require("company.manage"))]


@router.get(
    "",
    operation_id="company_profile_get",
    summary="Thông tin công ty",
    response_model=CompanyProfileOut,
)
def get_profile(session: DbSession, actor: Manager) -> CompanyProfileOut:
    return service.get_profile(session)


@router.patch(
    "",
    operation_id="company_profile_update",
    summary="Sửa thông tin công ty",
    response_model=CompanyProfileOut,
    responses={409: {"description": "problem+json — STALE_VERSION"}},
)
def update_profile(
    body: CompanyProfileUpdate, request: Request, session: DbSession, actor: Manager
) -> CompanyProfileOut:
    return service.update_profile(session, actor, body, request_id=get_request_id(request))


@router.post(
    "/logo",
    operation_id="company_profile_upload_logo",
    summary="Tải logo công ty (thay logo cũ)",
    response_model=CompanyProfileOut,
    responses={
        409: {"description": "problem+json — STALE_VERSION"},
        422: {"description": "problem+json — INVALID_FILE_TYPE | FILE_TOO_LARGE | UNSUPPORTED_MEDIA_TYPE"},
    },
)
def upload_logo(
    request: Request,
    session: DbSession,
    actor: Manager,
    version: Annotated[int, Query()],
    file: Annotated[UploadFile, File()],
) -> CompanyProfileOut:
    settings = request.app.state.settings
    max_bytes = settings.upload_max_mb * 1024 * 1024
    return service.upload_logo(
        session,
        actor,
        version=version,
        file_bytes=file.file.read(max_bytes + 1),
        filename=file.filename or "logo",
        declared_mime=file.content_type or "application/octet-stream",
        settings=settings,
        now=request.app.state.clock(),
        request_id=get_request_id(request),
    )
