"""Monthly "Thu nhập thuần" targets per employee (M21-01a) — one row per (employee, month)."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

MAX_TARGET = 10**13


class EmployeeKpiTarget(Base):
    __tablename__ = "employee_kpi_targets"
    __table_args__ = (
        UniqueConstraint("employee_id", "month"),
        CheckConstraint("extract(day from month) = 1", name="month_first_day"),
        CheckConstraint("net_revenue_target >= 0", name="net_revenue_target_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"))
    month: Mapped[date] = mapped_column(Date, index=True)
    net_revenue_target: Mapped[int] = mapped_column(BigInteger)
    version: Mapped[int] = mapped_column(server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("employees.id", ondelete="RESTRICT"), index=True
    )
