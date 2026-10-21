"""add_customer_care_role

Revision ID: 4b62705f152f
Revises: 1ea7bb219407
Create Date: 2026-10-21 14:45:23.955575+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "4b62705f152f"
down_revision: str | None = "1ea7bb219407"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Raw SQL — op.create_check_constraint() re-applies the ck_%(table_name)s_%(constraint_name)s
    # naming convention to whatever name it's given, so there's no way to pass it the final,
    # already-conventioned name "ck_employee_roles_role" without doubling the prefix.
    op.execute("ALTER TABLE employee_roles DROP CONSTRAINT ck_employee_roles_role")
    op.execute(
        "ALTER TABLE employee_roles ADD CONSTRAINT ck_employee_roles_role "
        "CHECK (role IN ('MANAGER', 'SALE', 'CUSTOMER_CARE', 'TECH_LEAD', 'TECHNICIAN'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE employee_roles DROP CONSTRAINT ck_employee_roles_role")
    op.execute(
        "ALTER TABLE employee_roles ADD CONSTRAINT ck_employee_roles_role "
        "CHECK (role IN ('MANAGER', 'SALE', 'TECH_LEAD', 'TECHNICIAN'))"
    )
