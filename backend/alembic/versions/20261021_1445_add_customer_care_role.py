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
    op.drop_constraint(op.f("ck_employee_roles_role"), "employee_roles", type_="check")
    op.create_check_constraint(
        "ck_employee_roles_role",
        "employee_roles",
        "role IN ('MANAGER', 'SALE', 'CUSTOMER_CARE', 'TECH_LEAD', 'TECHNICIAN')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_employee_roles_role"), "employee_roles", type_="check")
    op.create_check_constraint(
        "ck_employee_roles_role",
        "employee_roles",
        "role IN ('MANAGER', 'SALE', 'TECH_LEAD', 'TECHNICIAN')",
    )
