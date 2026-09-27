"""Shared audit write path + read query for the Nhật ký hệ thống page (M1-05).

Other modules call record() through this public function — never insert AuditEvent rows
directly (ARCHITECTURE §3: cross-module calls go through a module's public service).

TODO(M1-05 GREEN): implement record() and list_events(). Left raising NotImplementedError
so the RED test suite fails on missing behaviour, not on a broken import.
"""

import uuid
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.modules.audit.schemas import AuditEventPage


def record(
    session: Session,
    *,
    actor_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    from_status: str | None = None,
    to_status: str | None = None,
    data: dict[str, Any] | None = None,
    request_id: str | None = None,
) -> None:
    raise NotImplementedError


def list_events(
    session: Session,
    actor: Actor,
    *,
    entity_type: str | None,
    actor_id: uuid.UUID | None,
    occurred_from: date | None,
    occurred_to: date | None,
    limit: int,
    offset: int,
) -> AuditEventPage:
    raise NotImplementedError
