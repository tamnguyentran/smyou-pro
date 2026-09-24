"""baseline: empty root of the migration chain

Revision ID: 20260925_0000
Revises:
Create Date: 2026-09-25 00:00:00+00:00
"""

from collections.abc import Sequence

revision: str = "20260925_0000"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
