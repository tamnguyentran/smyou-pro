"""M1-04a pure rules: temporary passwords (Q33), employee codes (Q32), phone normalisation."""

import pytest

from app.modules.employees.domain import (
    TEMP_PASSWORD_ALPHABET,
    employee_code,
    last_code_number,
    normalize_phone,
    temporary_password,
)
from app.modules.identity.domain import password_problems


@pytest.mark.ac("AC-EMP-003")
def test_temporary_password_is_readable_random_and_passes_the_password_rules() -> None:
    seen = set()
    for _ in range(200):
        password = temporary_password("hoa.le@smyou.vn")
        assert len(password) == 10
        assert set(password) <= set(TEMP_PASSWORD_ALPHABET)
        assert password_problems(password, current_password="", email="hoa.le@smyou.vn") == []
        seen.add(password)
    assert len(seen) == 200
    assert not set("0O1lI") & set(TEMP_PASSWORD_ALPHABET)


@pytest.mark.ac("AC-EMP-003")
def test_employee_codes_continue_after_the_largest_existing_one() -> None:
    assert last_code_number(["NV001", "NV014", "NV002", "E2E09", "NVX", "nv020"]) == 14
    assert last_code_number([]) == 0
    assert employee_code(15) == "NV015"
    assert employee_code(1234) == "NV1234"


@pytest.mark.ac("AC-EMP-004")
@pytest.mark.parametrize(
    ("raw", "normalized"),
    [("0932 06 8787", "0932068787"), ("0932.068.787", "0932068787"), ("", None), ("  ", None)],
)
def test_phone_keeps_digits_only(raw: str, normalized: str | None) -> None:
    assert normalize_phone(raw) == normalized
