"""Guard registry: YAML guard name → pure function. Stub (M0-04 red phase)."""

from collections.abc import Callable

GUARDS: dict[str, Callable[..., bool]] = {}
PENDING_GUARDS: dict[str, str] = {}
