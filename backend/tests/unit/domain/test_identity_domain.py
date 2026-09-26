"""M1-01a: pure rules — password policy (Q21) and lock-out (Q19)."""

from datetime import UTC, datetime, timedelta

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.modules.identity.domain import is_locked, password_problems, register_failure

NOW = datetime(2026, 9, 26, 2, 0, tzinfo=UTC)


@pytest.mark.ac("AC-AUTH-017")
@pytest.mark.parametrize(
    ("new", "expected"),
    [
        ("Khoa@SmYou9", []),
        ("12345678", []),
        ("1234567", ["Mật khẩu cần ít nhất 8 ký tự."]),
        ("x" * 129, ["Mật khẩu tối đa 128 ký tự."]),
        ("TamThoi#14", ["Mật khẩu mới phải khác mật khẩu hiện tại."]),
        ("my-KHOA.TRAN-pw", ["Mật khẩu không được chứa tên email."]),
    ],
)
def test_password_problems(new: str, expected: list[str]) -> None:
    problems = password_problems(new, current_password="TamThoi#14", email="khoa.tran@smyou.vn")
    assert [message for _, message in problems] == expected
    assert all(field == "new_password" for field, _ in problems)


@pytest.mark.ac("AC-AUTH-004")
@given(st.integers(min_value=0, max_value=3))
def test_fewer_than_five_failures_do_not_lock(previous: int) -> None:
    count, locked_until = register_failure(previous, NOW, max_failed=5, lock_minutes=15)
    assert count == previous + 1
    assert locked_until is None


@pytest.mark.ac("AC-AUTH-004")
def test_fifth_failure_locks_and_resets_the_counter() -> None:
    assert register_failure(4, NOW, max_failed=5, lock_minutes=15) == (0, NOW + timedelta(minutes=15))


@pytest.mark.ac("AC-AUTH-004")
def test_is_locked_boundaries() -> None:
    until = NOW + timedelta(minutes=15)
    assert is_locked(until, NOW)
    assert is_locked(until, until - timedelta(microseconds=1))
    assert not is_locked(until, until)
    assert not is_locked(None, NOW)
