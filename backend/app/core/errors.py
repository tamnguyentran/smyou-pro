"""RFC 9457 problem+json error responses (ARCHITECTURE §4)."""

import logging
from http import HTTPStatus
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_id import REQUEST_ID_HEADER, get_request_id

logger = logging.getLogger(__name__)

PROBLEM_MEDIA_TYPE = "application/problem+json"

_HTTP_CODES = {
    400: ("BAD_REQUEST", "Yêu cầu không hợp lệ."),
    401: ("UNAUTHENTICATED", "Vui lòng đăng nhập."),
    403: ("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này."),
    404: ("NOT_FOUND", "Không tìm thấy tài nguyên."),
    405: ("METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ."),
}


class AppError(Exception):
    """Expected, user-facing error. `detail` must be Vietnamese and safe to show."""

    def __init__(
        self,
        status: int,
        code: str,
        detail: str,
        *,
        errors: list[dict[str, str]] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.detail = detail
        self.errors = errors
        self.extra = extra or {}


def problem_response(
    request: Request,
    status: int,
    code: str,
    detail: str,
    *,
    errors: list[dict[str, str]] | None = None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    request_id = get_request_id(request)
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "code": code,
        "detail": detail,
        "instance": request.url.path,
        "request_id": request_id,
        **(extra or {}),
    }
    if errors is not None:
        body["errors"] = errors
    headers = {REQUEST_ID_HEADER: request_id} if request_id else None
    return JSONResponse(body, status_code=status, media_type=PROBLEM_MEDIA_TYPE, headers=headers)


def _field_name(loc: tuple[Any, ...]) -> str:
    parts = [str(p) for p in loc]
    if parts and parts[0] in {"body", "query", "path", "header", "cookie"}:
        parts = parts[1:]
    return ".".join(parts) or "body"


async def _app_error(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(AppError, exc)
    return problem_response(request, exc.status, exc.code, exc.detail, errors=exc.errors, extra=exc.extra)


async def _http_error(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(StarletteHTTPException, exc)
    code, detail = _HTTP_CODES.get(exc.status_code, ("HTTP_ERROR", "Yêu cầu không thể xử lý."))
    return problem_response(request, exc.status_code, code, detail)


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(RequestValidationError, exc)
    errors = [
        {"field": _field_name(tuple(err["loc"])), "code": str(err["type"]), "message": str(err["msg"])}
        for err in exc.errors()
    ]
    return problem_response(request, 422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", errors=errors)


async def _unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", extra={"request_id": get_request_id(request)})
    return problem_response(request, 500, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled_error)
