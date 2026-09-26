"""Authentication use cases. Callers own the transaction; these functions never commit.

Security events are logged by employee id only — never email, password or token (Q23).
"""

import logging
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from fastapi import Request
from sqlalchemy import ColumnElement, exists, select, update
from sqlalchemy.orm import Session

from app.core.authz import Actor, effective_scopes
from app.core.config import Settings
from app.core.counters import CounterProvider, compute_counters
from app.core.security import (
    AccessClaims,
    decode_access_token,
    encode_access_token,
    hash_password,
    new_opaque_token,
    password_stamp,
    sha256_hex,
    verify_dummy,
    verify_password,
)
from app.core.spec_loader import PermissionsSpec
from app.modules.identity.domain import is_locked, password_problems, register_failure
from app.modules.identity.models import AuthSession, Employee, EmployeeRole
from app.modules.identity.schemas import MeEmployee, MeResponse

logger = logging.getLogger(__name__)

ACCESS_COOKIE = "smyou_access"


class Failure(StrEnum):
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    ACCOUNT_DISABLED = "ACCOUNT_DISABLED"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    SESSION_REVOKED = "SESSION_REVOKED"
    DUPLICATE_EMAIL = "DUPLICATE_EMAIL"
    DUPLICATE_CODE = "DUPLICATE_CODE"


@dataclass(frozen=True)
class Issued:
    employee: Employee
    access_token: str
    refresh_token: str


def _issue(
    session: Session,
    employee: Employee,
    *,
    family_id: uuid.UUID,
    now: datetime,
    settings: Settings,
    user_agent: str,
) -> tuple[Issued, AuthSession]:
    raw = new_opaque_token()
    row = AuthSession(
        employee_id=employee.id,
        family_id=family_id,
        token_hash=sha256_hex(raw),
        password_changed_at=employee.password_changed_at,
        created_at=now,
        expires_at=now + timedelta(days=settings.refresh_token_days),
        user_agent=user_agent[:200] or None,
    )
    session.add(row)
    session.flush()
    claims = AccessClaims(employee.id, family_id, password_stamp(employee.password_changed_at))
    access = encode_access_token(
        claims, secret=settings.jwt_secret, now=now, ttl=timedelta(minutes=settings.access_token_minutes)
    )
    return Issued(employee, access, raw), row


def _revoke(session: Session, condition: ColumnElement[bool], *, now: datetime) -> None:
    session.execute(
        update(AuthSession).where(AuthSession.revoked_at.is_(None), condition).values(revoked_at=now)
    )


def _session_live(session: Session, family_id: uuid.UUID | None, now: datetime) -> bool:
    if family_id is None:
        return False
    return bool(
        session.scalar(
            select(
                exists().where(
                    AuthSession.family_id == family_id,
                    AuthSession.revoked_at.is_(None),
                    AuthSession.expires_at > now,
                )
            )
        )
    )


def login(
    session: Session, *, email: str, password: str, now: datetime, settings: Settings, user_agent: str
) -> Issued | Failure:
    employee = session.scalars(
        select(Employee).where(Employee.email == email).with_for_update()
    ).one_or_none()
    if employee is None:
        verify_dummy(password)
        logger.info("login failed: unknown account")
        return Failure.INVALID_CREDENTIALS
    if is_locked(employee.locked_until, now):
        logger.info("login refused: account %s is locked", employee.id)
        return Failure.ACCOUNT_LOCKED
    if not verify_password(password, employee.password_hash):
        employee.failed_login_count, locked_until = register_failure(
            employee.failed_login_count,
            now,
            max_failed=settings.login_max_failed,
            lock_minutes=settings.login_lock_minutes,
        )
        if locked_until is not None:
            employee.locked_until = locked_until
            logger.warning("account %s locked after repeated failed logins", employee.id)
        return Failure.INVALID_CREDENTIALS
    if not employee.is_active:
        logger.info("login refused: account %s is disabled", employee.id)
        return Failure.ACCOUNT_DISABLED
    employee.failed_login_count = 0
    employee.locked_until = None
    logger.info("login succeeded for %s", employee.id)
    issued, _ = _issue(
        session, employee, family_id=uuid.uuid4(), now=now, settings=settings, user_agent=user_agent
    )
    return issued


def refresh(
    session: Session, *, refresh_token: str | None, now: datetime, settings: Settings, user_agent: str
) -> Issued | Failure:
    if not refresh_token:
        return Failure.UNAUTHENTICATED
    token_hash = sha256_hex(refresh_token)
    owner = session.scalar(select(AuthSession.employee_id).where(AuthSession.token_hash == token_hash))
    if owner is None:
        return Failure.UNAUTHENTICATED
    # Lock order everywhere: the employee row, then its sessions (change_password does the same) —
    # the opposite order deadlocks against a concurrent password change.
    employee = session.get(Employee, owner, with_for_update=True, populate_existing=True)
    row = session.scalars(
        select(AuthSession).where(AuthSession.token_hash == token_hash).with_for_update()
    ).one_or_none()
    if row is None:
        return Failure.UNAUTHENTICATED
    if row.revoked_at is not None:
        _revoke(session, AuthSession.family_id == row.family_id, now=now)
        logger.warning("revoked refresh token reused; session family of %s revoked", row.employee_id)
        return Failure.SESSION_REVOKED
    if (
        row.expires_at <= now
        or employee is None
        or not employee.is_active
        or employee.password_changed_at != row.password_changed_at
    ):
        return Failure.UNAUTHENTICATED
    issued, new_row = _issue(
        session, employee, family_id=row.family_id, now=now, settings=settings, user_agent=user_agent
    )
    row.revoked_at = now
    row.replaced_by_id = new_row.id
    return issued


def logout(session: Session, *, refresh_token: str | None, now: datetime) -> None:
    if not refresh_token:
        return
    family = session.scalar(
        select(AuthSession.family_id).where(AuthSession.token_hash == sha256_hex(refresh_token))
    )
    if family is not None:
        _revoke(session, AuthSession.family_id == family, now=now)


def change_password(
    session: Session,
    actor: Actor,
    *,
    current_password: str,
    new_password: str,
    now: datetime,
    settings: Settings,
    user_agent: str,
) -> Issued | Failure | list[tuple[str, str]]:
    employee = session.get(Employee, actor.id, with_for_update=True, populate_existing=True)
    if employee is None or not _session_live(session, actor.session_family, now):
        # A concurrent request locked the account (and revoked every session) while this one waited.
        return Failure.UNAUTHENTICATED
    if not verify_password(current_password, employee.password_hash):
        # Same counter as login: a stolen session must not allow unlimited guessing (review M1-01a).
        employee.failed_login_count, locked_until = register_failure(
            employee.failed_login_count,
            now,
            max_failed=settings.login_max_failed,
            lock_minutes=settings.login_lock_minutes,
        )
        if locked_until is not None:
            employee.locked_until = locked_until
            _revoke(session, AuthSession.employee_id == employee.id, now=now)
            logger.warning("account %s locked after repeated wrong current passwords", employee.id)
            return Failure.ACCOUNT_LOCKED
        return [("current_password", "Mật khẩu hiện tại không đúng.")]
    problems = password_problems(new_password, current_password=current_password, email=employee.email)
    if problems:
        return problems
    employee.password_hash = hash_password(new_password)
    employee.must_change_password = False
    employee.password_changed_at = now
    employee.failed_login_count = 0
    employee.locked_until = None
    employee.version += 1
    _revoke(session, AuthSession.employee_id == employee.id, now=now)
    logger.info("password changed for %s; other sessions revoked", employee.id)
    issued, _ = _issue(
        session, employee, family_id=uuid.uuid4(), now=now, settings=settings, user_agent=user_agent
    )
    return issued


def create_manager(
    session: Session, *, email: str, full_name: str, code: str, password: str, now: datetime
) -> Employee | Failure:
    email, code, full_name = email.strip(), code.strip(), full_name.strip()
    if session.scalar(select(exists().where(Employee.email == email))):
        return Failure.DUPLICATE_EMAIL
    if session.scalar(select(exists().where(Employee.code == code))):
        return Failure.DUPLICATE_CODE
    employee = Employee(
        email=email,
        full_name=full_name,
        code=code,
        department="MANAGEMENT",
        password_hash=hash_password(password),
        must_change_password=False,
        password_changed_at=now,
        roles=[EmployeeRole(role="MANAGER")],
    )
    session.add(employee)
    session.flush()
    logger.info("manager %s created from the command line", employee.id)
    return employee


def authenticate(request: Request, session: Session) -> Actor | None:
    """app.state.authenticator: access cookie → Actor, or None when anything is off."""
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    settings: Settings = request.app.state.settings
    now: datetime = request.app.state.clock()
    claims = decode_access_token(token, secret=settings.jwt_secret, now=now)
    if claims is None:
        return None
    employee = session.get(Employee, claims.employee_id)
    if (
        employee is None
        or not employee.is_active
        or password_stamp(employee.password_changed_at) != claims.password_stamp
    ):
        return None
    if not _session_live(session, claims.session_family, now):
        return None
    return Actor(
        employee.id,
        frozenset(r.role for r in employee.roles),
        employee.must_change_password,
        claims.session_family,
    )


def me(
    session: Session, actor: Actor, permissions: PermissionsSpec, counters: Mapping[str, CounterProvider]
) -> MeResponse:
    employee = session.get_one(Employee, actor.id)
    capabilities = {
        capability: list(scopes)
        for capability in permissions.capabilities
        if (scopes := effective_scopes(permissions, actor.roles, capability))
    }
    return MeResponse(
        employee=MeEmployee(
            id=employee.id,
            code=employee.code,
            full_name=employee.full_name,
            email=employee.email,
            title=employee.title,
            department=employee.department,
        ),
        roles=[role for role in permissions.roles if role in actor.roles],
        capabilities=capabilities,
        counters=compute_counters(session, actor, permissions, counters),
    )
