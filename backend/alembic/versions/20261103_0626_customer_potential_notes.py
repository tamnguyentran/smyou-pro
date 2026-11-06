"""customer_potential_notes

M21-05a: ghi chú "Tiềm năng sử dụng dịch vụ" của khách hàng chủ đơn (append-only, bản mới nhất là hiện tại).

Revision ID: 149cce71a5c6
Revises: 6c2d9e4a1f70
Create Date: 2026-11-03 06:26:31.747459+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "149cce71a5c6"
down_revision: str | None = "6c2d9e4a1f70"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "customer_potential_notes",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "length(note) BETWEEN 1 AND 1000", name=op.f("ck_customer_potential_notes_note_length")
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["employees.id"],
            name=op.f("fk_customer_potential_notes_author_id_employees"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name=op.f("fk_customer_potential_notes_customer_id_customers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_customer_potential_notes_order_id_orders"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_potential_notes")),
    )
    op.create_index(
        op.f("ix_customer_potential_notes_author_id"), "customer_potential_notes", ["author_id"], unique=False
    )
    op.create_index(
        "ix_customer_potential_notes_customer_id_created_at",
        "customer_potential_notes",
        ["customer_id", sa.literal_column("created_at DESC")],
        unique=False,
    )
    op.create_index(
        op.f("ix_customer_potential_notes_order_id"), "customer_potential_notes", ["order_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_customer_potential_notes_order_id"), table_name="customer_potential_notes")
    op.drop_index("ix_customer_potential_notes_customer_id_created_at", table_name="customer_potential_notes")
    op.drop_index(op.f("ix_customer_potential_notes_author_id"), table_name="customer_potential_notes")
    op.drop_table("customer_potential_notes")
