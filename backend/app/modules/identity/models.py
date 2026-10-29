"""Employees (who can log in), their roles, and refresh-token sessions (DOMAIN_MODEL §1)."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.modules.departments.models import Department

ROLES = ("MANAGER", "SALE", "CUSTOMER_CARE", "TECH_LEAD", "TECHNICIAN")
GENDERS = ("MALE", "FEMALE", "OTHER")
MARITAL_STATUSES = ("SINGLE", "MARRIED", "DIVORCED", "WIDOWED")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        CheckConstraint("phone ~ '^0[0-9]{9}$'", name="phone"),
        CheckConstraint(_in("gender", GENDERS), name="gender"),
        CheckConstraint(_in("marital_status", MARITAL_STATUSES), name="marital_status"),
        CheckConstraint("id_number ~ '^([0-9]{9}|[0-9]{12})$'", name="id_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(String(20), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(CITEXT, unique=True)  # optional since M17-03a (Q105)
    phone: Mapped[str | None] = mapped_column(String(20))
    birth_date: Mapped[date | None] = mapped_column(Date)
    birth_place: Mapped[str | None] = mapped_column(String(120))
    gender: Mapped[str | None] = mapped_column(String(10))
    address: Mapped[str | None] = mapped_column(String(255))
    id_number: Mapped[str | None] = mapped_column(String(12))  # CMND (9) / CCCD (12), not unique
    id_issued_date: Mapped[date | None] = mapped_column(Date)
    id_issued_place: Mapped[str | None] = mapped_column(String(120))
    marital_status: Mapped[str | None] = mapped_column(String(10))
    department_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("departments.id", ondelete="RESTRICT"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(Text)
    must_change_password: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), index=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # selectin, not joined: `_locked` takes FOR UPDATE on employees and must not lock the department row.
    department: Mapped[Department] = relationship(lazy="selectin")
    roles: Mapped[list["EmployeeRole"]] = relationship(lazy="selectin", cascade="all, delete-orphan")


class EmployeeRole(Base):
    __tablename__ = "employee_roles"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="role"),)

    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(20), primary_key=True)


class AuthSession(Base):
    """One refresh token. Rotation creates a new row in the same family; reuse of a revoked row
    revokes the whole family (stolen-token detection)."""

    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    # Password change time the session was issued for; a later change invalidates it.
    password_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("auth_sessions.id"), index=True)
    user_agent: Mapped[str | None] = mapped_column(String(200))


class PasswordResetToken(Base):
    """One-time, 30-minute reset link (M12-01a). A new request invalidates every previous token."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordResetRequest(Base):
    """One row per forgot-password call (even for unknown emails) — counts toward the hourly rate limit."""

    __tablename__ = "password_reset_requests"
    __table_args__ = (Index("ix_password_reset_requests_email_requested_at", "email", "requested_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    email: Mapped[str] = mapped_column(CITEXT)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
