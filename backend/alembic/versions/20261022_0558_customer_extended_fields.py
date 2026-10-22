"""customer_extended_fields

Revision ID: 5830f661b4b2
Revises: 4e1bf4312bc7
Create Date: 2026-10-22 05:58:20.718153+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5830f661b4b2"
down_revision: str | None = "4e1bf4312bc7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("founded_date", sa.Date(), nullable=True))
    op.add_column("customers", sa.Column("director_name", sa.String(length=120), nullable=True))
    op.add_column("customers", sa.Column("it_contact_name", sa.String(length=120), nullable=True))
    op.add_column("customers", sa.Column("it_contact_phone", sa.String(length=20), nullable=True))
    op.add_column("customers", sa.Column("it_contact_email", sa.String(length=255), nullable=True))
    op.add_column("customers", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("customers", sa.Column("gender", sa.String(length=10), nullable=True))
    op.add_column("customers", sa.Column("occupation", sa.String(length=120), nullable=True))
    op.create_check_constraint(
        op.f("ck_customers_it_contact_phone"),
        "customers",
        "it_contact_phone ~ '^0[0-9]{9}$' OR it_contact_phone IS NULL",
    )
    op.create_check_constraint(
        op.f("ck_customers_gender"), "customers", "gender IN ('MALE', 'FEMALE', 'OTHER') OR gender IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_customers_gender"), "customers", type_="check")
    op.drop_constraint(op.f("ck_customers_it_contact_phone"), "customers", type_="check")
    op.drop_column("customers", "occupation")
    op.drop_column("customers", "gender")
    op.drop_column("customers", "date_of_birth")
    op.drop_column("customers", "it_contact_email")
    op.drop_column("customers", "it_contact_phone")
    op.drop_column("customers", "it_contact_name")
    op.drop_column("customers", "director_name")
    op.drop_column("customers", "founded_date")
