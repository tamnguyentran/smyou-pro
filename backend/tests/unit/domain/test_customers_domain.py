"""M3-01 pure rules: customer codes (KH + 5 digits, Q51)."""

import pytest

from app.modules.customers.domain import customer_code, last_code_number


@pytest.mark.ac("AC-CUS-003")
def test_customer_codes_continue_after_the_largest_existing_one() -> None:
    assert last_code_number(["KH00001", "KH00003", "KH00002", "E2E09", "KHX", "kh00020"]) == 3
    assert last_code_number([]) == 0
    assert customer_code(4) == "KH00004"
    assert customer_code(123456) == "KH123456"
