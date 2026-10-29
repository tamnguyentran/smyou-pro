"""employee_department_id

Revision ID: 429a747dc251
Revises: 02466fd5936d
Create Date: 2026-10-28 16:35:26.230937+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "429a747dc251"
down_revision: str | None = "02466fd5936d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# M17-02b §2: old enum → department seeded with a fixed id by M17-02a.
_MAP = (
    ("MANAGEMENT", "d1111111-1111-4111-8111-111111111111"),
    ("SALES", "d2222222-2222-4222-8222-222222222222"),
    ("TECHNICAL", "d3333333-3333-4333-8333-333333333333"),
)


def upgrade() -> None:
    op.add_column("employees", sa.Column("department_id", sa.Uuid(), nullable=True))
    for old, department_id in _MAP:
        op.execute(
            sa.text(
                "UPDATE employees SET department_id = CAST(:id AS uuid) WHERE department = :old"
            ).bindparams(id=department_id, old=old)
        )
    op.alter_column("employees", "department_id", nullable=False)
    op.create_index(op.f("ix_employees_department_id"), "employees", ["department_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_employees_department_id_departments"),
        "employees",
        "departments",
        ["department_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_column("employees", "department")  # also drops ck_employees_department


def downgrade() -> None:
    op.add_column("employees", sa.Column("department", sa.VARCHAR(length=20), nullable=True))
    # Departments outside the 3 legacy ones fall back to MANAGEMENT (spec §5).
    op.execute("UPDATE employees SET department = 'MANAGEMENT'")
    for old, department_id in _MAP:
        op.execute(
            sa.text(
                "UPDATE employees SET department = :old WHERE department_id = CAST(:id AS uuid)"
            ).bindparams(id=department_id, old=old)
        )
    op.alter_column("employees", "department", nullable=False)
    op.create_check_constraint(
        op.f("ck_employees_department"), "employees", "department IN ('MANAGEMENT', 'SALES', 'TECHNICAL')"
    )
    op.drop_constraint(op.f("fk_employees_department_id_departments"), "employees", type_="foreignkey")
    op.drop_index(op.f("ix_employees_department_id"), table_name="employees")
    op.drop_column("employees", "department_id")
