"""`GET /api/v1/reports/customer-gifts`, `/{customer_id}/items`, `/export` (M16-02a).

`report.customer_gift.read` is `all` for every role holding it (Q97, same as `customer_gift.read`
itself) — no scope narrowing, same rationale as `customer_gifts/service.py`'s own `RULES = {}`.
`performed_date` is a plain `date` column (not `timestamptz`), so the range filter is a direct
`BETWEEN`, unlike the UTC/Asia-Ho_Chi_Minh conversion `revenue_report/service.py` needs for
`timestamptz` columns.
"""

import csv
import io
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.core.errors import AppError
from app.modules.customer_gift_report.schemas import CustomerGiftReportOut, CustomerGiftReportRowOut
from app.modules.customer_gifts.models import CustomerGift
from app.modules.customer_gifts.schemas import CustomerGiftOut, EmployeeRef
from app.modules.customers.models import Customer
from app.modules.identity.models import Employee

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

_CSV_HEADER = ["Mã khách hàng", "Tên khách hàng", "Người liên hệ", "Số lần tặng", "Tổng chi phí"]
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@")


def _escape_csv_formula(value: str) -> str:
    """Neutralize Excel/Sheets formula injection (CWE-1236), same as `revenue_report/service.py`."""
    return f"'{value}" if value.startswith(_CSV_FORMULA_PREFIXES) else value


def default_date_range(now: datetime) -> tuple[date, date]:
    today_vn = now.astimezone(VIETNAM).date()
    return today_vn.replace(day=1), today_vn


def _validate_range(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        message = "Từ ngày không được sau Đến ngày."
        raise AppError(
            422,
            "VALIDATION_ERROR",
            message,
            errors=[{"field": "from", "code": "invalid_range", "message": message}],
        )


def get_report(
    session: Session, actor: Actor, *, date_from: date, date_to: date, customer_id: uuid.UUID | None
) -> CustomerGiftReportOut:
    _validate_range(date_from, date_to)
    stmt = (
        select(
            CustomerGift.customer_id,
            func.count(CustomerGift.id),
            func.sum(CustomerGift.total_amount),
        )
        .where(CustomerGift.performed_date >= date_from, CustomerGift.performed_date <= date_to)
        .group_by(CustomerGift.customer_id)
    )
    if customer_id is not None:
        stmt = stmt.where(CustomerGift.customer_id == customer_id)
    rows = session.execute(stmt).all()
    if not rows:
        return CustomerGiftReportOut(**{"from": date_from}, to=date_to, items=[], total=0)

    customers = {
        c.id: c for c in session.scalars(select(Customer).where(Customer.id.in_(row[0] for row in rows)))
    }
    out_rows = [
        CustomerGiftReportRowOut(
            customer_id=cust_id,
            customer_code=customers[cust_id].code,
            customer_name=customers[cust_id].name,
            contact_person=customers[cust_id].contact_person,
            gift_count=gift_count,
            total_cost=total_cost,
        )
        for cust_id, gift_count, total_cost in rows
    ]
    out_rows.sort(key=lambda r: r.customer_code)
    return CustomerGiftReportOut(**{"from": date_from}, to=date_to, items=out_rows, total=len(out_rows))


def _employee_ref(employee: Employee) -> EmployeeRef:
    return EmployeeRef(id=employee.id, code=employee.code, full_name=employee.full_name)


def get_customer_items(
    session: Session, actor: Actor, customer_id: uuid.UUID, *, date_from: date, date_to: date
) -> list[CustomerGiftOut]:
    _validate_range(date_from, date_to)
    stmt = (
        select(CustomerGift)
        .where(
            CustomerGift.customer_id == customer_id,
            CustomerGift.performed_date >= date_from,
            CustomerGift.performed_date <= date_to,
        )
        .order_by(CustomerGift.performed_date.desc(), CustomerGift.created_at.desc())
    )
    gifts = session.scalars(stmt).all()
    employee_ids = {g.performed_by for g in gifts} | {g.requested_by for g in gifts}
    employees = {e.id: e for e in session.scalars(select(Employee).where(Employee.id.in_(employee_ids)))}
    return [
        CustomerGiftOut(
            id=gift.id,
            customer_id=gift.customer_id,
            occasion_name=gift.occasion_name,
            performed_date=gift.performed_date,
            gift_name=gift.gift_name,
            quantity=gift.quantity,
            unit_price=gift.unit_price,
            other_cost=gift.other_cost,
            total_amount=gift.total_amount,
            note=gift.note,
            performed_by=_employee_ref(employees[gift.performed_by]),
            requested_by=_employee_ref(employees[gift.requested_by]),
            created_by=gift.created_by,
            version=gift.version,
            created_at=gift.created_at,
            updated_at=gift.updated_at,
        )
        for gift in gifts
    ]


def build_csv(report: CustomerGiftReportOut) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_CSV_HEADER)
    for row in report.items:
        writer.writerow(
            [
                _escape_csv_formula(row.customer_code),
                _escape_csv_formula(row.customer_name),
                _escape_csv_formula(row.contact_person or ""),
                row.gift_count,
                row.total_cost,
            ]
        )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
