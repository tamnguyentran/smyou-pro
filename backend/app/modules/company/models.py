"""CompanyProfile domain model (DOMAIN_MODEL §15, M17-01): exactly one row, id = 1."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, SmallInteger, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class CompanyProfile(Base):
    __tablename__ = "company_profile"
    __table_args__ = (CheckConstraint("id = 1", name="singleton"),)

    id: Mapped[int] = mapped_column(
        SmallInteger, primary_key=True, server_default=text("1"), autoincrement=False
    )
    name: Mapped[str] = mapped_column(String(255))
    tax_code: Mapped[str] = mapped_column(String(14))
    address: Mapped[str] = mapped_column(String(500))
    phone: Mapped[str] = mapped_column(String(20))
    phone_secondary: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fax: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_attachment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("attachments.id"), nullable=True)
    version: Mapped[int] = mapped_column(server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
