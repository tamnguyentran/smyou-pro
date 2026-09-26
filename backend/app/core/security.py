"""Password hashing (argon2id) and session tokens. Never log what passes through here."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import PwdlibError

_HASHER = PasswordHash.recommended()  # argon2id
# Verified against when the account does not exist, so response time does not reveal valid emails.
_DUMMY_HASH = _HASHER.hash("smyou-dummy-password-for-constant-time")
_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _HASHER.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _HASHER.verify(password, password_hash)
    except PwdlibError:
        return False


def verify_dummy(password: str) -> None:
    _HASHER.verify(password, _DUMMY_HASH)


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def password_stamp(changed_at: datetime) -> int:
    """Microseconds since epoch of the last password change; tokens issued before a change stop working."""
    return int(changed_at.timestamp() * 1_000_000)


@dataclass(frozen=True)
class AccessClaims:
    employee_id: uuid.UUID
    session_family: uuid.UUID
    password_stamp: int


def encode_access_token(claims: AccessClaims, *, secret: str, now: datetime, ttl: timedelta) -> str:
    payload = {
        "sub": str(claims.employee_id),
        "sid": str(claims.session_family),
        "pwd": claims.password_stamp,
        "iat": int(now.timestamp()),
        "jti": uuid.uuid4().hex,  # every token is unique, even when issued in the same second
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=_ALGORITHM)


def decode_access_token(token: str, *, secret: str, now: datetime) -> AccessClaims | None:
    """Valid, unexpired token → claims; anything else → None. Expiry is checked against the injected clock."""
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[_ALGORITHM],
            options={"verify_exp": False, "require": ["sub", "sid", "pwd", "exp"]},
        )
        if int(payload["exp"]) <= now.timestamp():
            return None
        return AccessClaims(uuid.UUID(payload["sub"]), uuid.UUID(payload["sid"]), int(payload["pwd"]))
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        return None
