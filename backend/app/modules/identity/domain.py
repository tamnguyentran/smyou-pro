"""Pure identity rules: password policy (Q21) and login lock-out (Q19). No framework imports."""

from datetime import date, datetime, timedelta

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def birth_date_password(birth_date: date) -> str:
    """M17-03b (Q108): the temporary password for an employee with a birth date — `ddmmyyyy`."""
    return birth_date.strftime("%d%m%Y")


def password_problems(
    new_password: str, *, current_password: str | None, email: str | None, birth_date: date | None = None
) -> list[tuple[str, str]]:
    """(field, Vietnamese message) for every rule the new password breaks; empty when acceptable.

    `current_password` is the plaintext of the account's current password, when known (change-password);
    pass `None` to skip the equality check (reset-password checks it separately, against the hash)."""
    problems: list[str] = []
    if len(new_password) < MIN_PASSWORD_LENGTH:
        problems.append(f"Mật khẩu cần ít nhất {MIN_PASSWORD_LENGTH} ký tự.")
    if len(new_password) > MAX_PASSWORD_LENGTH:
        problems.append(f"Mật khẩu tối đa {MAX_PASSWORD_LENGTH} ký tự.")
    if current_password is not None and new_password == current_password:
        problems.append("Mật khẩu mới phải khác mật khẩu hiện tại.")
    email_name = (email or "").strip().split("@", 1)[0].lower()
    if email_name and email_name in new_password.lower():
        problems.append("Mật khẩu không được chứa tên email.")
    if birth_date is not None and new_password == birth_date_password(birth_date):
        problems.append("Mật khẩu mới không được trùng ngày sinh.")
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
