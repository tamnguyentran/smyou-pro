"""E2E accounts (run by `make e2e` before Playwright). Idempotent: resets passwords, lock-outs and sessions.

Never run against production: the passwords below are public.
"""

import sys
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.core.security import hash_password
from app.modules.catalog.models import Product
from app.modules.identity.models import AuthSession, Employee, EmployeeRole

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

# (sku, name, category, brand, unit, price, is_active) — M2-01b: stable data for the products list
# screenshot/e2e, independent of test execution order (upsert by sku, not created by a test itself).
PRODUCTS = [
    ("E2E-MON-001", "Màn hình Dell 22 inch E2E", "MONITOR", "Dell", "CAI", 2_800_000, True),
    ("E2E-PRN-001", "Hộp mực Canon E2E", "PRINTER_SUPPLY", "Canon", "HOP", 850_000, False),
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
        for sku, name, category, brand, unit, price, is_active in PRODUCTS:
            product = session.scalars(select(Product).where(Product.sku == sku)).one_or_none()
            if product is None:
                product = Product(sku=sku, category=category, unit=unit)
                session.add(product)
            product.name = name
            product.brand = brand
            product.price = price
            product.is_active = is_active
    sys.stdout.write(f"seeded {len(ACCOUNTS)} E2E accounts, {len(PRODUCTS)} E2E products\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
