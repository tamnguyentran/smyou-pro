"""Pure identity rules: password policy (Q21) and login lock-out (Q19). No framework imports."""

from datetime import datetime, timedelta

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def password_problems(new_password: str, *, current_password: str, email: str) -> list[tuple[str, str]]:
    """(field, Vietnamese message) for every rule the new password breaks; empty when acceptable."""
    problems: list[str] = []
    if len(new_password) < MIN_PASSWORD_LENGTH:
        problems.append(f"Mật khẩu cần ít nhất {MIN_PASSWORD_LENGTH} ký tự.")
    if len(new_password) > MAX_PASSWORD_LENGTH:
        problems.append(f"Mật khẩu tối đa {MAX_PASSWORD_LENGTH} ký tự.")
    if new_password == current_password:
        problems.append("Mật khẩu mới phải khác mật khẩu hiện tại.")
    email_name = email.strip().split("@", 1)[0].lower()
    if email_name and email_name in new_password.lower():
        problems.append("Mật khẩu không được chứa tên email.")
    return [("new_password", message) for message in problems]


def register_failure(
    failed_count: int, now: datetime, *, max_failed: int, lock_minutes: int
) -> tuple[int, datetime | None]:
    """New failure count and lock expiry after one more wrong password. Locking resets the count."""
    count = failed_count + 1
    if count >= max_failed:
        return 0, now + timedelta(minutes=lock_minutes)
    return count, None


def is_locked(locked_until: datetime | None, now: datetime) -> bool:
    return locked_until is not None and now < locked_until
