"""employee_kpi_targets

M21-01a: chỉ tiêu "Thu nhập thuần" (VND) theo nhân viên và tháng; mỗi (nhân viên, tháng) tối đa 1 dòng.

Revision ID: 6c2d9e4a1f70
Revises: 3f8a1c5e9b27
Create Date: 2026-11-01 18:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6c2d9e4a1f70"
down_revision: str | None = "3f8a1c5e9b27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "employee_kpi_targets",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("net_revenue_target", sa.BigInteger(), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "extract(day from month) = 1", name=op.f("ck_employee_kpi_targets_month_first_day")
        ),
        sa.CheckConstraint(
            "net_revenue_target >= 0", name=op.f("ck_employee_kpi_targets_net_revenue_target_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["employees.id"],
            name=op.f("fk_employee_kpi_targets_employee_id_employees"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["employees.id"],
            name=op.f("fk_employee_kpi_targets_updated_by_employees"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_kpi_targets")),
        sa.UniqueConstraint("employee_id", "month", name=op.f("uq_employee_kpi_targets_employee_id")),
    )
    op.create_index(op.f("ix_employee_kpi_targets_month"), "employee_kpi_targets", ["month"], unique=False)
    op.create_index(
        op.f("ix_employee_kpi_targets_updated_by"), "employee_kpi_targets", ["updated_by"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_employee_kpi_targets_updated_by"), table_name="employee_kpi_targets")
    op.drop_index(op.f("ix_employee_kpi_targets_month"), table_name="employee_kpi_targets")
    op.drop_table("employee_kpi_targets")
