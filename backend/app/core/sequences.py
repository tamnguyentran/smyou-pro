"""Human-readable code sequences (ARCHITECTURE §5): `code_sequences(scope, period, last_value)`.

`next_value` locks the counter row until the caller's transaction ends, so two concurrent creates
never get the same number.
"""

from sqlalchemy import Integer, String, select, text
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.db import Base


class CodeSequence(Base):
    __tablename__ = "code_sequences"

    scope: Mapped[str] = mapped_column(String(40), primary_key=True)
    period: Mapped[str] = mapped_column(String(10), primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer)


def next_value(session: Session, scope: str, period: str = "", *, at_least_after: int = 0) -> int:
    """The next number in (scope, period), never at or below `at_least_after` (codes made elsewhere)."""
    session.execute(
        text(
            "INSERT INTO code_sequences (scope, period, last_value) VALUES (:scope, :period, 0)"
            " ON CONFLICT DO NOTHING"
        ),
        {"scope": scope, "period": period},
    )
    row = session.scalars(
        select(CodeSequence)
        .where(CodeSequence.scope == scope, CodeSequence.period == period)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    row.last_value = max(row.last_value, at_least_after) + 1
    session.flush()
    return row.last_value
