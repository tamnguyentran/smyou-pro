"""CustomerGift domain model (DOMAIN_MODEL §14, M16-01a). No order_id (Q98)."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class CustomerGift(Base):
    __tablename__ = "customer_gifts"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("other_cost >= 0", name="other_cost_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), index=True)
    occasion_name: Mapped[str] = mapped_column(String(255))
    performed_date: Mapped[date] = mapped_column(Date)
    gift_name: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(BigInteger)
    unit_price: Mapped[int] = mapped_column(BigInteger)
    other_cost: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    total_amount: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    performed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), index=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), index=True)
    version: Mapped[int] = mapped_column(server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
