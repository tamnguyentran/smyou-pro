"""add_order_status_dispatched — adds DISPATCHED to orders.status CHECK constraint (Q90, M13).

Revision ID: b34d522f26b0
Revises: 1ea7bb219407
Create Date: 2026-10-19 08:04:39.207483+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b34d522f26b0"
down_revision: str | None = "1ea7bb219407"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_STATUSES = (
    "'DRAFT', 'PENDING_DISPATCH', 'IN_PROGRESS', 'AWAITING_CONFIRMATION', 'COMPLETED', "
    "'REVISION', 'CANCELLED'"
)
_NEW_STATUSES = (
    "'DRAFT', 'PENDING_DISPATCH', 'DISPATCHED', 'IN_PROGRESS', 'AWAITING_CONFIRMATION', "
    "'COMPLETED', 'REVISION', 'CANCELLED'"
)


def upgrade() -> None:
    op.drop_constraint(op.f("ck_orders_status"), "orders", type_="check")
    op.create_check_constraint(op.f("ck_orders_status"), "orders", f"status IN ({_NEW_STATUSES})")


def downgrade() -> None:
    op.drop_constraint(op.f("ck_orders_status"), "orders", type_="check")
    op.create_check_constraint(op.f("ck_orders_status"), "orders", f"status IN ({_OLD_STATUSES})")
