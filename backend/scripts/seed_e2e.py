"""E2E accounts (run by `make e2e` before Playwright). Idempotent: resets passwords, lock-outs and sessions.

Never run against production: the passwords below are public.
"""

import sys
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update

from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.core.security import hash_password
from app.modules.catalog.models import Product, Service
from app.modules.customers.models import Customer
from app.modules.dispatch.models import Assignment, DefectRecord, Task
from app.modules.files import service as files_service
from app.modules.files.models import Attachment
from app.modules.identity.models import AuthSession, Employee, EmployeeRole
from app.modules.orders.models import Order

# Tiny valid JPEG (magic bytes + EOI marker) — same idiom as test_orders_confirmation_api.py's
# JPEG_BYTES, reused here so the seeded confirmation photo passes `files.domain.validate_image`.
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200 + b"\xff\xd9"

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

# M5-02: accept/reject e2e (myTasks.spec.ts) — mobile and desktop Playwright projects run in
# parallel against the same khoa.shell@smyou.vn account, so each project needs its own order (the
# command bumps orders.version; sharing one order between two concurrent mutations would race into
# a spurious STALE_VERSION). One (accept, reject) task pair per project.
RESPOND_ORDERS = [
    ("E2E-DH-M502A", "E2E-DH-M502A-T1", "E2E-DH-M502A-T2"),  # mobile: accept T1 / reject T2
    ("E2E-DH-M502B", "E2E-DH-M502B-T1", "E2E-DH-M502B-T2"),  # desktop: accept T1 / reject T2
]

# M5-03: start/complete e2e (myTasks.spec.ts) — same one-order-per-project idiom as RESPOND_ORDERS,
# to avoid a concurrent orders.version race between the mobile/desktop Playwright projects. One
# (ACCEPTED, IN_PROGRESS) task pair per project: start the first, complete the second.
WORK_ORDERS = [
    ("E2E-DH-M503A", "E2E-DH-M503A-T1", "E2E-DH-M503A-T2"),  # mobile: start T1 / complete T2
    ("E2E-DH-M503B", "E2E-DH-M503B-T1", "E2E-DH-M503B-T2"),  # desktop: start T1 / complete T2
]

# M6-02: complete-order e2e (orders.spec.ts) — same one-order-per-project idiom as WORK_ORDERS.
# AWAITING_CONFIRMATION, 1 DONE task+assignment, 1 CUSTOMER_CONFIRMATION photo already at
# revision_no=0 so the "Tệp đính kèm" tab has something to show before "Hoàn tất đơn" is clicked.
COMPLETE_ORDERS = [
    ("E2E-DH-M602A", "E2E-DH-M602A-T1"),  # mobile
    ("E2E-DH-M602B", "E2E-DH-M602B-T1"),  # desktop
]

# M6-03b: "Chuyển Chỉnh sửa" e2e (orders-revise.spec.ts) — same one-order-per-project idiom.
# AWAITING_CONFIRMATION, 1 DONE task, logged in as tuan.lead@smyou.vn (TECH_LEAD — only role with
# `order.revise`).
REVISE_ORDERS = [
    ("E2E-DH-M603A", "E2E-DH-M603A-T1"),  # mobile
    ("E2E-DH-M603B", "E2E-DH-M603B-T1"),  # desktop
]

# M6-03b: "Mở lại" đầu việc e2e (dispatch.spec.ts) — same one-order-per-project idiom. Order
# already REVISION (revision_no=1), 1 DONE task to reopen; the same order doubles as the
# /dispatch/revisions list check (AC-DSP-130) so no separate seed is needed for that page.
REOPEN_ORDERS = [
    ("E2E-DH-M603C", "E2E-DH-M603C-T1"),  # mobile
    ("E2E-DH-M603D", "E2E-DH-M603D-T1"),  # desktop
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

        def upsert_order(
            code: str,
            *,
            customer_name: str = "Cty TNHH Phát Đạt E2E",
            customer_phone: str = "0932068787",
            service_address: str = "45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM",
        ) -> Order:
            order = session.scalars(select(Order).where(Order.code == code)).one_or_none()
            if order is None:
                order = Order(
                    code=code,
                    status="IN_PROGRESS",
                    customer_name=customer_name,
                    customer_phone=customer_phone,
                    service_address=service_address,
                    created_by=creator_id,
                )
                session.add(order)
                session.flush()
            else:
                # Idempotent on rerun — a stale row from a previous seed (e.g. before WORK_ORDERS'
                # customer identity was split out from the shared default) must not linger with the
                # old contact info, or AC-ASG-015's strict-mode address/phone link lookup breaks.
                order.customer_name = customer_name
                order.customer_phone = customer_phone
                order.service_address = service_address
            return order

        def upsert_task_assignment(
            order: Order,
            task_code: str,
            task_status: str,
            assignment_status: str,
            hours: str,
            due_offset_days: int,
        ) -> None:
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
                # Idempotent on rerun (M6-03b): a previous e2e run may have actually reopened this
                # task (POST .../reopen bumps `cycle` and adds a 2nd assignment row for the new
                # cycle) — reset both back to the seed's intended baseline, or the assignment
                # lookup below finds 2 rows for `khoa_id` and `.one_or_none()` blows up.
                task.status = task_status
                task.due_at = now + timedelta(days=due_offset_days)
                task.cycle = 1
                task.reopen_count = 0
                task.last_reopened_in_revision = None
                # defect_records.assignment_id FKs to assignments.id with no ON DELETE CASCADE —
                # drop those first or the assignment delete below hits a FK violation.
                session.execute(delete(DefectRecord).where(DefectRecord.task_id == task.id))
                session.execute(delete(Assignment).where(Assignment.task_id == task.id))
                session.flush()
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

        my_tasks_order = upsert_order(MY_TASKS_ORDER_CODE)
        for task_code, task_status, assignment_status, hours, due_offset_days in MY_TASKS:
            upsert_task_assignment(
                my_tasks_order, task_code, task_status, assignment_status, hours, due_offset_days
            )

        for order_code, accept_task_code, reject_task_code in RESPOND_ORDERS:
            respond_order = upsert_order(order_code)
            upsert_task_assignment(respond_order, accept_task_code, "PENDING_ACCEPTANCE", "PENDING", "1.0", 3)
            upsert_task_assignment(respond_order, reject_task_code, "PENDING_ACCEPTANCE", "PENDING", "1.0", 3)

        for order_code, start_task_code, complete_task_code in WORK_ORDERS:
            # Distinct customer identity (not the shared "Nguyễn Trãi"/"0932…" one upsert_order
            # defaults to): this e2e test actually completes a task to DONE, so the resulting
            # assignment lands in khoa's "Đã xong" tab too — AC-ASG-015's strict-mode address/phone
            # link lookup must keep matching exactly 1 element across the whole e2e run.
            work_order = upsert_order(
                order_code,
                customer_name="Cty TNHH Hoàn Thành E2E",
                customer_phone="0918222333",
                service_address="12 Lê Lợi, P. Bến Nghé, Q.1, TP.HCM",
            )
            upsert_task_assignment(work_order, start_task_code, "ACCEPTED", "ACCEPTED", "1.0", 3)
            upsert_task_assignment(work_order, complete_task_code, "IN_PROGRESS", "IN_PROGRESS", "1.0", 3)

        for order_code, task_code in COMPLETE_ORDERS:
            complete_order = upsert_order(
                order_code,
                customer_name="Cty TNHH Hoàn Tất E2E",
                customer_phone="0918333444",
                service_address="20 Lý Tự Trọng, P. Bến Nghé, Q.1, TP.HCM",
            )
            complete_order.status = "AWAITING_CONFIRMATION"
            complete_order.revision_no = 0
            upsert_task_assignment(complete_order, task_code, "DONE", "DONE", "1.0", -1)
            has_attachment = (
                session.scalar(
                    select(func.count())
                    .select_from(Attachment)
                    .where(
                        Attachment.owner_type == "ORDER",
                        Attachment.owner_id == complete_order.id,
                        Attachment.kind == "CUSTOMER_CONFIRMATION",
                        Attachment.revision_no == 0,
                    )
                )
                or 0
            )
            if has_attachment == 0:
                files_service.store_image(
                    session,
                    owner_type="ORDER",
                    owner_id=complete_order.id,
                    kind="CUSTOMER_CONFIRMATION",
                    revision_no=0,
                    file_bytes=JPEG_BYTES,
                    filename="phieu.jpg",
                    declared_mime="image/jpeg",
                    uploaded_by=khoa_id,
                    settings=settings,
                    now=now,
                )

        for order_code, task_code in REVISE_ORDERS:
            revise_order = upsert_order(
                order_code,
                customer_name="Cty TNHH Chỉnh Sửa E2E",
                customer_phone="0918444555",
                service_address="30 Pasteur, P. Bến Nghé, Q.1, TP.HCM",
            )
            revise_order.status = "AWAITING_CONFIRMATION"
            revise_order.revision_no = 0
            upsert_task_assignment(revise_order, task_code, "DONE", "DONE", "1.0", -1)

        for order_code, task_code in REOPEN_ORDERS:
            reopen_order = upsert_order(
                order_code,
                customer_name="Cty TNHH Mở Lại E2E",
                customer_phone="0918555666",
                service_address="40 Hai Bà Trưng, P. Bến Nghé, Q.1, TP.HCM",
            )
            reopen_order.status = "REVISION"
            reopen_order.revision_no = 1
            upsert_task_assignment(reopen_order, task_code, "DONE", "DONE", "1.0", -1)
    sys.stdout.write(
        f"seeded {len(ACCOUNTS)} E2E accounts, {len(PRODUCTS)} E2E products, {len(SERVICES)} E2E services,"
        f" {len(CUSTOMERS)} E2E customers, {len(MY_TASKS)} E2E my-tasks assignments\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
