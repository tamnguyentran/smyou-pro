"""employee_profile_fields

Revision ID: 7c3e9a41d2b8
Revises: 429a747dc251
Create Date: 2026-10-29 09:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7c3e9a41d2b8"
down_revision: str | None = "429a747dc251"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# M17-03a §5: optional personal profile; email becomes optional (Q105, unique still holds — NULLs never clash).
_COLUMNS = (
    ("birth_date", sa.Date()),
    ("birth_place", sa.String(120)),
    ("gender", sa.String(10)),
    ("address", sa.String(255)),
    ("id_number", sa.String(12)),
    ("id_issued_date", sa.Date()),
    ("id_issued_place", sa.String(120)),
    ("marital_status", sa.String(10)),
)
_CHECKS = (
    ("gender", "gender IN ('MALE', 'FEMALE', 'OTHER')"),
    ("marital_status", "marital_status IN ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED')"),
    ("id_number", "id_number ~ '^([0-9]{9}|[0-9]{12})$'"),
)


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column("employees", sa.Column(name, type_, nullable=True))
    for name, condition in _CHECKS:
        op.create_check_constraint(op.f(f"ck_employees_{name}"), "employees", condition)
    op.alter_column("employees", "email", nullable=True)


def downgrade() -> None:
    op.execute("UPDATE employees SET email = code || '@no-email.local' WHERE email IS NULL")
    op.alter_column("employees", "email", nullable=False)
    for name, _ in _CHECKS:
        op.drop_constraint(op.f(f"ck_employees_{name}"), "employees", type_="check")
    for name, _ in reversed(_COLUMNS):
        op.drop_column("employees", name)
