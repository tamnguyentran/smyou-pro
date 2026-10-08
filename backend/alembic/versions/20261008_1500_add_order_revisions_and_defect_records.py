"""add_order_revisions_and_defect_records

Revision ID: 453c436b1309
Revises: b2133c219133
Create Date: 2026-10-08 15:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "453c436b1309"
down_revision: str | None = "b2133c219133"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("last_reopened_in_revision", sa.Integer(), nullable=True))
    op.add_column(
        "tasks", sa.Column("reopen_count", sa.Integer(), server_default=sa.text("0"), nullable=False)
    )
    op.create_table(
        "order_revisions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("revision_no", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("requested_by", sa.Uuid(), nullable=False),
        sa.Column(
            "requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name=op.f("fk_order_revisions_order_id_orders")),
        sa.ForeignKeyConstraint(
            ["requested_by"], ["employees.id"], name=op.f("fk_order_revisions_requested_by_employees")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_revisions")),
    )
    op.create_index(op.f("ix_order_revisions_order_id"), "order_revisions", ["order_id"], unique=False)
    op.create_index(
        op.f("ix_order_revisions_requested_by"), "order_revisions", ["requested_by"], unique=False
    )
    op.create_table(
        "defect_records",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("cycle", sa.Integer(), nullable=False),
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=10), nullable=False),
        sa.Column("reported_by", sa.Uuid(), nullable=False),
        sa.Column("excluded_from_kpi", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("excluded_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("severity IN ('MINOR', 'MAJOR')", name=op.f("ck_defect_records_severity")),
        sa.ForeignKeyConstraint(
            ["assignment_id"], ["assignments.id"], name=op.f("fk_defect_records_assignment_id_assignments")
        ),
        sa.ForeignKeyConstraint(
            ["employee_id"], ["employees.id"], name=op.f("fk_defect_records_employee_id_employees")
        ),
        sa.ForeignKeyConstraint(
            ["reported_by"], ["employees.id"], name=op.f("fk_defect_records_reported_by_employees")
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], name=op.f("fk_defect_records_task_id_tasks")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_defect_records")),
    )
    op.create_index(op.f("ix_defect_records_employee_id"), "defect_records", ["employee_id"], unique=False)
    op.create_index(op.f("ix_defect_records_task_id"), "defect_records", ["task_id"], unique=False)
    op.create_index(
        op.f("ix_defect_records_assignment_id"), "defect_records", ["assignment_id"], unique=False
    )
    op.create_index(op.f("ix_defect_records_reported_by"), "defect_records", ["reported_by"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_defect_records_reported_by"), table_name="defect_records")
    op.drop_index(op.f("ix_defect_records_assignment_id"), table_name="defect_records")
    op.drop_index(op.f("ix_defect_records_task_id"), table_name="defect_records")
    op.drop_index(op.f("ix_defect_records_employee_id"), table_name="defect_records")
    op.drop_table("defect_records")
    op.drop_index(op.f("ix_order_revisions_requested_by"), table_name="order_revisions")
    op.drop_index(op.f("ix_order_revisions_order_id"), table_name="order_revisions")
    op.drop_table("order_revisions")
    op.drop_column("tasks", "reopen_count")
    op.drop_column("tasks", "last_reopened_in_revision")
