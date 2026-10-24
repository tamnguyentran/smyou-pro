"""customer_contact_phone_fields

Revision ID: 4b80c4323e70
Revises: 859c7695c280
Create Date: 2026-10-23 16:55:34.794994+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4b80c4323e70"
down_revision: str | None = "859c7695c280"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("contact_person_phone", sa.String(length=20), nullable=True))
    op.add_column("customers", sa.Column("director_phone", sa.String(length=20), nullable=True))
    op.create_check_constraint(
        op.f("ck_customers_contact_person_phone"),
        "customers",
        "contact_person_phone ~ '^0[0-9]{9}$' OR contact_person_phone IS NULL",
    )
    op.create_check_constraint(
        op.f("ck_customers_director_phone"),
        "customers",
        "director_phone ~ '^0[0-9]{9}$' OR director_phone IS NULL",
    )
    # Chủ dự án chốt: bỏ email phụ trách IT (chỉ giữ tên + SĐT).
    op.drop_column("customers", "it_contact_email")


def downgrade() -> None:
    op.add_column("customers", sa.Column("it_contact_email", sa.String(length=255), nullable=True))
    op.drop_constraint(op.f("ck_customers_director_phone"), "customers", type_="check")
    op.drop_constraint(op.f("ck_customers_contact_person_phone"), "customers", type_="check")
    op.drop_column("customers", "director_phone")
    op.drop_column("customers", "contact_person_phone")
