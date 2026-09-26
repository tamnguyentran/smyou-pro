"""Authorization dependencies (ARCHITECTURE §6). Capabilities come from spec/permissions.yaml.

`require(capability)` authenticates the caller through `app.state.authenticator` (set by the
composition root, so `app.core` never imports feature modules) and checks that one of the caller's
roles holds the capability. Data scope (own/assigned/self) is applied by queries (M1-02).
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import FastAPI, Request
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, iter_route_contexts
from sqlalchemy.orm import Session
from starlette.routing import Route

from app.core.db import DbSession
from app.core.errors import AppError
from app.core.spec_loader import PermissionsSpec, Specs

CAPABILITY_ATTR = "__capability__"


@dataclass(frozen=True)
class Actor:
    id: uuid.UUID
    roles: frozenset[str]
    must_change_password: bool


Authenticator = Callable[[Request, Session], Actor | None]


def require(capability: str, *, allow_pending_password_change: bool = False) -> Callable[..., Actor]:
    def dependency(request: Request, session: DbSession) -> Actor:
        authenticate: Authenticator | None = getattr(request.app.state, "authenticator", None)
        actor = authenticate(request, session) if authenticate is not None else None
        if actor is None:
            raise AppError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.")
        if actor.must_change_password and not allow_pending_password_change:
            raise AppError(403, "PASSWORD_CHANGE_REQUIRED", "Bạn cần đổi mật khẩu trước khi tiếp tục.")
        specs: Specs = request.app.state.specs
        grants = specs.permissions.capabilities.get(capability, {})
        if not actor.roles & grants.keys():
            raise AppError(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.")
        return actor

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
    framework = {app.openapi_url, app.docs_url, app.redoc_url} - {None}
    if app.docs_url and app.swagger_ui_oauth2_redirect_url:
        framework.add(app.swagger_ui_oauth2_redirect_url)
    # Walk effective routes: included routers are flattened with their prefix and router-level dependencies.
    for route in iter_route_contexts(app.routes):
        if not isinstance(route.original_route, APIRoute):
            path = route.path or repr(route.original_route)
            original = route.original_route
            is_docs = type(original) is Route and set(original.methods or ()) <= {"GET", "HEAD"}
            if not (is_docs and path in framework):
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
