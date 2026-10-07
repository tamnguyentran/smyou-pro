"""E2E accounts (run by `make e2e` before Playwright). Idempotent: resets passwords, lock-outs and sessions.

Never run against production: the passwords below are public.
"""

import sys
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

import app.modules.files.models  # noqa: F401  # registers `attachments` for Product.image_attachment_id's FK
from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.core.security import hash_password
from app.modules.catalog.models import Product, Service
from app.modules.customers.models import Customer
from app.modules.dispatch.models import Assignment, Task
from app.modules.identity.models import AuthSession, Employee, EmployeeRole
from app.modules.orders.models import Order

# (email, code, full name, roles, password, must change password) — one technician per Playwright
# project so the mobile and desktop runs can each do the first-login password change in parallel.
ACCOUNTS = [
    ("an.e2e@smyou.vn", "E2E01", "Nguyễn Văn An", ("MANAGER",), "E2e@SmYou2026", False),
    ("khoa.mobile@smyou.vn", "E2E02", "Trần Minh Khoa", ("TECHNICIAN",), "TamThoi#E2E1", True),
    ("khoa.desktop@smyou.vn", "E2E03", "Trần Minh Khoa", ("TECHNICIAN",), "TamThoi#E2E1", True),
    # Stay in the forced first-login state (never changed by a test): screenshot + a11y evidence.
    ("tuan.mobile@smyou.vn", "E2E04", "Lê Anh Tuấn", ("TECHNICIAN",), "TamThoi#E2E1", True),
    ("tuan.desktop@smyou.vn", "E2E05", "Lê Anh Tuấn", ("TECHNICIAN",), "TamThoi#E2E1", True),
    # App shell (M1-03): one account per role, password already changed.
    ("hoa.e2e@smyou.vn", "E2E06", "Lê Thị Hoa", ("SALE",), "E2e@SmYou2026", False),
    ("tuan.lead@smyou.vn", "E2E07", "Phạm Quốc Tuấn", ("TECH_LEAD",), "E2e@SmYou2026", False),
    ("khoa.shell@smyou.vn", "E2E08", "Trần Minh Khoa", ("TECHNICIAN",), "E2e@SmYou2026", False),
    ("ha.e2e@smyou.vn", "E2E09", "Phạm Thu Hà", ("SALE", "TECHNICIAN"), "E2e@SmYou2026", False),
]

# (sku, name, category, brand, unit, price, is_active, price_fixed) — M2-01b: stable data for the
# products list screenshot/e2e, independent of test execution order (upsert by sku, not created by
# a test itself). E2E-MON-001 is price_fixed=True — M3-02b's draft-order e2e needs a locked-price line.
PRODUCTS = [
    ("E2E-MON-001", "Màn hình Dell 22 inch E2E", "MONITOR", "Dell", "CAI", 2_800_000, True, True),
    ("E2E-PRN-001", "Hộp mực Canon E2E", "PRINTER_SUPPLY", "Canon", "HOP", 850_000, False, False),
]

# (code, name, category, unit, price, is_active) — M2-02: stable data for the services list
# screenshot/e2e, independent of test execution order (upsert by code, not created by a test itself).
SERVICES = [
    ("E2E-DV-001", "Lắp đặt camera E2E", "NETWORK_CABLING", "DIEM", 300_000, True),
    ("E2E-DV-002", "Sửa chữa PC E2E", "REPAIR", "LAN", 100_000, False),
]

# (code, type, name, phone, tax_code) — M3-01: stable data for the customers list screenshot/e2e,
# independent of test execution order (upsert by code, not created by a test itself).
CUSTOMERS = [
    ("E2E-KH-001", "COMPANY", "Cty Sáng Tạo Mới E2E", "0909123456", "0312345678"),
    ("E2E-KH-002", "INDIVIDUAL", "Anh Ngọc E2E - Grand Hotel", "0918234567", None),
]

# M5-01: one order + 3 tasks, one per "Việc của tôi" tab, all assigned to khoa.shell@smyou.vn
# (E2E08 — password already changed, so the e2e test can sign in directly without the forced
# first-login flow). (task code, task status, assignment status, estimated hours, due offset days).
MY_TASKS_ORDER_CODE = "E2E-DH-M501"
MY_TASKS = [
    ("E2E-DH-M501-T1", "PENDING_ACCEPTANCE", "PENDING", "3.5", 2),
    ("E2E-DH-M501-T2", "ACCEPTED", "ACCEPTED", "1.5", 1),
    ("E2E-DH-M501-T3", "DONE", "DONE", "2.0", -1),
]


def main() -> int:
    settings = Settings()
    if settings.app_env == "production":
        sys.stderr.write("seed_e2e refuses to run with APP_ENV=production\n")
        return 1
    factory = create_session_factory(
        create_db_engine(settings.database_url, settings.db_connect_timeout_seconds)
    )
    now = datetime.now(UTC)
    with factory() as session, session.begin():
        for email, code, name, roles, password, must_change in ACCOUNTS:
            employee = session.scalars(select(Employee).where(Employee.email == email)).one_or_none()
            if employee is None:
                employee = Employee(email=email, code=code, full_name=name, department="TECHNICAL")
                session.add(employee)
            employee.password_hash = hash_password(password)
            employee.must_change_password = must_change
            employee.is_active = True
            employee.failed_login_count = 0
            employee.locked_until = None
            employee.password_changed_at = now
            employee.roles = [EmployeeRole(role=role) for role in roles]
            session.flush()
            session.execute(
                update(AuthSession)
                .where(AuthSession.employee_id == employee.id, AuthSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )
        for sku, name, category, brand, unit, price, is_active, price_fixed in PRODUCTS:
            product = session.scalars(select(Product).where(Product.sku == sku)).one_or_none()
            if product is None:
                product = Product(sku=sku, category=category, unit=unit)
                session.add(product)
            product.name = name
            product.brand = brand
            product.price = price
            product.is_active = is_active
            product.price_fixed = price_fixed
        for code, name, category, unit, price, is_active in SERVICES:
            service = session.scalars(select(Service).where(Service.code == code)).one_or_none()
            if service is None:
                service = Service(code=code, category=category, unit=unit)
                session.add(service)
            service.name = name
            service.price = price
            service.is_active = is_active
        creator_id = session.scalars(select(Employee.id).where(Employee.email == "an.e2e@smyou.vn")).one()
        for code, customer_type, name, phone, tax_code in CUSTOMERS:
            customer = session.scalars(select(Customer).where(Customer.code == code)).one_or_none()
            if customer is None:
                customer = Customer(code=code, type=customer_type, phone=phone, created_by=creator_id)
                session.add(customer)
            customer.name = name
            customer.phone = phone
            customer.tax_code = tax_code
        khoa_id = session.scalars(select(Employee.id).where(Employee.email == "khoa.shell@smyou.vn")).one()
        order = session.scalars(select(Order).where(Order.code == MY_TASKS_ORDER_CODE)).one_or_none()
        if order is None:
            order = Order(
                code=MY_TASKS_ORDER_CODE,
                status="IN_PROGRESS",
                customer_name="Cty TNHH Phát Đạt E2E",
                customer_phone="0932068787",
                service_address="45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM",
                created_by=creator_id,
            )
            session.add(order)
            session.flush()
        for task_code, task_status, assignment_status, hours, due_offset_days in MY_TASKS:
            task = session.scalars(select(Task).where(Task.code == task_code)).one_or_none()
            if task is None:
                task = Task(
                    order_id=order.id,
                    code=task_code,
                    title=f"Lắp đặt camera E2E ({task_code})",
                    origin="INITIAL",
                    created_in_revision=0,
                    status=task_status,
                    estimated_hours=hours,
                    due_at=now + timedelta(days=due_offset_days),
                    priority="NORMAL",
                    created_by=creator_id,
                )
                session.add(task)
                session.flush()
            else:
                task.status = task_status
                task.due_at = now + timedelta(days=due_offset_days)
            assignment = session.scalars(
                select(Assignment).where(Assignment.task_id == task.id, Assignment.employee_id == khoa_id)
            ).one_or_none()
            if assignment is None:
                session.add(
                    Assignment(
                        id=uuid.uuid4(),
                        task_id=task.id,
                        employee_id=khoa_id,
                        cycle=1,
                        status=assignment_status,
                        assigned_by=creator_id,
                    )
                )
            else:
                assignment.status = assignment_status
    sys.stdout.write(
        f"seeded {len(ACCOUNTS)} E2E accounts, {len(PRODUCTS)} E2E products, {len(SERVICES)} E2E services,"
        f" {len(CUSTOMERS)} E2E customers, {len(MY_TASKS)} E2E my-tasks assignments\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
