"""Departments (M17-02a) — organisational info only, never a permission source (GLOSSARY)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Seeded by the M17-02a migration with fixed ids; M17-02b maps the old employees.department enum
# onto these (bootstrap Manager → "Ban quản lý").
LEGACY_DEPARTMENT_IDS = {
    "MANAGEMENT": uuid.UUID("d1111111-1111-4111-8111-111111111111"),
    "SALES": uuid.UUID("d2222222-2222-4222-8222-222222222222"),
    "TECHNICAL": uuid.UUID("d3333333-3333-4333-8333-333333333333"),
}


class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (
        Index(
            "uq_departments_name_active",
            text("lower(btrim(name))"),
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), index=True)
    version: Mapped[int] = mapped_column(server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
