"""Pure employee rules. No framework imports."""

TEMP_PASSWORD_ALPHABET = ""


def temporary_password(email: str) -> str:
    raise NotImplementedError


def last_code_number(codes: list[str]) -> int:
    raise NotImplementedError


def employee_code(number: int) -> str:
    raise NotImplementedError


def normalize_phone(raw: str) -> str | None:
    raise NotImplementedError
