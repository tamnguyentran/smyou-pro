"""Product and service catalog (DOMAIN_MODEL §2, §3)."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

CATEGORIES = (
    "PC",
    "LAPTOP",
    "MONITOR",
    "PRINTER",
    "SCANNER",
    "PRINTER_SUPPLY",
    "CAMERA",
    "RECORDER",
    "STORAGE",
    "NETWORK",
    "ACCESSORY",
    "MATERIAL",
    "SOFTWARE",
    "OTHER",
)
UNITS = ("CAI", "MAY", "BO", "MET", "CUON", "HOP", "LICENSE")

SERVICE_CATEGORIES = (
    "INSTALLATION",
    "REPAIR",
    "MAINTENANCE",
    "REFILL",
    "SOFTWARE",
    "NETWORK_CABLING",
    "OTHER",
)
SERVICE_UNITS = (*UNITS, "LAN", "DIEM", "GIO")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint(_in("category", CATEGORIES), name="category"),
        CheckConstraint(_in("unit", UNITS), name="unit"),
        CheckConstraint("price >= 0", name="price_non_negative"),
        CheckConstraint("vat_rate >= 0 AND vat_rate <= 100", name="vat_rate_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    sku: Mapped[str] = mapped_column(CITEXT, unique=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(20), index=True)
    brand: Mapped[str | None] = mapped_column(String(60))
    unit: Mapped[str] = mapped_column(String(20))
    price: Mapped[int] = mapped_column(BigInteger)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default=text("8"))
    price_fixed: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    warranty_months: Mapped[int | None] = mapped_column(SmallInteger)
    specs: Mapped[str | None] = mapped_column(Text)
    image_attachment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("attachments.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), index=True)
    version: Mapped[int] = mapped_column(server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Service(Base):
    """Service catalog (DOMAIN_MODEL §3, M2-02). Unlike Product, no image field."""

    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint(_in("category", SERVICE_CATEGORIES), name="category"),
        CheckConstraint(_in("unit", SERVICE_UNITS), name="unit"),
        CheckConstraint("price >= 0", name="price_non_negative"),
        CheckConstraint("vat_rate >= 0 AND vat_rate <= 100", name="vat_rate_range"),
        CheckConstraint(
            "default_estimated_hours IS NULL OR default_estimated_hours >= 0",
            name="default_estimated_hours_non_negative",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(CITEXT, unique=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(20), index=True)
    unit: Mapped[str] = mapped_column(String(20))
    price: Mapped[int] = mapped_column(BigInteger)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default=text("8"))
    price_fixed: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    default_estimated_hours: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), index=True)
    version: Mapped[int] = mapped_column(server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
