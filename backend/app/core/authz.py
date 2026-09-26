"""Authorization dependencies (ARCHITECTURE §6). Capabilities come from spec/permissions.yaml.

`require(capability)` marks a route with the capability it needs. Until authentication exists
(M1-01/M1-02) it fails closed: every protected route answers 401.
"""

from collections.abc import Callable

from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute

from app.core.errors import AppError
from app.core.spec_loader import PermissionsSpec

CAPABILITY_ATTR = "__capability__"


def require(capability: str) -> Callable[[], None]:
    def dependency() -> None:
        raise AppError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.")

    setattr(dependency, CAPABILITY_ATTR, capability)
    return dependency


def _declared(dependant: Dependant) -> list[str]:
    found: list[str] = []
    for dep in dependant.dependencies:
        capability = getattr(dep.call, CAPABILITY_ATTR, None)
        if isinstance(capability, str):
            found.append(capability)
        found.extend(_declared(dep))
    return found


def undeclared_routes(app: FastAPI, permissions: PermissionsSpec) -> list[str]:
    """Routes that are neither public nor guarded by exactly one known capability."""
    public = set(permissions.public_routes)
    problems: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        capabilities = _declared(route.dependant)
        for method in sorted(route.methods or ()):
            key = f"{method} {route.path}"
            if key in public:
                if capabilities:
                    problems.append(f"{key}: listed in public_routes but also requires {capabilities}")
            elif not capabilities:
                problems.append(f"{key}: declares no capability and is not in public_routes")
            elif len(capabilities) > 1:
                problems.append(
                    f"{key}: declares {len(capabilities)} capabilities {capabilities}; exactly one"
                )
            elif capabilities[0] not in permissions.capabilities:
                problems.append(f"{key}: unknown capability {capabilities[0]!r}")
    return problems
