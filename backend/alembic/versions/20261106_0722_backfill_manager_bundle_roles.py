"""UAT-02: give every MANAGER the rest of MANAGER_BUNDLE (data only)

Revision ID: 674b43c68403
Revises: 7b3e5d1a9c42
Create Date: 2026-11-06 07:22:35.420255+00:00

One-off data fix (Q185): since M15-01 saving the MANAGER role always adds SALE, CUSTOMER_CARE and
TECH_LEAD (`employees/domain.py#MANAGER_BUNDLE`), but accounts saved earlier (e.g. UAT's nam.nv) only
have MANAGER. No audit events: this is a data correction, not a user action.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "674b43c68403"
down_revision: str | None = "7b3e5d1a9c42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "INSERT INTO employee_roles (employee_id, role)"
        " SELECT m.employee_id, b.role FROM employee_roles m"
        " CROSS JOIN (VALUES ('SALE'), ('CUSTOMER_CARE'), ('TECH_LEAD')) AS b(role)"
        " WHERE m.role = 'MANAGER'"
        " ON CONFLICT (employee_id, role) DO NOTHING"
    )


def downgrade() -> None:
    # Backfilled roles cannot be told apart from ones saved by a user, so there is nothing to undo.
    pass
