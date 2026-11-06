"""M21-08: backfill missing cost prices with 70% of the selling price (data only)

Revision ID: 7b3e5d1a9c42
Revises: 149cce71a5c6
Create Date: 2026-11-04 15:00:00

One-off data fix (Q161 item 3, Q165): catalog items and old order lines without a cost price get
70% of the selling price, rounded half up to whole VND — Postgres `ROUND(numeric)`, the same as the
M23 query-time fallback, so business charts do not move. Gift lines (Q175, assumed) use 70% of the
catalog price at sale time, or 0 without one. No price history and no audit events: this is a data
correction, not a user action. `cost_price` stays nullable.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "7b3e5d1a9c42"
down_revision: str | None = "149cce71a5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE products SET cost_price = ROUND(price * 0.7) WHERE cost_price IS NULL")
    op.execute("UPDATE services SET cost_price = ROUND(price * 0.7) WHERE cost_price IS NULL")
    op.execute(
        "UPDATE order_lines SET cost_price_snapshot = ROUND(unit_price * 0.7)"
        " WHERE cost_price_snapshot IS NULL AND NOT is_gift"
    )
    op.execute(
        "UPDATE order_lines SET cost_price_snapshot = COALESCE(ROUND(catalog_price_snapshot * 0.7), 0)"
        " WHERE cost_price_snapshot IS NULL AND is_gift"
    )


def downgrade() -> None:
    # Backfilled costs cannot be told apart from real ones, so there is nothing to undo.
    pass
