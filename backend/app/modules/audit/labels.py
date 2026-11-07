"""Readable "Đối tượng" for a page of audit events (M21-04): order code, task code, customer name…

Read-only lookups into other modules' tables (same documented exception as the Employee join in
list_events), one query per entity type present in the page — never one per event. An entity that
no longer exists (deleted KPI target, test data) yields no label; the UI then shows the type only.
"""

import re
import uuid
from collections import defaultdict
from collections.abc import Callable, Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.audit.domain import EntityType
from app.modules.audit.models import AuditEvent
from app.modules.catalog.models import Product, Service
from app.modules.company.models import CompanyProfile
from app.modules.customer_gifts.models import CustomerGift
from app.modules.customers.models import Customer
from app.modules.departments.models import Department
from app.modules.dispatch.models import Assignment, Task
from app.modules.identity.models import Employee
from app.modules.orders.models import Order

Labels = dict[uuid.UUID, str]
_MONTH = re.compile(r"^(\d{4})-(\d{2})")


def _named(name: str, code: str) -> str:
    return f"{name} ({code})"


def _orders(session: Session, ids: set[uuid.UUID]) -> Labels:
    return dict(session.execute(select(Order.id, Order.code).where(Order.id.in_(ids))).tuples().all())


def _tasks(session: Session, ids: set[uuid.UUID]) -> Labels:
    # Task codes embed the order code (DH2611-0003-T1), so the order reads straight off the label.
    return dict(session.execute(select(Task.id, Task.code).where(Task.id.in_(ids))).tuples().all())


def _assignments(session: Session, ids: set[uuid.UUID]) -> Labels:
    rows = session.execute(
        select(Assignment.id, Task.code, Employee.full_name, Employee.code)
        .join(Task, Task.id == Assignment.task_id)
        .join(Employee, Employee.id == Assignment.employee_id)
        .where(Assignment.id.in_(ids))
    ).tuples()
    return {id_: f"{task_code} · {_named(name, code)}" for id_, task_code, name, code in rows}


def _customers(session: Session, ids: set[uuid.UUID]) -> Labels:
    rows = session.execute(select(Customer.id, Customer.name, Customer.code).where(Customer.id.in_(ids)))
    return {id_: _named(name, code) for id_, name, code in rows.tuples()}


def _customer_gifts(session: Session, ids: set[uuid.UUID]) -> Labels:
    rows = session.execute(
        select(CustomerGift.id, CustomerGift.gift_name, Customer.name)
        .join(Customer, Customer.id == CustomerGift.customer_id)
        .where(CustomerGift.id.in_(ids))
    ).tuples()
    return {id_: f"{gift} · {customer}" for id_, gift, customer in rows}


def _products(session: Session, ids: set[uuid.UUID]) -> Labels:
    rows = session.execute(select(Product.id, Product.name, Product.sku).where(Product.id.in_(ids)))
    return {id_: _named(name, sku) for id_, name, sku in rows.tuples()}


def _services(session: Session, ids: set[uuid.UUID]) -> Labels:
    rows = session.execute(select(Service.id, Service.name, Service.code).where(Service.id.in_(ids)))
    return {id_: _named(name, code) for id_, name, code in rows.tuples()}


def _employees(session: Session, ids: set[uuid.UUID]) -> Labels:
    rows = session.execute(select(Employee.id, Employee.full_name, Employee.code).where(Employee.id.in_(ids)))
    return {id_: _named(name, code) for id_, name, code in rows.tuples()}


def _departments(session: Session, ids: set[uuid.UUID]) -> Labels:
    return dict(
        session.execute(select(Department.id, Department.name).where(Department.id.in_(ids))).tuples().all()
    )


def _company(session: Session, ids: set[uuid.UUID]) -> Labels:
    # Single-row table; events carry a fixed COMPANY_PROFILE_ID, not the row's int key.
    name = session.scalar(select(CompanyProfile.name).limit(1))
    return dict.fromkeys(ids, name) if name else {}


_LOOKUPS: dict[str, Callable[[Session, set[uuid.UUID]], Labels]] = {
    EntityType.ORDER: _orders,
    EntityType.TASK: _tasks,
    EntityType.ASSIGNMENT: _assignments,
    EntityType.CUSTOMER: _customers,
    EntityType.CUSTOMER_GIFT: _customer_gifts,
    EntityType.PRODUCT: _products,
    EntityType.SERVICE: _services,
    EntityType.EMPLOYEE: _employees,
    EntityType.DEPARTMENT: _departments,
    EntityType.COMPANY_PROFILE: _company,
}


def _month(value: Any) -> str:
    match = _MONTH.match(str(value))
    return f"{match.group(2)}/{match.group(1)}" if match else str(value)


def _kpi_label(data: dict[str, Any] | None, employees: Labels) -> str | None:
    """KPI targets can be deleted and a copy has no single row, so the label comes from `data`."""
    if not data:
        return None
    if "from_month" in data and "to_month" in data:
        return f"Tháng {_month(data['from_month'])} → {_month(data['to_month'])}"
    try:
        employee = employees.get(uuid.UUID(str(data.get("employee_id"))))
    except ValueError:
        return None
    if employee is None:
        return None
    return f"{employee} · tháng {_month(data['month'])}" if data.get("month") else employee


def _kpi_employee_ids(events: Iterable[AuditEvent]) -> set[uuid.UUID]:
    ids: set[uuid.UUID] = set()
    for event in events:
        if event.entity_type == EntityType.KPI_TARGET and event.data and event.data.get("employee_id"):
            try:
                ids.add(uuid.UUID(str(event.data["employee_id"])))
            except ValueError:
                continue
    return ids


def entity_labels(session: Session, events: list[AuditEvent]) -> dict[uuid.UUID, str | None]:
    """event.id → readable entity label (or None)."""
    ids_by_type: dict[str, set[uuid.UUID]] = defaultdict(set)
    for event in events:
        if event.entity_type in _LOOKUPS:
            ids_by_type[event.entity_type].add(event.entity_id)
    ids_by_type[EntityType.EMPLOYEE] |= _kpi_employee_ids(events)
    found = {
        entity_type: _LOOKUPS[entity_type](session, ids) for entity_type, ids in ids_by_type.items() if ids
    }

    labels: dict[uuid.UUID, str | None] = {}
    for event in events:
        if event.entity_type == EntityType.KPI_TARGET:
            labels[event.id] = _kpi_label(event.data, found.get(EntityType.EMPLOYEE, {}))
        else:
            labels[event.id] = found.get(event.entity_type, {}).get(event.entity_id)
    return labels
