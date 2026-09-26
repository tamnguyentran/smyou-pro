"""Pure identity rules. Stub (M1-01a red phase)."""

from datetime import datetime


def password_problems(new_password: str, *, current_password: str, email: str) -> list[tuple[str, str]]:
    raise NotImplementedError


def register_failure(
    failed_count: int, now: datetime, *, max_failed: int, lock_minutes: int
) -> tuple[int, datetime | None]:
    raise NotImplementedError


def is_locked(locked_until: datetime | None, now: datetime) -> bool:
    raise NotImplementedError
