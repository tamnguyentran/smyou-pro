"""catalog_name_unique_active

Revision ID: b665bb51b5f1
Revises: 8ae3eea95886
Create Date: 2026-10-11 09:08:26.502770+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b665bb51b5f1"
down_revision: str | None = "8ae3eea95886"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DUPES_SQL = (
    "SELECT lower(btrim(name)) AS n, count(*) FROM {table} WHERE is_active GROUP BY 1 HAVING count(*) > 1"
)


def _check_no_duplicate_active_names(table: str, label: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(DUPES_SQL.format(table=table))).fetchall()
    if rows:
        names = ", ".join(row.n for row in rows)
        raise RuntimeError(
            f"Có tên {label} trùng đang hoạt động (bất phân biệt hoa/thường), "
            f"cần đổi tên tay trước khi chạy lại migration này: {names}"
        )


def upgrade() -> None:
    # M10-01 (phản hồi UAT): chặn 2 sản phẩm/dịch vụ trùng tên khi đang kinh doanh. Hệ thống đã
    # go-live (M9) nên dữ liệu thật có thể đã có tên trùng — kiểm trước, không tự đổi tên ai.
    _check_no_duplicate_active_names("products", "sản phẩm")
    _check_no_duplicate_active_names("services", "dịch vụ")
    # Not CONCURRENTLY: Alembic runs this inside a transaction, which
    # CREATE INDEX CONCURRENTLY cannot join. products/services are small
    # catalog tables, so the brief write lock is acceptable; revisit if
    # either table grows large enough for the lock to matter.
    op.create_index(
        "uq_products_name_active",
        "products",
        [sa.literal_column("lower(btrim(name))")],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )
    op.create_index(
        "uq_services_name_active",
        "services",
        [sa.literal_column("lower(btrim(name))")],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )


def downgrade() -> None:
    op.drop_index("uq_services_name_active", table_name="services", postgresql_where=sa.text("is_active"))
    op.drop_index("uq_products_name_active", table_name="products", postgresql_where=sa.text("is_active"))
