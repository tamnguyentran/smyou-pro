"""Menu badge counters for GET /me (spec/permissions.yaml `menu[].badge`)."""

from collections.abc import Callable, Mapping

from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.core.spec_loader import PermissionsSpec

CounterProvider = Callable[[Session, Actor], int]


def visible_badges(permissions: PermissionsSpec, roles: frozenset[str]) -> set[str]:
    raise NotImplementedError


def check_counter_registry(permissions: PermissionsSpec, providers: Mapping[str, CounterProvider]) -> None:
    raise NotImplementedError
