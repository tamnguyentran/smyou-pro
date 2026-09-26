"""Authorization dependencies (ARCHITECTURE §6). Capabilities come from spec/permissions.yaml.

`require(capability)` marks a route with the capability it needs. Until authentication exists
(M1-01/M1-02) it fails closed: every protected route answers 401.
"""

from collections.abc import Callable

from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, iter_route_contexts

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
    # FastAPI's own docs/OpenAPI routes (disabled in production) are the only non-API routes allowed.
    framework = {app.openapi_url, app.docs_url, app.redoc_url, app.swagger_ui_oauth2_redirect_url} - {None}
    # Walk effective routes: included routers are flattened with their prefix and router-level dependencies.
    for route in iter_route_contexts(app.routes):
        if not isinstance(route.original_route, APIRoute):
            path = route.path or repr(route.original_route)
            if path not in framework:
                kind = type(route.original_route).__name__
                problems.append(f"{path}: {kind} cannot declare a capability; use an APIRoute with require()")
            continue
        dependant = route.dependant
        capabilities = _declared(dependant) if isinstance(dependant, Dependant) else []
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
