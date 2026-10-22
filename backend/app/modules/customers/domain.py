"""Pure customer rules (DOMAIN_MODEL §4, Q51). No framework imports."""

import re
from collections.abc import Mapping
from typing import Any

CODE_PREFIX = "KH"
_CODE = re.compile(rf"{CODE_PREFIX}(\d+)")

# M15-05: trường mở rộng chỉ hợp lệ với đúng `type` của khách hàng.
COMPANY_FIELDS = ("founded_date", "director_name", "it_contact_name", "it_contact_phone", "it_contact_email")
INDIVIDUAL_FIELDS = ("date_of_birth", "gender", "occupation")


def mismatched_fields(customer_type: str, body: Mapping[str, Any]) -> list[str]:
    """Trường thuộc nhóm khác `customer_type`, có mặt (không None) trong `body` (§2)."""
    other_group = INDIVIDUAL_FIELDS if customer_type == "COMPANY" else COMPANY_FIELDS
    return [field for field in other_group if body.get(field) is not None]


def last_code_number(codes: list[str]) -> int:
    """Largest N among existing `KH<N>` codes (others, e.g. test accounts, are ignored)."""
    numbers = [int(m.group(1)) for code in codes if (m := _CODE.fullmatch(code))]
    return max(numbers, default=0)


def customer_code(number: int) -> str:
    return f"{CODE_PREFIX}{number:05d}"
