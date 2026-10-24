"""Request/response bodies for /api/v1/customers."""

import re
import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.modules.employees.domain import normalize_phone
from app.modules.identity.schemas import Email

CustomerType = Literal["COMPANY", "INDIVIDUAL"]
Gender = Literal["MALE", "FEMALE", "OTHER"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
ContactPerson = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
TaxCode = Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
PHONE = re.compile(r"0\d{9}")


def _phone_required(value: str) -> str:
    phone = normalize_phone(value)
    if phone is None or not PHONE.fullmatch(phone):
        raise ValueError("Số điện thoại cần 10 chữ số, bắt đầu bằng 0.")
    return phone


def _phone_optional(value: str | None) -> str | None:
    return None if value is None else _phone_required(value)


class CustomerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: CustomerType
    name: Name
    contact_person: ContactPerson | None = None
    contact_person_phone: str | None = None
    phone: str
    email: Email | None = None
    tax_code: TaxCode | None = None
    address: str | None = None
    note: str | None = None
    # M15-05: chỉ hợp lệ với đúng `type` — service kiểm tra, xem domain.mismatched_fields.
    founded_date: date | None = None
    director_name: PersonName | None = None
    director_phone: str | None = None
    it_contact_name: PersonName | None = None
    it_contact_phone: str | None = None
    date_of_birth: date | None = None
    gender: Gender | None = None
    occupation: PersonName | None = None

    _check_phone = field_validator("phone")(_phone_required)
    _check_contact_person_phone = field_validator("contact_person_phone")(_phone_optional)
    _check_director_phone = field_validator("director_phone")(_phone_optional)
    _check_it_contact_phone = field_validator("it_contact_phone")(_phone_optional)


class CustomerUpdate(BaseModel):
    # code and type are not editable here: fixed at creation, immutable (spec §4).
    model_config = ConfigDict(extra="forbid")

    version: int
    name: Name | None = None
    contact_person: ContactPerson | None = None
    contact_person_phone: str | None = None
    phone: str | None = None
    email: Email | None = None
    tax_code: TaxCode | None = None
    address: str | None = None
    note: str | None = None
    founded_date: date | None = None
    director_name: PersonName | None = None
    director_phone: str | None = None
    it_contact_name: PersonName | None = None
    it_contact_phone: str | None = None
    date_of_birth: date | None = None
    gender: Gender | None = None
    occupation: PersonName | None = None

    _check_phone = field_validator("phone")(_phone_optional)
    _check_contact_person_phone = field_validator("contact_person_phone")(_phone_optional)
    _check_director_phone = field_validator("director_phone")(_phone_optional)
    _check_it_contact_phone = field_validator("it_contact_phone")(_phone_optional)


class CustomerOut(BaseModel):
    id: uuid.UUID
    code: str
    type: str
    name: str
    contact_person: str | None
    contact_person_phone: str | None
    phone: str
    email: str | None
    tax_code: str | None
    address: str | None
    note: str | None
    founded_date: date | None
    director_name: str | None
    director_phone: str | None
    it_contact_name: str | None
    it_contact_phone: str | None
    date_of_birth: date | None
    gender: str | None
    occupation: str | None
    created_by: uuid.UUID
    version: int


class CustomerMatchOut(BaseModel):
    """One other customer sharing a phone number (a warning, not an error — spec §4)."""

    id: uuid.UUID
    code: str
    name: str
    phone: str


class CustomerWritten(CustomerOut):
    duplicate_phone_matches: list[CustomerMatchOut]


class CustomerPage(BaseModel):
    items: list[CustomerOut]
    total: int
    limit: int
    offset: int
