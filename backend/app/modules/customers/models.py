"""Customer domain model (DOMAIN_MODEL §4, M3-01)."""

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

CUSTOMER_TYPES = ("COMPANY", "INDIVIDUAL")
GENDERS = ("MALE", "FEMALE", "OTHER")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        CheckConstraint(_in("type", CUSTOMER_TYPES), name="type"),
        CheckConstraint("phone ~ '^0[0-9]{9}$'", name="phone"),
        CheckConstraint(
            "it_contact_phone ~ '^0[0-9]{9}$' OR it_contact_phone IS NULL", name="it_contact_phone"
        ),
        CheckConstraint(
            "contact_person_phone ~ '^0[0-9]{9}$' OR contact_person_phone IS NULL",
            name="contact_person_phone",
        ),
        CheckConstraint("director_phone ~ '^0[0-9]{9}$' OR director_phone IS NULL", name="director_phone"),
        CheckConstraint(f"{_in('gender', GENDERS)} OR gender IS NULL", name="gender"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    code: Mapped[str] = mapped_column(String(20), unique=True)
    type: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(255))
    contact_person: Mapped[str | None] = mapped_column(String(120))
    # M15-05 addendum: chỉ COMPANY (xem domain.COMPANY_FIELDS) — khách INDIVIDUAL không có người liên hệ.
    contact_person_phone: Mapped[str | None] = mapped_column(String(20))
    phone: Mapped[str] = mapped_column(String(20), index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    tax_code: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    # M15-05: trường mở rộng theo type — COMPANY dùng các cột đầu, INDIVIDUAL dùng 3 cột sau (xem domain.py).
    founded_date: Mapped[date | None] = mapped_column(Date)
    director_name: Mapped[str | None] = mapped_column(String(120))
    director_phone: Mapped[str | None] = mapped_column(String(20))
    it_contact_name: Mapped[str | None] = mapped_column(String(120))
    it_contact_phone: Mapped[str | None] = mapped_column(String(20))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(10))
    occupation: Mapped[str | None] = mapped_column(String(120))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), index=True)
    version: Mapped[int] = mapped_column(server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
