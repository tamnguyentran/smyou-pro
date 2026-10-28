"""index_order_fk_columns

Revision ID: 1db6a37d4d59
Revises: 6ab8f30797b0
Create Date: 2026-10-28 01:35:31.027228+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "1db6a37d4d59"
down_revision: str | None = "6ab8f30797b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        op.f("ix_order_lines_credited_employee_id"), "order_lines", ["credited_employee_id"], unique=False
    )
    op.create_index(op.f("ix_orders_division_id"), "orders", ["division_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_orders_division_id"), table_name="orders")
    op.drop_index(op.f("ix_order_lines_credited_employee_id"), table_name="order_lines")
