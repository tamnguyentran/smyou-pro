"""Menu badge counters for GET /me (spec/permissions.yaml `menu[].badge`).

Modules that own the counted data register a provider per badge key in the composition root; /me only
computes the badges on menu items the caller can see.
"""

from collections.abc import Callable, Iterator, Mapping

from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.core.spec_loader import PERMISSIONS_FILE, MenuItem, PermissionsSpec, SpecError

CounterProvider = Callable[[Session, Actor], int]


def _badges(items: list[MenuItem], inherited: str | None) -> Iterator[tuple[str, str | None]]:
    """(badge key, capability needed to see it); children inherit their parent's capability."""
    for item in items:
        capability = item.capability or inherited
        if item.badge is not None:
            yield item.badge, capability
        yield from _badges(item.children, capability)


def visible_badges(permissions: PermissionsSpec, roles: frozenset[str]) -> set[str]:
    return {
        badge
        for badge, capability in _badges(permissions.menu, None)
        if capability is None or roles & permissions.capabilities.get(capability, {}).keys()
    }


def check_counter_registry(permissions: PermissionsSpec, providers: Mapping[str, CounterProvider]) -> None:
    known = {badge for badge, _ in _badges(permissions.menu, None)}
    unknown = sorted(set(providers) - known)
    if unknown:
        raise SpecError(
            f"{PERMISSIONS_FILE}: counters registered for badges not in the menu: {', '.join(unknown)}"
        )


def compute_counters(
    session: Session, actor: Actor, permissions: PermissionsSpec, providers: Mapping[str, CounterProvider]
) -> dict[str, int]:
    visible = visible_badges(permissions, actor.roles)
    return {key: provider(session, actor) for key, provider in providers.items() if key in visible}
