"""Customer "Tiềm năng sử dụng dịch vụ" notes (M21-05a) — append-only; the newest row per customer is
its current potential (Q156: tied to the customer, whichever order it was written on). M27-01a: a note
comes either from an order (technician) or from a customer-care call — exactly one of the two."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.modules.customer_care_calls.models import CustomerCareCall

MAX_NOTE_LENGTH = 1000  # what a technician may type (M21-05a)
# M27-01a: a care-call request (≤ 2000 chars) is stored as a note too, so the column allows more.
MAX_STORED_NOTE_LENGTH = 2000


class CustomerPotentialNote(Base):
    __tablename__ = "customer_potential_notes"
    __table_args__ = (
        CheckConstraint(f"length(note) BETWEEN 1 AND {MAX_STORED_NOTE_LENGTH}", name="note_length"),
        CheckConstraint("num_nonnulls(order_id, care_call_id) = 1", name="one_source"),
        Index("ix_customer_potential_notes_customer_id_created_at", "customer_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"))
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    care_call_id: Mapped[uuid.UUID | None] = mapped_column(
        # Referencing the table object (not a string) registers it wherever this model is loaded.
        ForeignKey(CustomerCareCall.__table__.c.id, ondelete="RESTRICT"),
        index=True,
    )
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"), index=True)
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
