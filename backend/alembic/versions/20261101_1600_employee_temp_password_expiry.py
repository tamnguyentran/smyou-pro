"""employee_temp_password_expiry

M20-09: hạn dùng mật khẩu tạm (tạo nhân viên / Manager cấp lại + 24 giờ). Không backfill — nhân viên
đang chờ đổi mật khẩu từ trước để NULL = không hết hạn (Q144).

Revision ID: 3f8a1c5e9b27
Revises: 9e4b7a2c6d13
Create Date: 2026-11-01 16:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3f8a1c5e9b27"
down_revision: str | None = "9e4b7a2c6d13"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("temp_password_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "temp_password_expires_at")
