"""Request/response bodies for /api/v1/customer-gifts (M16-01a)."""

import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class EmployeeRef(BaseModel):
    id: uuid.UUID
    code: str
    full_name: str


class CustomerGiftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_id: uuid.UUID
    occasion_name: Name
    performed_date: date
    gift_name: Name
    quantity: Annotated[int, Field(gt=0)]
    unit_price: Annotated[int, Field(ge=0)]
    other_cost: Annotated[int, Field(ge=0)] = 0
    performed_by: uuid.UUID
    requested_by: uuid.UUID
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class CustomerGiftUpdate(BaseModel):
    # customer_id is not editable here: fixed at creation, immutable (spec §2).
    model_config = ConfigDict(extra="forbid")

    version: int
    occasion_name: Name | None = None
    performed_date: date | None = None
    gift_name: Name | None = None
    quantity: Annotated[int, Field(gt=0)] | None = None
    unit_price: Annotated[int, Field(ge=0)] | None = None
    other_cost: Annotated[int, Field(ge=0)] | None = None
    performed_by: uuid.UUID | None = None
    requested_by: uuid.UUID | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class CustomerGiftOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    occasion_name: str
    performed_date: date
    gift_name: str
    quantity: int
    unit_price: int
    other_cost: int
    total_amount: int
    note: str | None
    performed_by: EmployeeRef
    requested_by: EmployeeRef
    created_by: uuid.UUID
    version: int
    created_at: datetime
    updated_at: datetime


class CustomerGiftPage(BaseModel):
    items: list[CustomerGiftOut]
    total: int
    limit: int
    offset: int


class GiftPhoto(BaseModel):
    id: uuid.UUID
    mime_type: str
    size_bytes: int
    uploaded_by: uuid.UUID
    uploaded_by_name: str
    created_at: datetime


class GiftPhotoPage(BaseModel):
    items: list[GiftPhoto]
