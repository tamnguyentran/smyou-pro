"""Customer "Tiềm năng sử dụng dịch vụ" notes (M21-05a) — append-only; the newest row per customer is
its current potential (Q156: tied to the customer, whichever order it was written on)."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

MAX_NOTE_LENGTH = 1000


class CustomerPotentialNote(Base):
    __tablename__ = "customer_potential_notes"
    __table_args__ = (
        CheckConstraint(f"length(note) BETWEEN 1 AND {MAX_NOTE_LENGTH}", name="note_length"),
        Index("ix_customer_potential_notes_customer_id_created_at", "customer_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"))
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"), index=True)
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
