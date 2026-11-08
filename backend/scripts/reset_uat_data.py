"""Reset the DB to the fixed UAT baseline (dev: `make reset-uat-data`; server: DEPLOYMENT.md §10).

With APP_ENV=production it refuses unless given `--allow-production` (owner decision 2026-11-05: UAT
runs on the production server until go-live; the UAT data is wiped before going live).

Keeps: the company profile (+ its current logo), every department, the 3 standard product/service
groups, and the employees / customers / products / services listed below. Deletes everything else:
orders and everything hanging off them, tasks/assignments/defects, customer gifts, customer care calls,
potential notes, audit log, notifications, sessions, password resets, price history, KPI targets,
other attachments.

Then sets the UAT fixtures to a known state so every run starts identically (`make e2e` re-seeds its
own accounts and toggles some of these rows — re-run this after any e2e/verify run):
  - kept employees: active, unlocked, password `UAT_PASSWORD`, no forced change;
  - kept products/services: active, sale + cost price, VAT, warranty / estimated hours below;
  - monthly "Thu nhập thuần" KPI targets for the current month and the next 2 (Asia/Ho_Chi_Minh);
  - order code sequences cleared, so UAT orders start at DH{yyMM}-0001.

Known limitation: deleted attachments' files under the upload dir are removed best-effort only.
"""

import sys
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import CursorResult, Delete, delete, select, update
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.core.security import hash_password
from app.core.sequences import CodeSequence
from app.modules.audit.models import AuditEvent
from app.modules.catalog.models import CatalogPriceHistory, Product, ProductServiceGroup, Service
from app.modules.company.models import CompanyProfile
from app.modules.customer_care_calls.models import CustomerCareCall
from app.modules.customer_gifts.models import CustomerGift
from app.modules.customer_potential.models import CustomerPotentialNote
from app.modules.customers.models import Customer
from app.modules.dispatch.models import Assignment, DefectRecord, Task
from app.modules.files.models import Attachment
from app.modules.identity.models import (
    AuthSession,
    Employee,
    PasswordResetRequest,
    PasswordResetToken,
)
from app.modules.kpi_targets.models import EmployeeKpiTarget
from app.modules.notifications.models import Notification, PushSubscription
from app.modules.orders.models import Order, OrderLine, OrderRevision

UAT_PASSWORD = "Uat@SmYou2026"
VN = ZoneInfo("Asia/Ho_Chi_Minh")

KEPT_EMPLOYEE_CODES = ["NV01", "NV02", "NV03", "NV04", "NV05", "NV06", "E2E06", "E2E09", "E2E14"]
KEPT_CUSTOMER_CODES = ["E2E-KH-001", "E2E-KH-002", "E2E-KH-M2105A"]
KEPT_GROUP_NAMES = ["Kỹ thuật chung", "Thiết bị an ninh", "Thiết bị văn phòng"]

# sku → (price, cost_price, vat_rate, price_fixed, warranty_months)
PRODUCTS = {
    "E2E-MON-001": (2_800_000, 2_240_000, 8, True, 36),
    "E2E-PRN-001": (850_000, 600_000, 8, False, 3),
    "UAT-SP-002": (1_900_000, 1_330_000, 8, True, 24),
}
# code → (price, cost_price, vat_rate, price_fixed, default_estimated_hours)
SERVICES = {
    "E2E-DV-002": (300_000, 150_000, 8, False, 2),
    "DV-QAIMP1792114593137": (150_000, 105_000, 8, True, 1),
}
# employee code → monthly "Thu nhập thuần" target (VND): SALE, CSKH, technicians.
KPI_TARGETS = {
    "NV02": 10_000_000,
    "E2E06": 8_000_000,
    "E2E09": 6_000_000,
    "E2E14": 3_000_000,
    "NV04": 2_000_000,
    "NV05": 2_000_000,
    "NV06": 2_000_000,
}
KPI_MONTHS = 3


def _months_from(today: date, count: int) -> list[date]:
    months = []
    year, month = today.year, today.month
    for _ in range(count):
        months.append(date(year, month, 1))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def _ids(
    session: Session,
    key: InstrumentedAttribute[str],
    id_col: InstrumentedAttribute[uuid.UUID],
    wanted: list[str],
    what: str,
) -> dict[str, uuid.UUID]:
    found = dict(session.execute(select(key, id_col).where(key.in_(wanted))).tuples().all())
    missing = sorted(set(wanted) - set(found))
    if missing:
        raise SystemExit(f"reset_uat_data: missing {what}: {missing} — nothing was changed")
    return found


def reset(session: Session, settings: Settings, today: date) -> dict[str, int]:
    employees = _ids(session, Employee.code, Employee.id, KEPT_EMPLOYEE_CODES, "employees")
    customers = _ids(session, Customer.code, Customer.id, KEPT_CUSTOMER_CODES, "customers")
    products = _ids(session, Product.sku, Product.id, list(PRODUCTS), "products")
    services = _ids(session, Service.code, Service.id, list(SERVICES), "services")
    groups = _ids(session, ProductServiceGroup.name, ProductServiceGroup.id, KEPT_GROUP_NAMES, "groups")
    owner = employees["NV01"]

    counts: dict[str, int] = {}

    def run(name: str, stmt: Delete) -> None:
        result = session.execute(stmt)
        counts[name] = result.rowcount if isinstance(result, CursorResult) else 0

    # Orders and everything that hangs off them.
    run("defect_records", delete(DefectRecord))
    run("assignments", delete(Assignment))
    run("tasks", delete(Task))
    run("customer_potential_notes", delete(CustomerPotentialNote))
    run("order_revisions", delete(OrderRevision))
    run("order_lines", delete(OrderLine))
    run("orders", delete(Order))
    run("customer_gifts", delete(CustomerGift))
    run("customer_care_calls", delete(CustomerCareCall))
    # Logs, inboxes, sessions, history.
    run("audit_events", delete(AuditEvent))
    run("notifications", delete(Notification))
    run("push_subscriptions", delete(PushSubscription))
    run("auth_sessions", delete(AuthSession))
    run("password_reset_tokens", delete(PasswordResetToken))
    run("password_reset_requests", delete(PasswordResetRequest))
    run("catalog_price_history", delete(CatalogPriceHistory))
    run("employee_kpi_targets", delete(EmployeeKpiTarget))
    run("order_code_sequences", delete(CodeSequence).where(CodeSequence.scope == "order"))
    # Master data outside the kept sets.
    run("customers", delete(Customer).where(Customer.id.not_in(customers.values())))
    run("products", delete(Product).where(Product.id.not_in(products.values())))
    run("services", delete(Service).where(Service.id.not_in(services.values())))
    run(
        "product_service_groups",
        delete(ProductServiceGroup).where(ProductServiceGroup.id.not_in(groups.values())),
    )

    # Attachments: keep only the company's current logo and the kept products' images.
    kept_attachment_ids = {
        a
        for a in [
            *session.scalars(select(CompanyProfile.logo_attachment_id)),
            *session.scalars(select(Product.image_attachment_id)),
        ]
        if a is not None
    }
    session.execute(
        update(Attachment).where(Attachment.id.in_(kept_attachment_ids)).values(uploaded_by=owner)
    )
    doomed_files = session.scalars(
        select(Attachment.storage_key).where(Attachment.id.not_in(kept_attachment_ids))
    ).all()
    run("attachments", delete(Attachment).where(Attachment.id.not_in(kept_attachment_ids)))

    # Employees: the kept customers may have been created by someone about to be deleted.
    session.execute(update(Customer).values(created_by=owner))
    run("employees", delete(Employee).where(Employee.id.not_in(employees.values())))

    # Known state for the kept fixtures.
    session.execute(
        update(Employee)
        .where(Employee.id.in_(employees.values()))
        .values(
            password_hash=hash_password(UAT_PASSWORD),
            must_change_password=False,
            temp_password_expires_at=None,
            is_active=True,
            failed_login_count=0,
            locked_until=None,
        )
    )
    session.execute(update(ProductServiceGroup).values(is_active=True))
    for sku, (price, cost, vat, fixed, warranty) in PRODUCTS.items():
        session.execute(
            update(Product)
            .where(Product.sku == sku)
            .values(
                price=price,
                cost_price=cost,
                vat_rate=vat,
                price_fixed=fixed,
                warranty_months=warranty,
                is_active=True,
            )
        )
    for code, (price, cost, vat, fixed, hours) in SERVICES.items():
        session.execute(
            update(Service)
            .where(Service.code == code)
            .values(
                price=price,
                cost_price=cost,
                vat_rate=vat,
                price_fixed=fixed,
                default_estimated_hours=hours,
                is_active=True,
            )
        )
    for month in _months_from(today, KPI_MONTHS):
        for code, target in KPI_TARGETS.items():
            session.add(
                EmployeeKpiTarget(
                    employee_id=employees[code],
                    month=month,
                    net_revenue_target=target,
                    version=1,
                    updated_by=owner,
                )
            )
    counts["kpi_targets_created"] = KPI_MONTHS * len(KPI_TARGETS)

    session.flush()
    for key in doomed_files:
        try:
            (settings.upload_dir / key).unlink(missing_ok=True)
        except OSError:
            continue
    return counts


ALLOW_PRODUCTION_FLAG = "--allow-production"


def main(argv: list[str]) -> int:
    settings = Settings()
    if settings.app_env == "production" and ALLOW_PRODUCTION_FLAG not in argv:
        sys.stderr.write(
            "reset_uat_data: APP_ENV=production — this DELETES every order, customer, product and"
            f" employee outside the UAT set. Back up first, then re-run with {ALLOW_PRODUCTION_FLAG}.\n"
        )
        return 1
    factory = create_session_factory(
        create_db_engine(settings.database_url, settings.db_connect_timeout_seconds)
    )
    with factory() as session, session.begin():
        counts = reset(session, settings, datetime.now(VN).date())
    sys.stdout.write("deleted / created:\n")
    for name, count in counts.items():
        sys.stdout.write(f"  {name}: {count}\n")
    sys.stdout.write(f"UAT accounts password: {UAT_PASSWORD}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
