"""consolidate_product_service_groups

M20-06: chỉ còn 3 nhóm chuẩn (UUID cố định của M16-07). Đơn trỏ tới nhóm khác → "Kỹ thuật chung";
nhóm khác → ngừng hoạt động (không xoá cứng). Downgrade là no-op dữ liệu: không khôi phục được
nhóm cũ của từng đơn.

Revision ID: 7c2d9e4b1a05
Revises: 3f8a1c6d2e90
Create Date: 2026-11-01 09:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7c2d9e4b1a05"
down_revision: str | None = "3f8a1c6d2e90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_GENERAL = "a3333333-3333-4333-8333-333333333333"
_STANDARD = {
    "a1111111-1111-4111-8111-111111111111": "Thiết bị văn phòng",
    "a2222222-2222-4222-8222-222222222222": "Thiết bị an ninh",
    _GENERAL: "Kỹ thuật chung",
}
_STANDARD_IDS = "(" + ", ".join(f"'{group_id}'" for group_id in _STANDARD) + ")"


def upgrade() -> None:
    # Order matters for uq_product_service_groups_name_active: retire custom groups before
    # (re)activating a standard one whose name a custom active group may already hold.
    op.execute(
        f"UPDATE orders SET division_id = '{_GENERAL}', version = version + 1, updated_at = now()"  # noqa: S608  # constants only
        f" WHERE division_id IS NOT NULL AND division_id NOT IN {_STANDARD_IDS}"
    )
    op.execute(
        "UPDATE product_service_groups SET is_active = false, version = version + 1, updated_at = now()"  # noqa: S608  # constants only
        f" WHERE is_active AND id NOT IN {_STANDARD_IDS}"
    )
    bind = op.get_bind()
    # A standard group may hold another standard group's name (renamed by hand): park every
    # misnamed one as inactive first so the renames below never collide. The (re)activation
    # below bumps version once.
    for group_id, name in _STANDARD.items():
        bind.execute(
            sa.text("UPDATE product_service_groups SET is_active = false WHERE id = :id AND name <> :name"),
            {"id": group_id, "name": name},
        )
    for group_id, name in _STANDARD.items():
        params = {"id": group_id, "name": name}
        bind.execute(
            sa.text(
                "UPDATE product_service_groups SET name = :name, is_active = true, version = version + 1,"
                " updated_at = now() WHERE id = :id AND (name <> :name OR NOT is_active)"
            ),
            params,
        )
        bind.execute(
            sa.text(
                "INSERT INTO product_service_groups (id, name, is_active, version) VALUES (:id, :name, true, 1)"
                " ON CONFLICT (id) DO NOTHING"
            ),
            params,
        )


def downgrade() -> None:
    # Data-only migration; the previous group of each order is not recorded anywhere.
    pass
