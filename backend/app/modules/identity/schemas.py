"""Request/response bodies for /api/v1/auth. Never include password hashes or tokens."""

import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
Email = Annotated[str, StringConstraints(strip_whitespace=True, max_length=254, pattern=EMAIL_PATTERN)]
Password = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class LoginRequest(BaseModel):
    # M17-03b: login by username only. No format check — anything else (an email included) is a
    # plain 401 INVALID_CREDENTIALS, not a 422 that would hint at what the field expects.
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)]
    password: Password


class EmployeeSummary(BaseModel):
    id: uuid.UUID
    code: str
    full_name: str
    roles: list[str]


class LoginResponse(BaseModel):
    employee: EmployeeSummary
    must_change_password: bool


class ChangePasswordRequest(BaseModel):
    current_password: Password
    # Length rules are checked by the domain so the user gets the Vietnamese message (AC-AUTH-017);
    # this cap only stops absurd payloads from reaching argon2.
    new_password: Annotated[str, StringConstraints(max_length=1024)]


class ForgotPasswordRequest(BaseModel):
    email: Email


class ForgotPasswordResponse(BaseModel):
    detail: str


class ResetPasswordRequest(BaseModel):
    token: Annotated[str, StringConstraints(min_length=1, max_length=256)]
    new_password: Annotated[str, StringConstraints(max_length=1024)]


class E2ELastMailResponse(BaseModel):
    """M12-01b §8: dev/CI only — GET /auth/_e2e/last-mail."""

    subject: str
    body: str


class MeDepartment(BaseModel):
    id: uuid.UUID
    name: str


class MeEmployee(BaseModel):
    id: uuid.UUID
    code: str
    full_name: str
    username: str
    email: str | None
    title: str | None
    department: MeDepartment
    # M17-03a: own profile, shown read-only on "Cá nhân".
    phone: str | None
    birth_date: date | None
    birth_place: str | None
    gender: Literal["MALE", "FEMALE", "OTHER"] | None
    address: str | None
    id_number: str | None
    id_issued_date: date | None
    id_issued_place: str | None
    marital_status: Literal["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"] | None


class MeResponse(BaseModel):
    employee: MeEmployee
    roles: list[str]
    # capability → effective scopes (a person with several roles can hold two scopes, e.g. own + self).
    capabilities: dict[str, list[str]]
    # menu badge key → count; only badges on menu items the caller can see.
    counters: dict[str, int]
    # "Thông báo" isn't a menu item (like "Cá nhân"), so it bypasses the counters/menu[].badge
    # mechanism above and is computed directly (M7-01a).
    unread_notifications_count: int
    # null khi server chưa cấu hình VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — ẩn hẳn UI đăng ký nhận
    # Web Push ở frontend (M10-05). Không phải bí mật — khoá riêng tư không bao giờ rời server.
    vapid_public_key: str | None
