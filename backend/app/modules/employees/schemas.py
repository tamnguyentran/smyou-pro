"""Request/response bodies for /api/v1/employees. Never include password hashes."""

import re
import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.modules.employees.domain import normalize_phone
from app.modules.identity.schemas import Email

Role = Literal["MANAGER", "SALE", "TECH_LEAD", "TECHNICIAN"]
Department = Literal["MANAGEMENT", "SALES", "TECHNICAL"]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]
Roles = Annotated[list[Role], Field(min_length=1)]
PHONE = re.compile(r"0\d{9}")


def _phone(value: str | None) -> str | None:
    if value is None:
        return None
    phone = normalize_phone(value)
    if phone is not None and not PHONE.fullmatch(phone):
        raise ValueError("Số điện thoại cần 10 chữ số, bắt đầu bằng 0.")
    return phone


class EmployeeCreate(BaseModel):
    full_name: FullName
    email: Email
    phone: str | None = None
    department: Department
    title: Title | None = None
    roles: Roles

    _check_phone = field_validator("phone")(_phone)


class EmployeeUpdate(BaseModel):
    version: int
    full_name: FullName | None = None
    email: Email | None = None
    phone: str | None = None
    department: Department | None = None
    title: Title | None = None

    _check_phone = field_validator("phone")(_phone)


class RolesRequest(BaseModel):
    version: int
    roles: Roles


class VersionRequest(BaseModel):
    version: int


class EmployeeOut(BaseModel):
    id: uuid.UUID
    code: str
    full_name: str
    email: str
    phone: str | None
    department: str
    title: str | None
    roles: list[str]
    is_active: bool
    # Temporarily locked after repeated wrong passwords (Q19).
    is_locked: bool
    must_change_password: bool
    version: int


class EmployeePage(BaseModel):
    items: list[EmployeeOut]
    total: int
    limit: int
    offset: int


class EmployeeWithPassword(BaseModel):
    employee: EmployeeOut
    # Shown once to the Manager (Q33); never stored or logged in clear.
    temporary_password: str
