"""Authorization dependencies (ARCHITECTURE §6). Capabilities come from spec/permissions.yaml.

`require(capability)` authenticates the caller through `app.state.authenticator` (set by the
composition root, so `app.core` never imports feature modules) and checks that one of the caller's
roles holds the capability. The returned Actor carries the effective scopes, which read queries apply
through `apply_scope` (M1-02).
"""

import logging
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from typing import Any

from fastapi import FastAPI, Request
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, iter_route_contexts
from sqlalchemy import ColumnElement, Select, false, or_
from sqlalchemy.orm import Session
from starlette.routing import Route

from app.core.db import DbSession
from app.core.errors import AppError
from app.core.spec_loader import PermissionsSpec, Specs

CAPABILITY_ATTR = "__capability__"
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Actor:
    id: uuid.UUID
    roles: frozenset[str]
    must_change_password: bool
    # Refresh-token family of the request's session (None outside a cookie session).
    session_family: uuid.UUID | None = None
    # Set by require(): the capability checked and the caller's effective scopes for it.
    capability: str | None = None
    scopes: tuple[str, ...] = ()


Authenticator = Callable[[Request, Session], Actor | None]
ScopeRules = Mapping[str, Callable[[Actor], ColumnElement[bool]]]


def effective_scopes(permissions: PermissionsSpec, roles: frozenset[str], capability: str) -> tuple[str, ...]:
    """Union of the scopes the caller's roles grant for `capability` (YAML order); `all` absorbs the rest."""
    granted = {scope for role, scope in permissions.capabilities.get(capability, {}).items() if role in roles}
    if "all" in granted:
        return ("all",)
    return tuple(scope for scope in permissions.scopes if scope in granted)


def apply_scope[S: Select[Any]](stmt: S, actor: Actor, rules: ScopeRules) -> S:
    """Restrict a read query to the rows the actor may see. Fails closed: no usable rule → no rows."""
    if "all" in actor.scopes:
        return stmt
    conditions = []
    for scope in actor.scopes:
        rule = rules.get(scope)
        if rule is None:
            logger.warning(
                "capability %s: scope %r has no rule for this query; ignored", actor.capability, scope
            )
            continue
        conditions.append(rule(actor))
    return stmt.where(or_(*conditions) if conditions else false())


def get_in_scope_or_404(session: Session, stmt: Select[Any], actor: Actor, rules: ScopeRules) -> Any:
    """One row within the actor's scope; out of scope looks exactly like missing (PERMISSIONS rule 4)."""
    row = session.scalars(apply_scope(stmt, actor, rules)).one_or_none()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.")
    return row


def require(capability: str, *, allow_pending_password_change: bool = False) -> Callable[..., Actor]:
    def dependency(request: Request, session: DbSession) -> Actor:
        authenticate: Authenticator | None = getattr(request.app.state, "authenticator", None)
        actor = authenticate(request, session) if authenticate is not None else None
        if actor is None:
            raise AppError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.")
        if actor.must_change_password and not allow_pending_password_change:
            raise AppError(403, "PASSWORD_CHANGE_REQUIRED", "Bạn cần đổi mật khẩu trước khi tiếp tục.")
        specs: Specs = request.app.state.specs
        scopes = effective_scopes(specs.permissions, actor.roles, capability)
        if not scopes:
            raise AppError(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.")
        return replace(actor, capability=capability, scopes=scopes)

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


def declared_routes(app: FastAPI) -> list[tuple[str, str, str]]:
    """(method, path, capability) of every API route guarded by exactly one require()."""
    found: list[tuple[str, str, str]] = []
    for route in iter_route_contexts(app.routes):
        dependant = route.dependant if isinstance(route.original_route, APIRoute) else None
        capabilities = _declared(dependant) if isinstance(dependant, Dependant) else []
        if len(capabilities) == 1 and route.path:
            found.extend((method, route.path, capabilities[0]) for method in sorted(route.methods or ()))
    return found
