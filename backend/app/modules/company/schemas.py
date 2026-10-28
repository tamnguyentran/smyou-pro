"""Request/response bodies for /api/v1/company-profile (M17-01)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.modules.company.domain import check_phone, check_tax_code, check_website
from app.modules.identity.schemas import Email


def _required_text(value: str | None, *, missing: str, max_length: int) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError(missing)
    if len(text) > max_length:
        raise ValueError(f"Tối đa {max_length} ký tự.")
    return text


def _blank_to_none(value: object) -> object:
    return None if isinstance(value, str) and not value.strip() else value


class CompanyProfileUpdate(BaseModel):
    """Every field optional except `version`; only fields sent are changed. Required columns sent as
    null are rejected (AC-SYS-126), optional ones sent null/blank are cleared."""

    model_config = ConfigDict(extra="forbid")

    version: int
    name: str | None = None
    tax_code: str | None = None
    address: str | None = None
    phone: str | None = None
    phone_secondary: str | None = None
    fax: str | None = None
    email: Email | None = None
    website: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str:
        return _required_text(value, missing="Vui lòng nhập tên công ty.", max_length=255)

    @field_validator("address")
    @classmethod
    def _address(cls, value: str | None) -> str:
        return _required_text(value, missing="Vui lòng nhập địa chỉ.", max_length=500)

    @field_validator("tax_code")
    @classmethod
    def _tax_code(cls, value: str | None) -> str:
        return check_tax_code(_required_text(value, missing="Vui lòng nhập mã số thuế.", max_length=14))

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str:
        return check_phone(_required_text(value, missing="Vui lòng nhập số điện thoại.", max_length=20))

    @field_validator("phone_secondary", "fax", "email", "website", mode="before")
    @classmethod
    def _optional_blank(cls, value: object) -> object:
        return _blank_to_none(value)

    @field_validator("phone_secondary", "fax")
    @classmethod
    def _optional_phone(cls, value: str | None) -> str | None:
        return None if value is None else check_phone(value)

    @field_validator("website")
    @classmethod
    def _website(cls, value: str | None) -> str | None:
        return None if value is None else check_website(value)


class CompanyProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    tax_code: str
    address: str
    phone: str
    phone_secondary: str | None
    fax: str | None
    email: str | None
    website: str | None
    logo_attachment_id: uuid.UUID | None
    version: int
    updated_at: datetime
