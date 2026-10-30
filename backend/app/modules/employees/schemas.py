"""Request/response bodies for /api/v1/employees. Never include password hashes."""

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.modules.employees.domain import normalize_phone
from app.modules.identity.schemas import Email
from app.modules.identity.usernames import USERNAME_MAX_LENGTH, USERNAME_PATTERN

Role = Literal["MANAGER", "SALE", "CUSTOMER_CARE", "TECH_LEAD", "TECHNICIAN"]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]
Roles = Annotated[list[Role], Field(min_length=1)]
Username = Annotated[
    str,
    StringConstraints(min_length=3, max_length=USERNAME_MAX_LENGTH, pattern=USERNAME_PATTERN),
    # before the pattern: "Binh.Le" is accepted as "binh.le" (citext compares case-insensitively anyway)
    BeforeValidator(lambda v: v.strip().lower() if isinstance(v, str) else v),
]
PHONE = re.compile(r"0\d{9}")
VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")
Gender = Literal["MALE", "FEMALE", "OTHER"]
MaritalStatus = Literal["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"]


def _blank_to_none(value: object) -> object:
    """M17-03a §4: optional strings are trimmed; blank → null."""
    if isinstance(value, str):
        return value.strip() or None
    return value


def _not_in_future(value: date) -> date:
    if value > datetime.now(VIETNAM).date():
        raise ValueError("Ngày không được ở tương lai.")
    return value


Blank = BeforeValidator(_blank_to_none)
OptionalEmail = Annotated[Email | None, Blank]
PastDate = Annotated[date, AfterValidator(_not_in_future)]
IdNumber = Annotated[str, StringConstraints(pattern=r"^([0-9]{9}|[0-9]{12})$")]
Place = Annotated[str, StringConstraints(max_length=120)]
Address = Annotated[str, StringConstraints(max_length=255)]


class EmployeeProfile(BaseModel):
    """M17-03a personal fields, all optional; shared by create, update and the response."""

    birth_date: PastDate | None = None
    birth_place: Annotated[Place | None, Blank] = None
    gender: Gender | None = None
    address: Annotated[Address | None, Blank] = None
    id_number: Annotated[IdNumber | None, Blank] = None
    id_issued_date: PastDate | None = None
    id_issued_place: Annotated[Place | None, Blank] = None
    marital_status: MaritalStatus | None = None


def _phone(value: str | None) -> str | None:
    if value is None:
        return None
    phone = normalize_phone(value)
    if phone is not None and not PHONE.fullmatch(phone):
        raise ValueError("Số điện thoại cần 10 chữ số, bắt đầu bằng 0.")
    return phone


class EmployeeCreate(EmployeeProfile):
    # Consistent with EmployeeUpdate: unknown fields (e.g. a stray is_active) are rejected, not ignored.
    model_config = ConfigDict(extra="forbid")

    full_name: FullName
    email: OptionalEmail = None
    phone: str | None = None
    department_id: uuid.UUID
    title: Title | None = None
    roles: Roles

    _check_phone = field_validator("phone")(_phone)


class EmployeeUpdate(EmployeeProfile):
    # is_active / roles / code are not editable here: state changes are named commands (CLAUDE.md #4).
    model_config = ConfigDict(extra="forbid")

    version: int
    full_name: FullName | None = None
    username: Username | None = None  # M17-03b (Q106); generated on create, never sent there
    email: OptionalEmail = None
    phone: str | None = None
    department_id: uuid.UUID | None = None
    title: Title | None = None

    _check_phone = field_validator("phone")(_phone)


class RolesRequest(BaseModel):
    version: int
    roles: Roles


class VersionRequest(BaseModel):
    version: int


class EmployeeDepartment(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool


class EmployeeOut(BaseModel):
    id: uuid.UUID
    code: str
    full_name: str
    username: str
    email: str | None
    phone: str | None
    birth_date: date | None
    birth_place: str | None
    gender: Gender | None
    address: str | None
    id_number: str | None
    id_issued_date: date | None
    id_issued_place: str | None
    marital_status: MaritalStatus | None
    department: EmployeeDepartment
    title: str | None
    roles: list[str]
    is_active: bool
    # Temporarily locked after repeated wrong passwords (Q19).
    is_locked: bool
    must_change_password: bool
    version: int


class EmployeeLookupOut(BaseModel):
    """M16-11: slim row for pickers — no email/roles/lock state."""

    id: uuid.UUID
    code: str
    full_name: str
    phone: str | None
    is_active: bool


class EmployeePage(BaseModel):
    items: list[EmployeeOut]
    total: int
    limit: int
    offset: int


class EmployeeWithPassword(BaseModel):
    employee: EmployeeOut
    # Shown once to the Manager (Q33); never stored or logged in clear.
    temporary_password: str
