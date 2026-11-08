"""Request/response bodies for `/api/v1/orders/{order_id}/customer-potential` (M21-05a)."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.modules.customer_potential.models import MAX_NOTE_LENGTH

Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NOTE_LENGTH)]


class CustomerPotentialNoteCreate(BaseModel):
    note: Note


class CustomerPotentialNoteOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    order_id: uuid.UUID | None
    order_code: str | None
    source: Literal["ORDER", "CARE_CALL"]
    note: str
    author_id: uuid.UUID
    author_name: str
    created_at: datetime
