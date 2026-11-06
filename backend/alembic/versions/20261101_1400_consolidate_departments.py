"""consolidate_departments

M20-07: chỉ còn 3 phòng ban chuẩn (UUID cố định của M17-02a). Nhân viên (cả người đã nghỉ) ở phòng
khác → "Phát Triển Kinh Tế"; phòng khác → xoá hẳn (employees.department_id là khoá ngoại duy nhất,
đã chuyển hết). Downgrade là no-op dữ liệu: không khôi phục được phòng cũ của từng nhân viên.

Revision ID: 9e4b7a2c6d13
Revises: 7c2d9e4b1a05
Create Date: 2026-11-01 14:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9e4b7a2c6d13"
down_revision: str | None = "7c2d9e4b1a05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ECONOMIC = "d4444444-4444-4444-8444-444444444444"
_STANDARD = {
    _ECONOMIC: "Phát Triển Kinh Tế",
    "d5555555-5555-4555-8555-555555555555": "Nhân sự/Marketing",
    "d6666666-6666-4666-8666-666666666666": "Kế Toán - Tài chính",
}
_STANDARD_IDS = "(" + ", ".join(f"'{department_id}'" for department_id in _STANDARD) + ")"


def upgrade() -> None:
    bind = op.get_bind()
    # The target must exist before employees are moved onto it (FK); (re)named below.
    bind.execute(
        sa.text(
            "INSERT INTO departments (id, name, is_active, version) VALUES (:id, :name, false, 1)"
            " ON CONFLICT (id) DO NOTHING"
        ),
        {"id": _ECONOMIC, "name": _STANDARD[_ECONOMIC]},
    )
    op.execute(
        f"UPDATE employees SET department_id = '{_ECONOMIC}', version = version + 1, updated_at = now()"  # noqa: S608  # constants only
        f" WHERE department_id NOT IN {_STANDARD_IDS}"
    )
    # Deleting the others first frees any standard name a custom active department may hold
    # (uq_departments_name_active).
    op.execute(f"DELETE FROM departments WHERE id NOT IN {_STANDARD_IDS}")  # noqa: S608  # constants only
    # A standard row may hold another standard row's name (renamed by hand): park every misnamed
    # one as inactive first so the renames below never collide. The (re)activation bumps version once.
    for department_id, name in _STANDARD.items():
        bind.execute(
            sa.text("UPDATE departments SET is_active = false WHERE id = :id AND name <> :name"),
            {"id": department_id, "name": name},
        )
    for department_id, name in _STANDARD.items():
        params = {"id": department_id, "name": name}
        bind.execute(
            sa.text(
                "UPDATE departments SET name = :name, is_active = true, version = version + 1,"
                " updated_at = now() WHERE id = :id AND (name <> :name OR NOT is_active)"
            ),
            params,
        )
        bind.execute(
            sa.text(
                "INSERT INTO departments (id, name, is_active, version) VALUES (:id, :name, true, 1)"
                " ON CONFLICT (id) DO NOTHING"
            ),
            params,
        )


def downgrade() -> None:
    # Data-only migration; the previous department of each employee is not recorded anywhere.
    pass
