"""Reset the dev DB to a clean baseline for manual UAT (run by `make reset-test-data`).

Deletes every order/task/assignment/defect/revision, every audit_events and notifications row,
every customer except the 3 named ones below, and every TECHNICIAN/SALE employee except the 6
named ones below. MANAGER/TECH_LEAD employees are left untouched. Never run against production.

Known limitation: uploaded confirmation-photo files under /data/uploads are not deleted from
disk, only their DB rows — orphaned files are left behind (acceptable for a dev-only reset).
"""

import sys

from sqlalchemy import delete, select

from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.modules.audit.models import AuditEvent
from app.modules.customers.models import Customer
from app.modules.dispatch.models import Assignment, DefectRecord, Task
from app.modules.files.models import Attachment
from app.modules.identity.models import Employee, EmployeeRole
from app.modules.notifications.models import Notification
from app.modules.orders.models import Order, OrderLine, OrderRevision

KEPT_CUSTOMER_NAMES = ("Cty Sáng Tạo Mới E2E", "Anh Ngọc E2E - Grand Hotel", "Khách hàng QA E2E")
KEPT_QA_E2E_CODE = "KH00004"  # the one "Khách hàng QA E2E" row kept among its many duplicates
KEPT_STAFF_EMAILS = (
    "kythuat1@smyou.vn",
    "kythuat2@smyou.vn",
    "kythuat3@smyou.vn",
    "kinhdoanh@smyou.vn",
    "hoa.e2e@smyou.vn",
    "ha.e2e@smyou.vn",
)
PRUNED_ROLES = ("TECHNICIAN", "SALE")


def main() -> int:
    settings = Settings()
    if settings.app_env == "production":
        sys.stderr.write("reset_test_data refuses to run with APP_ENV=production\n")
        return 1
    factory = create_session_factory(
        create_db_engine(settings.database_url, settings.db_connect_timeout_seconds)
    )
    with factory() as session, session.begin():
        defects = session.execute(delete(DefectRecord)).rowcount
        assignments = session.execute(delete(Assignment)).rowcount
        tasks = session.execute(delete(Task)).rowcount
        revisions = session.execute(delete(OrderRevision)).rowcount
        lines = session.execute(delete(OrderLine)).rowcount
        orders = session.execute(delete(Order)).rowcount
        # Only ORDER-owned attachments (confirmation photos) — PRODUCT_IMAGE attachments are
        # unrelated to orders and must survive (products.image_attachment_id is RESTRICT).
        attachments = session.execute(delete(Attachment).where(Attachment.owner_type == "ORDER")).rowcount
        audits = session.execute(delete(AuditEvent)).rowcount
        notifications = session.execute(delete(Notification)).rowcount

        kept_customer_ids = set(
            session.scalars(
                select(Customer.id).where(
                    Customer.name.in_(KEPT_CUSTOMER_NAMES[:2]),
                )
            )
        )
        kept_qa_id = session.scalar(
            select(Customer.id).where(
                Customer.name == KEPT_CUSTOMER_NAMES[2], Customer.code == KEPT_QA_E2E_CODE
            )
        )
        if kept_qa_id is not None:
            kept_customer_ids.add(kept_qa_id)
        customers = session.execute(delete(Customer).where(Customer.id.not_in(kept_customer_ids))).rowcount

        pruned_employee_ids = set(
            session.scalars(select(EmployeeRole.employee_id).where(EmployeeRole.role.in_(PRUNED_ROLES)))
        )
        kept_employee_ids = set(
            session.scalars(select(Employee.id).where(Employee.email.in_(KEPT_STAFF_EMAILS)))
        )
        employees = session.execute(
            delete(Employee).where(Employee.id.in_(pruned_employee_ids - kept_employee_ids))
        ).rowcount

        remaining_customers = session.scalars(select(Customer.name, Customer.code)).all()
        remaining_staff = session.scalars(
            select(Employee.email).where(Employee.id.in_(kept_employee_ids))
        ).all()

    sys.stdout.write(
        f"deleted: {defects} defect_records, {assignments} assignments, {tasks} tasks,"
        f" {revisions} order_revisions, {lines} order_lines, {orders} orders,"
        f" {attachments} attachments, {audits} audit_events, {notifications} notifications,"
        f" {customers} customers, {employees} employees (role {PRUNED_ROLES})\n"
        f"kept customers: {remaining_customers}\n"
        f"kept staff: {sorted(remaining_staff)}\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
