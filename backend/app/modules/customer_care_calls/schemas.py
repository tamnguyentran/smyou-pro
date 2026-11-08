"""Request/response bodies for `/api/v1/customer-care-calls` (M27-01a)."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints, field_validator

from app.modules.customer_care_calls.models import MAX_TEXT_LENGTH

Offered = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TEXT_LENGTH)]
CustomerRequest = Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_TEXT_LENGTH)]


class CareCallCreate(BaseModel):
    customer_id: uuid.UUID
    offered: Offered
    customer_request: CustomerRequest | None = None

    @field_validator("customer_request")
    @classmethod
    def _blank_request_is_none(cls, value: str | None) -> str | None:
        """Blank request = the customer asked for nothing — no potential note (AC-CUS-062)."""
        return value or None


class CareCallOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    customer_phone: str
    caller_id: uuid.UUID
    caller_name: str
    offered: str
    customer_request: str | None
    called_at: datetime


class CareCallPage(BaseModel):
    items: list[CareCallOut]
    total: int
    limit: int
    offset: int
