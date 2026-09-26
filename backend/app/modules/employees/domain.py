"""Pure employee rules (Q32, Q33). No framework imports."""

import re
import secrets
import string

from app.modules.identity.domain import password_problems

# No look-alikes (0/O, 1/l/I): the Manager reads the password out or retypes it for the employee.
TEMP_PASSWORD_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lIoi")
TEMP_PASSWORD_LENGTH = 10
CODE_PREFIX = "NV"
_CODE = re.compile(rf"{CODE_PREFIX}(\d+)")


def temporary_password(email: str) -> str:
    """Random one-time password that already satisfies the password rules (Q21)."""
    while True:
        password = "".join(secrets.choice(TEMP_PASSWORD_ALPHABET) for _ in range(TEMP_PASSWORD_LENGTH))
        if not password_problems(password, current_password="", email=email):
            return password


def last_code_number(codes: list[str]) -> int:
    """Largest N among existing `NV<N>` codes (others, e.g. test accounts, are ignored)."""
    numbers = [int(m.group(1)) for code in codes if (m := _CODE.fullmatch(code))]
    return max(numbers, default=0)


def employee_code(number: int) -> str:
    return f"{CODE_PREFIX}{number:03d}"


def normalize_phone(raw: str) -> str | None:
    """Keep digits only ("0932 06 8787" → "0932068787"); blank → None."""
    digits = re.sub(r"\D", "", raw)
    return digits or None
