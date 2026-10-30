"""/api/v1/auth — thin HTTP layer: parse, call service, set or clear session cookies."""

import json
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.core.authz import Actor, require
from app.core.config import Settings
from app.core.db import DbSession
from app.core.errors import problem_response
from app.core.request_id import get_request_id
from app.modules.identity import service
from app.modules.identity.schemas import (
    ChangePasswordRequest,
    E2ELastMailResponse,
    EmployeeSummary,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    MeResponse,
    ResetPasswordRequest,
)
from app.modules.identity.service import ACCESS_COOKIE, Failure, Issued, Mailer


def _deferred_mailer(background_tasks: BackgroundTasks, mailer: Mailer) -> Mailer:
    """Schedule the real SMTP send after the response is built instead of calling it inline —
    blocking on SMTP before responding let an attacker tell existing from unknown emails apart by
    forgot-password response latency (independent security review, M12-01b)."""

    def _schedule(settings: Settings, to: str, subject: str, body: str) -> None:
        background_tasks.add_task(mailer, settings, to, subject, body)

    return _schedule


def _e2e_last_mail_for(settings: Settings, email: str) -> dict[str, str] | None:
    """M12-01b §8: last captured email to `email`, or None if unset/unmatched (dev/CI only).

    Also refuses in production regardless of config, as defense-in-depth (independent security
    review, M12-01b) — the prior version relied only on `MAIL_CAPTURE_FILE` being unset."""
    if settings.app_env == "production":
        return None
    if settings.mail_capture_file is None or not settings.mail_capture_file.exists():
        return None
    target = email.strip().lower()
    latest: dict[str, str] | None = None
    for line in settings.mail_capture_file.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        entry = json.loads(line)
        if entry.get("to", "").strip().lower() == target:
            latest = entry
    return latest


def _e2e_not_found(request: Request) -> JSONResponse:
    return problem_response(request, 404, "NOT_FOUND", "Không tìm thấy tài nguyên.")


REFRESH_COOKIE = "smyou_refresh"
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
me_router = APIRouter(prefix="/api/v1", tags=["me"])

_FAILURES: dict[Failure, tuple[int, str]] = {
    Failure.INVALID_CREDENTIALS: (401, "Tên đăng nhập hoặc mật khẩu không đúng."),
    Failure.ACCOUNT_LOCKED: (
        423,
        "Tài khoản tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau 15 phút.",
    ),
    Failure.ACCOUNT_DISABLED: (403, "Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản lý."),
    Failure.UNAUTHENTICATED: (401, "Vui lòng đăng nhập."),
    Failure.SESSION_REVOKED: (401, "Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại."),
    Failure.TOO_MANY_REQUESTS: (429, "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau."),
    Failure.INVALID_RESET: (422, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."),
}


def _responses(*failures: Failure) -> dict[int | str, dict[str, Any]]:
    """OpenAPI error docs for one endpoint; failures sharing a status are listed together."""
    docs: dict[int | str, list[str]] = {}
    for failure in failures:
        status, detail = _FAILURES[failure]
        docs.setdefault(status, []).append(f"{failure.value}: {detail}")
    return {status: {"description": "problem+json — " + " | ".join(lines)} for status, lines in docs.items()}


def _settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def _now(request: Request) -> datetime:
    now: datetime = request.app.state.clock()
    return now


def _user_agent(request: Request) -> str:
    return request.headers.get("user-agent", "")


def _mailer(request: Request) -> Mailer:
    mailer: Mailer = request.app.state.mailer
    return mailer


def _cookie_paths(settings: Settings) -> tuple[str, str]:
    return f"{settings.base_path}/", f"{settings.base_path}/api/v1/auth"


def _set_session_cookies(response: Response, settings: Settings, issued: Issued) -> None:
    access_path, refresh_path = _cookie_paths(settings)
    for name, value, max_age, path in (
        (ACCESS_COOKIE, issued.access_token, settings.access_token_minutes * 60, access_path),
        (REFRESH_COOKIE, issued.refresh_token, settings.refresh_token_days * 24 * 3600, refresh_path),
    ):
        response.set_cookie(
            name,
            value,
            max_age=max_age,
            path=path,
            httponly=True,
            samesite="lax",
            secure=settings.cookie_secure,
        )


def _clear_session_cookies(response: Response, settings: Settings) -> None:
    access_path, refresh_path = _cookie_paths(settings)
    for name, path in ((ACCESS_COOKIE, access_path), (REFRESH_COOKIE, refresh_path)):
        response.delete_cookie(name, path=path, httponly=True, samesite="lax", secure=settings.cookie_secure)


def _failure(request: Request, failure: Failure, *, clear_cookies: bool = False) -> JSONResponse:
    # Returned, not raised: the request transaction must still commit (failed-login counter, revocations).
    status, detail = _FAILURES[failure]
    response = problem_response(request, status, failure.value, detail)
    if clear_cookies:
        _clear_session_cookies(response, _settings(request))
    return response


def _body(issued: Issued) -> LoginResponse:
    employee = issued.employee
    summary = EmployeeSummary(
        id=employee.id,
        code=employee.code,
        full_name=employee.full_name,
        roles=sorted(r.role for r in employee.roles),
    )
    return LoginResponse(employee=summary, must_change_password=employee.must_change_password)


@router.post(
    "/login",
    operation_id="auth_login",
    summary="Đăng nhập bằng tên đăng nhập và mật khẩu",
    response_model=LoginResponse,
    responses=_responses(Failure.INVALID_CREDENTIALS, Failure.ACCOUNT_DISABLED, Failure.ACCOUNT_LOCKED),
)
def login(
    body: LoginRequest, request: Request, response: Response, session: DbSession
) -> LoginResponse | JSONResponse:
    settings = _settings(request)
    result = service.login(
        session,
        username=body.username,
        password=body.password,
        now=_now(request),
        settings=settings,
        user_agent=_user_agent(request),
        request_id=get_request_id(request),
    )
    if isinstance(result, Failure):
        return _failure(request, result)
    _set_session_cookies(response, settings, result)
    return _body(result)


@router.post(
    "/refresh",
    operation_id="auth_refresh",
    summary="Làm mới phiên đăng nhập (xoay vòng refresh token)",
    response_model=LoginResponse,
    responses=_responses(Failure.UNAUTHENTICATED, Failure.SESSION_REVOKED),
)
def refresh(request: Request, response: Response, session: DbSession) -> LoginResponse | JSONResponse:
    settings = _settings(request)
    result = service.refresh(
        session,
        refresh_token=request.cookies.get(REFRESH_COOKIE),
        now=_now(request),
        settings=settings,
        user_agent=_user_agent(request),
    )
    if isinstance(result, Failure):
        return _failure(request, result, clear_cookies=True)
    _set_session_cookies(response, settings, result)
    return _body(result)


@router.post("/logout", operation_id="auth_logout", summary="Đăng xuất", status_code=204)
def logout(request: Request, session: DbSession) -> Response:
    service.logout(session, refresh_token=request.cookies.get(REFRESH_COOKIE), now=_now(request))
    response = Response(status_code=204)
    _clear_session_cookies(response, _settings(request))
    return response


@router.post(
    "/change-password",
    operation_id="auth_change_password",
    summary="Đổi mật khẩu của chính mình",
    status_code=204,
    responses={
        **_responses(Failure.UNAUTHENTICATED, Failure.ACCOUNT_LOCKED),
        422: {"description": "problem+json — VALIDATION_ERROR (current_password / new_password)"},
    },
)
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    session: DbSession,
    actor: Annotated[Actor, Depends(require("profile.manage", allow_pending_password_change=True))],
) -> Response:
    settings = _settings(request)
    result = service.change_password(
        session,
        actor,
        current_password=body.current_password,
        new_password=body.new_password,
        now=_now(request),
        settings=settings,
        user_agent=_user_agent(request),
        request_id=get_request_id(request),
    )
    if isinstance(result, Failure):
        return _failure(request, result, clear_cookies=True)
    if isinstance(result, list):
        # Returned, not raised, so the failed-attempt counter is committed.
        errors = [{"field": field, "code": "invalid", "message": message} for field, message in result]
        return problem_response(request, 422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", errors=errors)
    response = Response(status_code=204)
    _set_session_cookies(response, settings, result)
    return response


@router.post(
    "/forgot-password",
    operation_id="auth_forgot_password",
    summary="Yêu cầu link đặt lại mật khẩu qua email",
    response_model=ForgotPasswordResponse,
    responses={
        **_responses(Failure.TOO_MANY_REQUESTS),
        422: {"description": "problem+json — VALIDATION_ERROR (email)"},
    },
)
def forgot_password(
    body: ForgotPasswordRequest, request: Request, session: DbSession, background_tasks: BackgroundTasks
) -> ForgotPasswordResponse | JSONResponse:
    result = service.forgot_password(
        session,
        email=body.email,
        now=_now(request),
        settings=_settings(request),
        mailer=_deferred_mailer(background_tasks, _mailer(request)),
    )
    if isinstance(result, Failure):
        return _failure(request, result)
    return ForgotPasswordResponse(detail=service.FORGOT_DETAIL)


@router.post(
    "/reset-password",
    operation_id="auth_reset_password",
    summary="Đặt mật khẩu mới bằng token nhận qua email",
    status_code=204,
    responses={
        **_responses(Failure.INVALID_RESET),
        422: {"description": "problem+json — INVALID_RESET_TOKEN | VALIDATION_ERROR (new_password)"},
    },
)
def reset_password(body: ResetPasswordRequest, request: Request, session: DbSession) -> Response:
    settings = _settings(request)
    result = service.reset_password(
        session, token=body.token, new_password=body.new_password, now=_now(request), settings=settings
    )
    if isinstance(result, Failure):
        return _failure(request, result)
    if isinstance(result, list):
        errors = [{"field": field, "code": "invalid", "message": message} for field, message in result]
        return problem_response(request, 422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", errors=errors)
    response = Response(status_code=204)
    _clear_session_cookies(response, settings)
    return response


@router.get(
    "/_e2e/last-mail",
    operation_id="auth_e2e_last_mail",
    summary="[E2E] Email cuối gửi tới một địa chỉ (chỉ hoạt động khi MAIL_CAPTURE_FILE được set)",
    response_model=E2ELastMailResponse,
    responses={404: {"description": "MAIL_CAPTURE_FILE chưa được cấu hình, hoặc không có email nào khớp"}},
)
def e2e_last_mail(email: str, request: Request) -> E2ELastMailResponse | JSONResponse:
    mail = _e2e_last_mail_for(_settings(request), email)
    if mail is None:
        return _e2e_not_found(request)
    return E2ELastMailResponse(subject=mail["subject"], body=mail["body"])


@me_router.get(
    "/me",
    operation_id="me_get",
    summary="Thông tin, vai trò, quyền và bộ đếm của người đang đăng nhập",
    response_model=MeResponse,
    responses={
        401: {"description": "problem+json — UNAUTHENTICATED: Vui lòng đăng nhập."},
        403: {"description": "problem+json — PASSWORD_CHANGE_REQUIRED | FORBIDDEN"},
    },
)
def me(
    request: Request, session: DbSession, actor: Annotated[Actor, Depends(require("profile.manage"))]
) -> MeResponse:
    settings: Settings = request.app.state.settings
    return service.me(
        session,
        actor,
        request.app.state.specs.permissions,
        request.app.state.counters,
        vapid_public_key=settings.vapid_public_key,
    )
