"""E2E accounts (run by `make e2e` before Playwright). Idempotent: resets passwords, lock-outs and
sessions, and purges orders created by test runs (anything whose code isn't an "E2E-" fixture) and
employees created by test runs (see `purge_test_employees`).

Never run against production: the passwords below are public.
"""

import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import column, delete, func, select, table, text, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.core.security import hash_password
from app.modules.audit.models import AuditEvent
from app.modules.catalog.models import Product, ProductServiceGroup, Service
from app.modules.customer_potential.models import CustomerPotentialNote
from app.modules.customers.models import Customer
from app.modules.departments.models import STANDARD_DEPARTMENT_IDS
from app.modules.dispatch.models import Assignment, DefectRecord, Task
from app.modules.files import service as files_service
from app.modules.files.models import Attachment
from app.modules.identity.models import (
    AuthSession,
    Employee,
    EmployeeRole,
    PasswordResetRequest,
    PasswordResetToken,
)
from app.modules.kpi_targets.models import EmployeeKpiTarget
from app.modules.notifications.models import Notification
from app.modules.orders.models import Order, OrderLine, OrderRevision

# Tiny valid JPEG (magic bytes + EOI marker) — same idiom as test_orders_confirmation_api.py's
# JPEG_BYTES, reused here so the seeded confirmation photo passes `files.domain.validate_image`.
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200 + b"\xff\xd9"

# (email, code, full name, roles, password, must change password) — one technician per Playwright
# project so the mobile and desktop runs can each do the first-login password change in parallel.
# M17-03b: each account's username is its email's local part (e2e/loginName.ts relies on it), not the
# generated one — several seeded accounts share a full name.
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
    # M6-04 golden path: 2 more "clean" technicians so the scenario has 3 (khoa.shell + these 2).
    ("minh.ktv2@smyou.vn", "E2E10", "Nguyễn Thành Minh", ("TECHNICIAN",), "E2e@SmYou2026", False),
    ("duc.ktv3@smyou.vn", "E2E11", "Đỗ Văn Đức", ("TECHNICIAN",), "E2e@SmYou2026", False),
    # M12-01b: forgot/reset-password e2e actually changes the password — dedicated accounts, not
    # shared with any other test, so they stay idempotent across `make e2e` runs (reset here).
    ("mai.quenmk.mobile@smyou.vn", "E2E12", "Bùi Thị Mai", ("SALE",), "QuenMK@E2E1", False),
    ("mai.quenmk.desktop@smyou.vn", "E2E13", "Bùi Thị Mai", ("SALE",), "QuenMK@E2E1", False),
    # M15-02b: màn tra cứu CSKH (/orders) dùng role riêng, không gộp qua _MANAGER_BUNDLE.
    ("lan.cskh@smyou.vn", "E2E14", "Nguyễn Thị Lan", ("CUSTOMER_CARE",), "E2e@SmYou2026", False),
    # M19-01b: KTV thêm dòng hàng tại hiện trường — tài khoản riêng, không lẫn "Việc của tôi" của khoa.shell.
    ("binh.ktv@smyou.vn", "E2E15", "Nguyễn Văn Bình", ("TECHNICIAN",), "E2e@SmYou2026", False),
    # M20-09: mật khẩu tạm đã quá hạn 24 giờ — đăng nhập luôn bị từ chối (không test nào đổi được).
    ("het.han@smyou.vn", "E2E16", "Trần Văn Khoa", ("TECHNICIAN",), "TamThoi#E2E1", True),
]
EXPIRED_TEMP_ACCOUNT = "het.han@smyou.vn"

# (sku, name, category, brand, unit, price, is_active, price_fixed) — M2-01b: stable data for the
# products list screenshot/e2e, independent of test execution order (upsert by sku, not created by
# a test itself). E2E-MON-001 is price_fixed=True — M3-02b's draft-order e2e needs a locked-price line.
PRODUCTS = [
    ("E2E-MON-001", "Màn hình Dell 22 inch E2E", "MONITOR", "Dell", "CAI", 2_800_000, True, True),
    ("E2E-PRN-001", "Hộp mực Canon E2E", "PRINTER_SUPPLY", "Canon", "HOP", 850_000, False, False),
    ("E2E-SSD-001", "Ổ cứng SSD Kingston 512GB E2E", "STORAGE", "Kingston", "CAI", 1_350_000, True, False),
]

# (code, name, category, unit, price, is_active) — M2-02: stable data for the services list
# screenshot/e2e, independent of test execution order (upsert by code, not created by a test itself).
SERVICES = [
    ("E2E-DV-001", "Lắp đặt camera E2E", "NETWORK_CABLING", "DIEM", 300_000, True),
    ("E2E-DV-002", "Sửa chữa PC E2E", "REPAIR", "LAN", 100_000, False),
]

# (code, type, name, phone, tax_code) — M3-01: stable data for the customers list screenshot/e2e,
# independent of test execution order (upsert by code, not created by a test itself).
STANDARD_GROUP_IDS = [
    uuid.UUID("a1111111-1111-4111-8111-111111111111"),
    uuid.UUID("a2222222-2222-4222-8222-222222222222"),
    uuid.UUID("a3333333-3333-4333-8333-333333333333"),
]
OFFICE_GROUP_ID, SECURITY_GROUP_ID = STANDARD_GROUP_IDS[0], STANDARD_GROUP_IDS[1]
RETIRED_GROUPS = ["Thiết bị mạng", "Máy in cũ"]
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

# M15-03: CSKH gửi yêu cầu chỉnh sửa e2e (orders-revise.spec.ts) — same one-order-per-project
# idiom. COMPLETED with a csat_comment already recorded (by lan.cskh@smyou.vn) so the "Tạo yêu
# cầu chỉnh sửa" button (requires csat_comment non-empty) is visible without driving the CSAT
# form first.
CSK_REVISION_ORDERS = [
    ("E2E-DH-M1503A", "E2E-DH-M1503A-T1", "Máy vẫn còn kêu to sau khi lắp"),  # mobile
    ("E2E-DH-M1503B", "E2E-DH-M1503B-T1", "Camera bị mờ góc trái"),  # desktop
]

# M19-01b: KTV thêm dòng hàng tại hiện trường (orders-on-site-lines.spec.ts) — same one-order-per-
# project idiom. IN_PROGRESS, created by hoa.e2e (SALE, receives the notification), 1 line of Hoa's
# (1.000.000đ, VAT 0), binh.ktv's assignment IN_PROGRESS. Lines + notifications reset on every seed.
ON_SITE_ORDERS = [
    ("E2E-DH-M1901A", "E2E-DH-M1901A-T1"),  # mobile
    ("E2E-DH-M1901B", "E2E-DH-M1901B-T1"),  # desktop
]


# M21-05b: KTV ghi tiềm năng khách hàng từ "Việc của tôi" (customer-potential.spec.ts) — the order
# needs a customer_id (khách chủ đơn). Notes belong to the customer, not the order, so each Playwright
# project gets its own order AND customer — sharing one would let the other run's note show up.
# (order code, task code, customer code, customer name, customer phone)
POTENTIAL_ORDERS = [
    ("E2E-DH-M2105A", "E2E-DH-M2105A-T1", "E2E-KH-M2105A", "Cty Tiềm Năng Di Động E2E", "0918210501"),
    ("E2E-DH-M2105B", "E2E-DH-M2105B-T1", "E2E-KH-M2105B", "Cty Tiềm Năng Máy Bàn E2E", "0918210502"),
]


# M20-03: "Chỉ đơn của tôi" mặc định bật cho SALE/CSKH (orders.spec.ts) — read-only, shared by both
# projects. COMPLETED this month, unrated: one created by lan.cskh (her only order, so her
# "Chưa đánh giá" tile = 1), one by ha.e2e (another Sale — hidden from Hoa while the box is ticked).
# (code, creator email)
MINE_DEFAULT_ORDERS = [
    ("E2E-DH-M2003L", "lan.cskh@smyou.vn"),
    ("E2E-DH-M2003H", "ha.e2e@smyou.vn"),
]


@dataclass(frozen=True)
class PurgeResult:
    purged: int
    kept: int


# FKs to employees.id that neither cascade nor set null — a row there keeps its employee alive.
_BLOCKING_FKS = text(
    "SELECT r.relname, a.attname FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid"
    " JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)"
    " WHERE c.contype = 'f' AND c.confrelid = 'employees'::regclass AND c.confdeltype NOT IN ('c', 'n')"
)


def purge_test_employees(session: Session) -> PurgeResult:
    """M21-07: delete employees that e2e runs created through the API (audited "create" by an E2E
    account), so `make e2e` reruns stop piling them up. Ones still referenced elsewhere are kept."""
    fixture_emails = [account[0] for account in ACCOUNTS]
    fixture_ids = set(session.scalars(select(Employee.id).where(Employee.email.in_(fixture_emails))))
    candidates = (
        set(
            session.scalars(
                select(AuditEvent.entity_id)
                .join(Employee, Employee.id == AuditEvent.entity_id)
                .where(
                    AuditEvent.entity_type == "EMPLOYEE",
                    AuditEvent.action == "create",
                    AuditEvent.actor_id.in_(fixture_ids),
                )
            )
        )
        - fixture_ids
    )
    if not candidates:
        return PurgeResult(purged=0, kept=0)
    kept: set[uuid.UUID] = set()
    for table_name, column_name in session.execute(_BLOCKING_FKS).tuples():
        if (table_name, column_name) == ("employee_kpi_targets", "employee_id"):
            continue  # the purge deletes these rows itself
        ref = column(column_name)
        kept.update(
            session.scalars(select(ref).select_from(table(table_name)).where(ref.in_(candidates)).distinct())
        )
    purged = candidates - kept
    if purged:
        session.execute(delete(EmployeeKpiTarget).where(EmployeeKpiTarget.employee_id.in_(purged)))
        session.execute(
            delete(AuditEvent).where(AuditEvent.entity_type == "EMPLOYEE", AuditEvent.entity_id.in_(purged))
        )
        session.execute(delete(Employee).where(Employee.id.in_(purged)))
        session.flush()
    return PurgeResult(purged=len(purged), kept=len(kept))


def main(session_factory: sessionmaker[Session] | None = None) -> int:
    settings = Settings()
    if settings.app_env == "production":
        sys.stderr.write("seed_e2e refuses to run with APP_ENV=production\n")
        return 1
    factory = session_factory or create_session_factory(
        create_db_engine(settings.database_url, settings.db_connect_timeout_seconds)
    )
    now = datetime.now(UTC)
    with factory() as session, session.begin():
        # Mỗi test tạo đơn thật qua UI (mã tự sinh "DHyymm-nnnn") và không dọn lại — DB dev dùng
        # volume named nên tồn qua các lần `make e2e`, cộng dồn hàng trăm đơn PENDING_DISPATCH và
        # làm đơn mới của lần chạy hiện tại rơi khỏi trang 1 (hàng đợi sort theo mã, phân trang
        # 20/trang). Dọn sạch mọi đơn KHÔNG phải fixture (mã không bắt đầu "E2E-") trước khi seed.
        stale_order_ids = list(session.scalars(select(Order.id).where(Order.code.not_like("E2E-%"))))
        if stale_order_ids:
            stale_task_ids = list(session.scalars(select(Task.id).where(Task.order_id.in_(stale_order_ids))))
            if stale_task_ids:
                session.execute(delete(DefectRecord).where(DefectRecord.task_id.in_(stale_task_ids)))
                session.execute(delete(Assignment).where(Assignment.task_id.in_(stale_task_ids)))
                session.execute(delete(Task).where(Task.id.in_(stale_task_ids)))
            # M21-05 notes reference their order with ON DELETE RESTRICT (left behind by UAT runs).
            session.execute(
                delete(CustomerPotentialNote).where(CustomerPotentialNote.order_id.in_(stale_order_ids))
            )
            session.execute(delete(OrderRevision).where(OrderRevision.order_id.in_(stale_order_ids)))
            session.execute(delete(OrderLine).where(OrderLine.order_id.in_(stale_order_ids)))
            session.execute(delete(Order).where(Order.id.in_(stale_order_ids)))
            session.flush()
        # M21-07: e2e tests create employees too (names/emails stamped with Date.now()) — ~830 piled up.
        purge = purge_test_employees(session)

        for email, code, name, roles, password, must_change in ACCOUNTS:
            employee = session.scalars(select(Employee).where(Employee.email == email)).one_or_none()
            if employee is None:
                employee = Employee(
                    email=email, code=code, full_name=name, department_id=STANDARD_DEPARTMENT_IDS["ECONOMIC"]
                )
                session.add(employee)
            employee.username = email.split("@", 1)[0]
            employee.password_hash = hash_password(password)
            employee.must_change_password = must_change
            employee.temp_password_expires_at = (
                now - timedelta(hours=1) if email == EXPIRED_TEMP_ACCOUNT else None
            )
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
            # M12-01b: clear any rate-limit/token history from previous `make e2e` runs — otherwise
            # the forgot-password e2e account hits RESET_RATE_LIMIT (3/hour) after a few local reruns.
            session.execute(delete(PasswordResetToken).where(PasswordResetToken.employee_id == employee.id))
            session.execute(delete(PasswordResetRequest).where(PasswordResetRequest.email == email))
        for sku, name, category, brand, unit, price, is_active, price_fixed in PRODUCTS:
            product = session.scalars(select(Product).where(Product.sku == sku)).one_or_none()
            if product is None:
                product = Product(sku=sku, category=category, unit=unit)
                session.add(product)
            product.name = name
            product.brand = brand
            product.price = price
            product.cost_price = round(price * 0.8)
            product.is_active = is_active
            product.price_fixed = price_fixed
        for code, name, category, unit, price, is_active in SERVICES:
            service = session.scalars(select(Service).where(Service.code == code)).one_or_none()
            if service is None:
                service = Service(code=code, category=category, unit=unit)
                session.add(service)
            service.name = name
            service.price = price
            service.cost_price = round(price * 0.8)
            service.is_active = is_active
        # M20-06: only the 3 standard groups stay active (state after the consolidation migration);
        # 2 retired groups for the "Đã ngừng hoạt động" filter (AC-CAT-107).
        session.execute(
            update(ProductServiceGroup)
            .where(ProductServiceGroup.id.not_in(STANDARD_GROUP_IDS), ProductServiceGroup.is_active)
            .values(is_active=False)
        )
        for name in RETIRED_GROUPS:
            if (
                session.scalars(select(ProductServiceGroup).where(ProductServiceGroup.name == name)).first()
                is None
            ):
                session.add(ProductServiceGroup(name=name, is_active=False))
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
        lan_id = session.scalars(select(Employee.id).where(Employee.email == "lan.cskh@smyou.vn")).one()

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
            employee_id: uuid.UUID | None = None,
            title: str | None = None,
        ) -> None:
            task = session.scalars(select(Task).where(Task.code == task_code)).one_or_none()
            if task is None:
                task = Task(
                    order_id=order.id,
                    code=task_code,
                    title=title or f"Lắp đặt camera E2E ({task_code})",
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
                task.title = title or task.title
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
                    employee_id=employee_id or khoa_id,
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

        for order_code, task_code, csat_comment in CSK_REVISION_ORDERS:
            csk_order = upsert_order(
                order_code,
                customer_name="Cty TNHH Yêu Cầu CSKH E2E",
                customer_phone="0918666777",
                service_address="50 Nam Kỳ Khởi Nghĩa, P. Bến Nghé, Q.1, TP.HCM",
            )
            csk_order.status = "COMPLETED"
            csk_order.revision_no = 0
            csk_order.completed_at = now
            csk_order.csat_rating = 2
            csk_order.csat_comment = csat_comment
            csk_order.csat_recorded_by = lan_id
            csk_order.csat_recorded_at = now
            upsert_task_assignment(csk_order, task_code, "DONE", "DONE", "1.0", -1)

        for order_code, creator_email in MINE_DEFAULT_ORDERS:
            mine_order = upsert_order(
                order_code,
                customer_name="Cty TNHH Đơn Của Tôi E2E",
                customer_phone="0918777888",
                service_address="60 Lê Lợi, P. Bến Nghé, Q.1, TP.HCM",
            )
            mine_order.created_by = session.scalars(
                select(Employee.id).where(Employee.email == creator_email)
            ).one()
            mine_order.status = "COMPLETED"
            mine_order.revision_no = 0
            mine_order.completed_at = now
            mine_order.csat_rating = None
            mine_order.csat_comment = None
            mine_order.csat_recorded_by = None
            mine_order.csat_recorded_at = None

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

        # M15-04: Tổng quan — Top 10 khách hàng + tổng hợp đánh giá cần ≥1 đơn COMPLETED có
        # customer_id + csat_rating trong tháng hiện tại (giờ thật lúc `make e2e` chạy, không
        # phải FakeClock — khác integration test). Gắn vào khách hàng E2E-KH-001 đã seed sẵn.
        e2e_kh_001_id = session.scalars(select(Customer.id).where(Customer.code == "E2E-KH-001")).one()
        dashboard_order = session.scalars(select(Order).where(Order.code == "E2E-DH-M1504A")).one_or_none()
        if dashboard_order is None:
            dashboard_order = Order(
                code="E2E-DH-M1504A",
                status="COMPLETED",
                customer_id=e2e_kh_001_id,
                customer_name="Cty Sáng Tạo Mới E2E",
                customer_phone="0909123456",
                service_address="10 Nguyễn Huệ, P. Bến Nghé, Q.1, TP.HCM",
                created_by=creator_id,
            )
            session.add(dashboard_order)
        dashboard_order.status = "COMPLETED"
        dashboard_order.customer_id = e2e_kh_001_id
        dashboard_order.total = 12_000_000
        dashboard_order.completed_at = now
        dashboard_order.csat_rating = 5
        # M24-01b AC-RPT-160: báo cáo theo SP/DV cần đơn hoàn tất ở 2 nhóm khác nhau.
        dashboard_order.division_id = SECURITY_GROUP_ID
        # M20-02: thẻ "Chưa đánh giá" trên /orders (CSKH) cần ≥1 đơn COMPLETED trong tháng hiện tại
        # chưa có csat_rating để AC-CSK-033 có dữ liệu lọc.
        unrated_order = session.scalars(select(Order).where(Order.code == "E2E-DH-M2002A")).one_or_none()
        if unrated_order is None:
            unrated_order = Order(
                code="E2E-DH-M2002A",
                status="COMPLETED",
                customer_name="Khách lẻ M20-02 E2E",
                customer_phone="0909765432",
                service_address="22 Lý Tự Trọng, P. Bến Nghé, Q.1, TP.HCM",
                created_by=creator_id,
            )
            session.add(unrated_order)
        unrated_order.status = "COMPLETED"
        unrated_order.customer_name = "Khách lẻ M20-02 E2E"
        unrated_order.completed_at = now
        unrated_order.csat_rating = None
        # M16: báo cáo doanh thu cộng theo dòng hàng (credited_employee_id), nên đơn cần ≥1 dòng
        # ghi công cho An thì E2E-KH-001 / Nguyễn Văn An mới hiện trong báo cáo.
        session.flush()
        has_line = session.scalars(
            select(OrderLine.id).where(OrderLine.order_id == dashboard_order.id).limit(1)
        ).one_or_none()
        if has_line is None:
            session.add(
                OrderLine(
                    order_id=dashboard_order.id,
                    position=1,
                    item_type="CUSTOM",
                    name_snapshot="Lắp đặt hệ thống camera E2E",
                    unit_snapshot="gói",
                    vat_rate=Decimal("0"),
                    quantity=Decimal("1"),
                    unit_price=12_000_000,
                    line_gross=12_000_000,
                    line_vat=0,
                    line_total=12_000_000,
                    credited_employee_id=creator_id,
                )
            )
        # M24-01b AC-RPT-160: nhóm thứ 2 ("Thiết bị văn phòng") cho báo cáo doanh thu theo SP/DV.
        office_order = session.scalars(select(Order).where(Order.code == "E2E-DH-M2401A")).one_or_none()
        if office_order is None:
            office_order = Order(
                code="E2E-DH-M2401A",
                status="COMPLETED",
                customer_name="Cty Văn Phòng Xanh E2E",
                customer_phone="0909240101",
                service_address="5 Pasteur, P. Bến Nghé, Q.1, TP.HCM",
                created_by=creator_id,
            )
            session.add(office_order)
        office_order.status = "COMPLETED"
        office_order.division_id = OFFICE_GROUP_ID
        office_order.total = 3_000_000
        office_order.completed_at = now
        session.flush()
        if (
            session.scalars(
                select(OrderLine.id).where(OrderLine.order_id == office_order.id).limit(1)
            ).one_or_none()
            is None
        ):
            session.add(
                OrderLine(
                    order_id=office_order.id,
                    position=1,
                    item_type="CUSTOM",
                    name_snapshot="Máy in văn phòng E2E",
                    unit_snapshot="cái",
                    vat_rate=Decimal("0"),
                    quantity=Decimal("2"),
                    unit_price=1_500_000,
                    line_gross=3_000_000,
                    line_vat=0,
                    line_total=3_000_000,
                    credited_employee_id=creator_id,
                )
            )

        # M18-01a: popup thẻ Tổng quan cần dòng thật ở CẢ 2 project (mobile + desktop chạy song song),
        # không dựa vào đơn do test khác tạo qua UI. Đơn Chờ điều phối của Hoa (SALE) + 1 đầu việc
        # quá hạn chưa giao ai (NEEDS_ASSIGNEE → không lọt vào "Việc của tôi" của KTV nào).
        hoa_id = session.scalars(select(Employee.id).where(Employee.email == "hoa.e2e@smyou.vn")).one()
        pending_order = session.scalars(select(Order).where(Order.code == "E2E-DH-M1801A")).one_or_none()
        if pending_order is None:
            pending_order = Order(
                code="E2E-DH-M1801A",
                status="PENDING_DISPATCH",
                customer_name="Cty Ánh Dương E2E",
                customer_phone="0911222333",
                service_address="12 Lê Lợi, P. Bến Nghé, Q.1, TP.HCM",
                created_by=hoa_id,
            )
            session.add(pending_order)
        pending_order.status = "PENDING_DISPATCH"
        overdue_order = upsert_order("E2E-DH-M1801B")
        overdue_order.status = "IN_PROGRESS"
        overdue_task = session.scalars(select(Task).where(Task.code == "E2E-DH-M1801B-T1")).one_or_none()
        if overdue_task is None:
            overdue_task = Task(
                order_id=overdue_order.id,
                code="E2E-DH-M1801B-T1",
                title="Bảo trì máy in E2E (quá hạn)",
                origin="INITIAL",
                created_in_revision=0,
                status="NEEDS_ASSIGNEE",
                estimated_hours="1.0",
                due_at=now - timedelta(days=1),
                priority="NORMAL",
                created_by=creator_id,
            )
            session.add(overdue_task)
        overdue_task.status = "NEEDS_ASSIGNEE"
        overdue_task.due_at = now - timedelta(days=1)

        # M18-01b (AC-DASH-100): Đức có 1 việc đã nhận nhưng quá hạn → thẻ "Quá hạn chưa hoàn thành".
        duc_id = session.scalars(select(Employee.id).where(Employee.email == "duc.ktv3@smyou.vn")).one()
        upsert_task_assignment(
            upsert_order("E2E-DH-M1801C"),
            "E2E-DH-M1801C-T1",
            "ACCEPTED",
            "ACCEPTED",
            "1.0",
            -1,
            duc_id,
            title="Bảo trì camera E2E (quá hạn, của Đức)",
        )

        binh_id = session.scalars(select(Employee.id).where(Employee.email == "binh.ktv@smyou.vn")).one()
        ssd = session.scalars(select(Product).where(Product.sku == "E2E-SSD-001")).one()
        ssd.vat_rate = Decimal("0")
        for order_code, task_code in ON_SITE_ORDERS:
            on_site_order = upsert_order(order_code, customer_name="Cty TNHH Hiện Trường E2E")
            on_site_order.status = "IN_PROGRESS"
            on_site_order.created_by = hoa_id
            on_site_order.subtotal = 1_000_000
            on_site_order.discount_amount = 0
            on_site_order.vat_amount = 0
            on_site_order.total = 1_000_000
            session.execute(delete(OrderLine).where(OrderLine.order_id == on_site_order.id))
            session.execute(delete(Notification).where(Notification.entity_id == on_site_order.id))
            session.add(
                OrderLine(
                    order_id=on_site_order.id,
                    position=1,
                    item_type="CUSTOM",
                    name_snapshot="Lắp đặt camera hiện trường E2E",
                    unit_snapshot="gói",
                    vat_rate=Decimal("0"),
                    quantity=Decimal("1"),
                    unit_price=1_000_000,
                    line_gross=1_000_000,
                    line_vat=0,
                    line_total=1_000_000,
                    credited_employee_id=hoa_id,
                    added_by_id=hoa_id,
                )
            )
            upsert_task_assignment(on_site_order, task_code, "IN_PROGRESS", "IN_PROGRESS", "1.0", 2, binh_id)

        # M21-05b: notes are append-only in the app, so reset the seeded customers' history here —
        # AC-CUS-060 then always starts from "Chưa có ghi nhận", AC-CUS-059 from one fixed note.
        potential_customer_ids = [e2e_kh_001_id]
        for order_code, task_code, customer_code, customer_name, customer_phone in POTENTIAL_ORDERS:
            customer = session.scalars(select(Customer).where(Customer.code == customer_code)).one_or_none()
            if customer is None:
                customer = Customer(
                    code=customer_code, type="COMPANY", phone=customer_phone, created_by=creator_id
                )
                session.add(customer)
            customer.name = customer_name
            customer.phone = customer_phone
            session.flush()
            potential_customer_ids.append(customer.id)
            potential_order = upsert_order(
                order_code, customer_name=customer_name, customer_phone=customer_phone
            )
            potential_order.status = "IN_PROGRESS"
            potential_order.customer_id = customer.id
            potential_order.created_by = hoa_id
            upsert_task_assignment(
                potential_order, task_code, "IN_PROGRESS", "IN_PROGRESS", "1.0", 2, binh_id
            )
        session.execute(
            delete(CustomerPotentialNote).where(CustomerPotentialNote.customer_id.in_(potential_customer_ids))
        )
        session.add(
            CustomerPotentialNote(
                customer_id=e2e_kh_001_id,
                order_id=dashboard_order.id,
                author_id=binh_id,
                note="Muốn lắp thêm 4 camera kho E2E",
            )
        )
    sys.stdout.write(f"seed_e2e: purged {purge.purged} test employees (kept {purge.kept} still referenced)\n")
    sys.stdout.write(
        f"seeded {len(ACCOUNTS)} E2E accounts, {len(PRODUCTS)} E2E products, {len(SERVICES)} E2E services,"
        f" {len(CUSTOMERS)} E2E customers, {len(MY_TASKS)} E2E my-tasks assignments\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
