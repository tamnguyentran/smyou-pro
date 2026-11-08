"""Customer-care calls (M27-01a) — append-only; `called_at` is when the call was saved."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

MAX_TEXT_LENGTH = 2000


class CustomerCareCall(Base):
    __tablename__ = "customer_care_calls"
    __table_args__ = (
        CheckConstraint(f"length(offered) BETWEEN 1 AND {MAX_TEXT_LENGTH}", name="offered_length"),
        CheckConstraint(
            f"customer_request IS NULL OR length(customer_request) BETWEEN 1 AND {MAX_TEXT_LENGTH}",
            name="customer_request_length",
        ),
        Index("ix_customer_care_calls_caller_id_called_at", "caller_id", text("called_at DESC")),
        Index("ix_customer_care_calls_customer_id_called_at", "customer_id", text("called_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"))
    caller_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"))
    offered: Mapped[str] = mapped_column(Text)
    customer_request: Mapped[str | None] = mapped_column(Text)
    called_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
