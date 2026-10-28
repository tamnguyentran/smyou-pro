"""company_profile

Revision ID: 2d602f30885d
Revises: 1db6a37d4d59
Create Date: 2026-10-28 12:29:17.002563+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2d602f30885d"
down_revision: str | None = "1db6a37d4d59"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "company_profile",
        sa.Column("id", sa.SmallInteger(), server_default=sa.text("1"), autoincrement=False, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("tax_code", sa.String(length=14), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("phone_secondary", sa.String(length=20), nullable=True),
        sa.Column("fax", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("website", sa.String(length=255), nullable=True),
        sa.Column("logo_attachment_id", sa.Uuid(), nullable=True),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("id = 1", name=op.f("ck_company_profile_singleton")),
        sa.ForeignKeyConstraint(
            ["logo_attachment_id"],
            ["attachments.id"],
            name=op.f("fk_company_profile_logo_attachment_id_attachments"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_company_profile")),
    )
    # M17-01 §2: the single row, seeded from the SMYou sales invoice (owner confirmed 2026-10-28).
    op.execute(
        sa.text(
            "INSERT INTO company_profile (id, name, tax_code, address, phone, phone_secondary, fax, email, website)"
            " VALUES (1, :name, :tax_code, :address, :phone, :phone_secondary, :fax, :email, :website)"
        ).bindparams(
            name="CÔNG TY TNHH SMYOU",
            tax_code="0309390732",
            address="8C/A-9C/A Nguyễn Ảnh Thủ, Khu Phố 1, P. Trung Mỹ Tây, TP.HCM",
            phone="0932068787",
            phone_secondary="02862501997",
            fax="02862533978",
            email="kimyensmyou@gmail.com",
            website="http://smyou.vn",
        )
    )


def downgrade() -> None:
    op.drop_table("company_profile")
