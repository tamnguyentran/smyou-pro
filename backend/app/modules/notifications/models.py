"""notifications: in-app alerts for one recipient (DOMAIN_MODEL §13, M7-01a).

entity_type/entity_id has no FK — same polymorphic-pointer precedent as audit_events.entity_id;
per spec §3 it is always ("ORDER", order.id), since the app has no standalone task/assignment page.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Unread-count query (recipient_id, read_at) and newest-first listing (recipient_id, created_at desc).
Index("ix_notifications_recipient_unread", Notification.recipient_id, Notification.read_at)
Index("ix_notifications_recipient_created", Notification.recipient_id, Notification.created_at.desc())
