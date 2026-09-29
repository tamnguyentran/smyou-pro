"""Order management use cases (M3-02a). Callers own the transaction; these never commit."""

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules
from app.modules.orders.models import Order
from app.modules.orders.schemas import (
    OrderCreate,
    OrderDetail,
    OrderLineCreate,
    OrderLineRemove,
    OrderLineUpdate,
    OrderUpdate,
)

# order.edit_draft genuinely grants SALE only `own` (unlike customers/audit's empty `{}`, which is
# safe only because every role holding those capabilities gets `all`). `assigned` (TECHNICIAN) has
# no rule yet: Task/Assignment don't exist until M4/M5, so it fails closed (no rows) — correct,
# since a DRAFT order can never have an assignment.
RULES: ScopeRules = {"own": lambda actor: Order.created_by == actor.id}


def create_order(
    session: Session, actor: Actor, body: OrderCreate, *, now: datetime, request_id: str | None = None
) -> OrderDetail:
    raise NotImplementedError


def get_order(session: Session, actor: Actor, order_id: uuid.UUID) -> OrderDetail:
    raise NotImplementedError


def update_order(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderUpdate,
    *,
    request_id: str | None = None,
) -> OrderDetail:
    raise NotImplementedError


def add_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    body: OrderLineCreate,
    *,
    request_id: str | None = None,
) -> OrderDetail:
    raise NotImplementedError


def update_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineUpdate,
    *,
    request_id: str | None = None,
) -> OrderDetail:
    raise NotImplementedError


def remove_line(
    session: Session,
    actor: Actor,
    order_id: uuid.UUID,
    line_id: uuid.UUID,
    body: OrderLineRemove,
    *,
    request_id: str | None = None,
) -> OrderDetail:
    raise NotImplementedError
