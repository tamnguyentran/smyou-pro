"""customer_care_calls

M27-01a: CSKH ghi nhận cuộc gọi chăm sóc khách hàng (append-only). Yêu cầu của khách được lưu thành
ghi chú tiềm năng không gắn đơn: `customer_potential_notes.order_id` nullable + `care_call_id`, đúng 1
trong 2 khác NULL; `note` nới tới 2000 ký tự (yêu cầu từ cuộc gọi ≤ 2000, KTV vẫn nhập ≤ 1000). Downgrade xoá các ghi chú từ cuộc gọi để khôi phục `order_id NOT NULL`.

Revision ID: 3e8a1c5d7b90
Revises: 674b43c68403
Create Date: 2026-11-08 09:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3e8a1c5d7b90"
down_revision: str | None = "674b43c68403"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _replace_note_length(max_length: int) -> None:
    op.drop_constraint(op.f("ck_customer_potential_notes_note_length"), "customer_potential_notes", type_="check")
    op.create_check_constraint(
        op.f("ck_customer_potential_notes_note_length"),
        "customer_potential_notes",
        f"length(note) BETWEEN 1 AND {max_length}",
    )


def upgrade() -> None:
    op.create_table(
        "customer_care_calls",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("caller_id", sa.Uuid(), nullable=False),
        sa.Column("offered", sa.Text(), nullable=False),
        sa.Column("customer_request", sa.Text(), nullable=True),
        sa.Column("called_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "length(offered) BETWEEN 1 AND 2000", name=op.f("ck_customer_care_calls_offered_length")
        ),
        sa.CheckConstraint(
            "customer_request IS NULL OR length(customer_request) BETWEEN 1 AND 2000",
            name=op.f("ck_customer_care_calls_customer_request_length"),
        ),
        sa.ForeignKeyConstraint(
            ["caller_id"],
            ["employees.id"],
            name=op.f("fk_customer_care_calls_caller_id_employees"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name=op.f("fk_customer_care_calls_customer_id_customers"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_care_calls")),
    )
    op.create_index(
        "ix_customer_care_calls_caller_id_called_at",
        "customer_care_calls",
        ["caller_id", sa.literal_column("called_at DESC")],
        unique=False,
    )
    op.create_index(
        "ix_customer_care_calls_customer_id_called_at",
        "customer_care_calls",
        ["customer_id", sa.literal_column("called_at DESC")],
        unique=False,
    )

    op.alter_column("customer_potential_notes", "order_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column("customer_potential_notes", sa.Column("care_call_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_customer_potential_notes_care_call_id_customer_care_calls"),
        "customer_potential_notes",
        "customer_care_calls",
        ["care_call_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_customer_potential_notes_care_call_id"),
        "customer_potential_notes",
        ["care_call_id"],
        unique=False,
    )
    _replace_note_length(2000)
    op.create_check_constraint(
        op.f("ck_customer_potential_notes_one_source"),
        "customer_potential_notes",
        "num_nonnulls(order_id, care_call_id) = 1",
    )


def downgrade() -> None:
    op.execute("DELETE FROM customer_potential_notes WHERE care_call_id IS NOT NULL")
    op.drop_constraint(
        op.f("ck_customer_potential_notes_one_source"), "customer_potential_notes", type_="check"
    )
    _replace_note_length(1000)
    op.drop_index(op.f("ix_customer_potential_notes_care_call_id"), table_name="customer_potential_notes")
    op.drop_constraint(
        op.f("fk_customer_potential_notes_care_call_id_customer_care_calls"),
        "customer_potential_notes",
        type_="foreignkey",
    )
    op.drop_column("customer_potential_notes", "care_call_id")
    op.alter_column("customer_potential_notes", "order_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_index("ix_customer_care_calls_customer_id_called_at", table_name="customer_care_calls")
    op.drop_index("ix_customer_care_calls_caller_id_called_at", table_name="customer_care_calls")
    op.drop_table("customer_care_calls")
