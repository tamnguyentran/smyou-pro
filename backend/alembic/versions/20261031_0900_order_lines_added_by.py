"""order_lines_added_by

Revision ID: 3f8a1c6d2e90
Revises: bdf716c79f54
Create Date: 2026-10-31 09:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3f8a1c6d2e90"
down_revision: str | None = "bdf716c79f54"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # M19-01a §5: no backfill — existing lines keep added_by_id NULL / added_on_site false.
    op.add_column("order_lines", sa.Column("added_by_id", sa.Uuid(), nullable=True))
    op.add_column(
        "order_lines",
        sa.Column("added_on_site", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_foreign_key(
        op.f("fk_order_lines_added_by_id_employees"), "order_lines", "employees", ["added_by_id"], ["id"]
    )
    op.create_index(op.f("ix_order_lines_added_by_id"), "order_lines", ["added_by_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_order_lines_added_by_id"), table_name="order_lines")
    op.drop_constraint(op.f("fk_order_lines_added_by_id_employees"), "order_lines", type_="foreignkey")
    op.drop_column("order_lines", "added_on_site")
    op.drop_column("order_lines", "added_by_id")
