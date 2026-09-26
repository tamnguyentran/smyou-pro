"""E2E accounts (run by `make e2e` before Playwright). Idempotent: resets passwords, lock-outs and sessions.

Never run against production: the passwords below are public.
"""

import sys
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.core.security import hash_password
from app.modules.identity.models import AuthSession, Employee, EmployeeRole

# (email, code, full name, role, password, must change password) — one technician per Playwright
# project so the mobile and desktop runs can each do the first-login password change in parallel.
ACCOUNTS = [
    ("an.e2e@smyou.vn", "E2E01", "Nguyễn Văn An", "MANAGER", "E2e@SmYou2026", False),
    ("khoa.mobile@smyou.vn", "E2E02", "Trần Minh Khoa", "TECHNICIAN", "TamThoi#E2E1", True),
    ("khoa.desktop@smyou.vn", "E2E03", "Trần Minh Khoa", "TECHNICIAN", "TamThoi#E2E1", True),
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
        for email, code, name, role, password, must_change in ACCOUNTS:
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
            employee.roles = [EmployeeRole(role=role)]
            session.flush()
            session.execute(
                update(AuthSession)
                .where(AuthSession.employee_id == employee.id, AuthSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )
    sys.stdout.write(f"seeded {len(ACCOUNTS)} E2E accounts\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
