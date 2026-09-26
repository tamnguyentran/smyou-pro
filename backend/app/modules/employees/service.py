"""Employee management use cases (M1-04a). Callers own the transaction."""

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.authz import Actor


def set_roles(
    session: Session, actor: Actor, employee_id: uuid.UUID, *, version: int, roles: list[str], now: datetime
) -> object:
    raise NotImplementedError


def deactivate(
    session: Session, actor: Actor, employee_id: uuid.UUID, *, version: int, now: datetime
) -> object:
    raise NotImplementedError
