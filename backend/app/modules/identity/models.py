"""Employees (who can log in), their roles, and refresh-token sessions (DOMAIN_MODEL §1)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
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

ROLES = ("MANAGER", "SALE", "TECH_LEAD", "TECHNICIAN")
DEPARTMENTS = ("MANAGEMENT", "SALES", "TECHNICAL")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        CheckConstraint(_in("department", DEPARTMENTS), name="department"),
        CheckConstraint("phone ~ '^0[0-9]{9}$'", name="phone"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(String(20), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    department: Mapped[str] = mapped_column(String(20))
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
