"""Request/response bodies for /api/v1/auth. Never include password hashes or tokens."""

import uuid
from typing import Annotated

from pydantic import BaseModel, StringConstraints

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
Email = Annotated[str, StringConstraints(strip_whitespace=True, max_length=254, pattern=EMAIL_PATTERN)]
Password = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class LoginRequest(BaseModel):
    email: Email
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
