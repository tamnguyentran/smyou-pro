"""Order domain model (DOMAIN_MODEL §5/§6, M3-02a). Orders in this slice always stay DRAFT."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.modules.catalog.models import SERVICE_UNITS

DIVISIONS = ("OFFICE_EQUIPMENT", "SECURITY", "GENERAL")
PRIORITIES = ("LOW", "NORMAL", "HIGH", "URGENT")
PAYMENT_STATUSES = ("UNPAID", "PAID", "PAY_LATER")
PAYMENT_METHODS = ("CASH", "BANK_TRANSFER")
STATUSES = (
    "DRAFT",
    "PENDING_DISPATCH",
    "IN_PROGRESS",
    "AWAITING_CONFIRMATION",
    "COMPLETED",
    "REVISION",
    "CANCELLED",
)
ITEM_TYPES = ("PRODUCT", "SERVICE", "CUSTOM")
LINE_UNITS = SERVICE_UNITS  # order_lines.unit_snapshot: union of Product + Service units


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(_in("status", STATUSES), name="status"),
        CheckConstraint(_in("priority", PRIORITIES), name="priority"),
        CheckConstraint(_in("payment_status", PAYMENT_STATUSES), name="payment_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(String(20), unique=True)
    status: Mapped[str] = mapped_column(String(30), server_default=text("'DRAFT'"), index=True)
    division: Mapped[str | None] = mapped_column(String(30))
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.id"), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255))
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    customer_email: Mapped[str | None] = mapped_column(String(255))
    customer_tax_code: Mapped[str | None] = mapped_column(String(20))
    service_address: Mapped[str] = mapped_column(Text, server_default=text("''"))
    work_description: Mapped[str] = mapped_column(Text, server_default=text("''"))
    priority: Mapped[str] = mapped_column(String(20), server_default=text("'NORMAL'"))
    requested_date: Mapped[date | None] = mapped_column(Date)
    subtotal: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    discount_amount: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    vat_amount: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    total: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    payment_status: Mapped[str] = mapped_column(String(20), server_default=text("'UNPAID'"))
    payment_method: Mapped[str | None] = mapped_column(String(20))
    customer_feedback: Mapped[str | None] = mapped_column(Text)
    result_note: Mapped[str | None] = mapped_column(Text)
    confirmation_signer_name: Mapped[str | None] = mapped_column(String(120))
    revision_no: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="order", order_by="OrderLine.position", cascade="all, delete-orphan"
    )


class OrderRevision(Base):
    """One row per `request_revision` command (DOMAIN_MODEL §7, M6-03a)."""

    __tablename__ = "order_revisions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    revision_no: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), index=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrderLine(Base):
    __tablename__ = "order_lines"
    __table_args__ = (
        CheckConstraint(_in("item_type", ITEM_TYPES), name="item_type"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("line_discount >= 0", name="line_discount_non_negative"),
        CheckConstraint("vat_rate >= 0 AND vat_rate <= 100", name="vat_rate_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    item_type: Mapped[str] = mapped_column(String(20))
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), index=True)
    service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("services.id"), index=True)
    sku_snapshot: Mapped[str | None] = mapped_column(String(40))
    name_snapshot: Mapped[str] = mapped_column(String(255))
    unit_snapshot: Mapped[str] = mapped_column(String(20))
    specs_snapshot: Mapped[str | None] = mapped_column(Text)
    warranty_months_snapshot: Mapped[int | None] = mapped_column(SmallInteger)
    catalog_price_snapshot: Mapped[int | None] = mapped_column(BigInteger)
    price_fixed: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    unit_price: Mapped[int] = mapped_column(BigInteger)
    is_gift: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    line_discount: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    line_gross: Mapped[int] = mapped_column(BigInteger)
    line_vat: Mapped[int] = mapped_column(BigInteger)
    line_total: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="lines")
