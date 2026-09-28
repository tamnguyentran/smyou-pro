"""Pure customer rules (DOMAIN_MODEL §4, Q51). No framework imports."""

import re

CODE_PREFIX = "KH"
_CODE = re.compile(rf"{CODE_PREFIX}(\d+)")


def last_code_number(codes: list[str]) -> int:
    """Largest N among existing `KH<N>` codes (others, e.g. test accounts, are ignored)."""
    numbers = [int(m.group(1)) for code in codes if (m := _CODE.fullmatch(code))]
    return max(numbers, default=0)


def customer_code(number: int) -> str:
    return f"{CODE_PREFIX}{number:05d}"
