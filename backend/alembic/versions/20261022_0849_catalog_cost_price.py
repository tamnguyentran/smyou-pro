"""catalog_cost_price

Revision ID: 197ced40593f
Revises: 5830f661b4b2
Create Date: 2026-10-22 08:49:38.309482+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "197ced40593f"
down_revision: str | None = "5830f661b4b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("products", sa.Column("cost_price", sa.BigInteger(), nullable=True))
    op.add_column("services", sa.Column("cost_price", sa.BigInteger(), nullable=True))
    op.create_check_constraint(
        op.f("ck_products_cost_price_non_negative"),
        "products",
        "cost_price IS NULL OR cost_price >= 0",
    )
    op.create_check_constraint(
        op.f("ck_services_cost_price_non_negative"),
        "services",
        "cost_price IS NULL OR cost_price >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_services_cost_price_non_negative"), "services", type_="check")
    op.drop_constraint(op.f("ck_products_cost_price_non_negative"), "products", type_="check")
    op.drop_column("services", "cost_price")
    op.drop_column("products", "cost_price")
