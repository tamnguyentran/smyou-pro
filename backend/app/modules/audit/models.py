"""audit_events: append-only log of who did what to which entity (DOMAIN_MODEL §12)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, String, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_events_entity", "entity_type", "entity_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    # Write order. One request can write several events (login_failed then account_locked) and
    # they must list in that order; occurred_at alone can tie, a random UUID is no tie-breaker.
    seq: Mapped[int] = mapped_column(BigInteger, Identity(always=True), unique=True)
    # clock_timestamp(), not now(): now() is the transaction start, shared by every event of a request.
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("clock_timestamp()")
    )
    # SET NULL, not RESTRICT: employees are never hard-deleted in production (only deactivated), but
    # a test or an admin script that does delete one must not be blocked by its own audit history.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"), index=True
    )
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    action: Mapped[str] = mapped_column(String(60))
    from_status: Mapped[str | None] = mapped_column(String(40))
    to_status: Mapped[str | None] = mapped_column(String(40))
    # none_as_null: a missing payload is SQL NULL (WHERE data IS NULL works), not the JSON value null.
    data: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    request_id: Mapped[str | None] = mapped_column(String(64))


# Newest-first listing (list_events) walks this index.
Index("ix_audit_events_occurred_at", AuditEvent.occurred_at.desc(), AuditEvent.seq.desc())
