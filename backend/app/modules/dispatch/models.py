"""Task/Assignment domain model (DOMAIN_MODEL §8/§9, M4-01a)."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.modules.orders.models import PRIORITIES

ORIGINS = ("INITIAL", "ADDITIONAL")
TASK_STATUSES = ("NEEDS_ASSIGNEE", "PENDING_ACCEPTANCE", "ACCEPTED", "IN_PROGRESS", "DONE", "CANCELLED")
ASSIGNMENT_STATUSES = ("PENDING", "ACCEPTED", "REJECTED", "IN_PROGRESS", "DONE", "REMOVED")
REJECT_REASON_CODES = ("BUSY", "SICK", "SKILL", "DISTANCE", "OTHER")
_ACTIVE_ASSIGNMENT_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS", "DONE")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(_in("origin", ORIGINS), name="origin"),
        CheckConstraint(_in("status", TASK_STATUSES), name="status"),
        CheckConstraint(_in("priority", PRIORITIES), name="priority"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    code: Mapped[str] = mapped_column(String(24), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    origin: Mapped[str] = mapped_column(String(20))
    created_in_revision: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30))
    estimated_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    priority: Mapped[str] = mapped_column(String(20))
    cycle: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    reopen_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    last_reopened_in_revision: Mapped[int | None] = mapped_column(Integer)
    order_line_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(Uuid))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint(_in("status", ASSIGNMENT_STATUSES), name="status"),
        CheckConstraint(
            f"reject_reason_code IS NULL OR {_in('reject_reason_code', REJECT_REASON_CODES)}",
            name="reject_reason_code",
        ),
        Index(
            "uq_assignments_task_employee_cycle_active",
            "task_id",
            "employee_id",
            "cycle",
            unique=True,
            postgresql_where=text(_in("status", _ACTIVE_ASSIGNMENT_STATUSES)),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), index=True)
    cycle: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), server_default=text("'PENDING'"))
    reject_reason_code: Mapped[str | None] = mapped_column(String(20))
    reject_reason_text: Mapped[str | None] = mapped_column(Text)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_hours: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    completion_note: Mapped[str | None] = mapped_column(Text)
    assigned_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


DEFECT_SEVERITIES = ("MINOR", "MAJOR")


class DefectRecord(Base):
    """One row per previous-cycle assignee of a reopened task (DOMAIN_MODEL §10, M6-03a).
    `excluded_from_kpi`/`excluded_reason` exist only for M8-01 to fill in; no route reads/writes them
    yet."""

    __tablename__ = "defect_records"
    __table_args__ = (CheckConstraint(_in("severity", DEFECT_SEVERITIES), name="severity"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), index=True)
    cycle: Mapped[int] = mapped_column(Integer)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id"))
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(10))
    reported_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"))
    excluded_from_kpi: Mapped[bool] = mapped_column(server_default=text("false"))
    excluded_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
