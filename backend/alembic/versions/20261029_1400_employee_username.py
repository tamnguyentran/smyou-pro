"""employee_username

Revision ID: bdf716c79f54
Revises: 7c3e9a41d2b8
Create Date: 2026-10-29 14:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import CITEXT

from app.modules.identity.usernames import base_username, unique_username

revision: str = "bdf716c79f54"
down_revision: str | None = "7c3e9a41d2b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # M17-03b §5: same rule as the service; duplicates numbered by created_at, then code.
    op.add_column("employees", sa.Column("username", CITEXT(), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, full_name FROM employees ORDER BY created_at, code")).all()
    taken: set[str] = set()
    for employee_id, full_name in rows:
        username = unique_username(base_username(full_name), taken)
        taken.add(username)
        conn.execute(
            sa.text("UPDATE employees SET username = :username WHERE id = :id"),
            {"username": username, "id": employee_id},
        )
    op.alter_column("employees", "username", nullable=False)
    op.create_unique_constraint(op.f("uq_employees_username"), "employees", ["username"])


def downgrade() -> None:
    op.drop_constraint(op.f("uq_employees_username"), "employees", type_="unique")
    op.drop_column("employees", "username")
