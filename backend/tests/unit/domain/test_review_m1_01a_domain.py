"""Review M1-01a (mutation testing): exact length boundaries of the password rule (Q21)."""

import pytest

from app.modules.identity.domain import password_problems


@pytest.mark.ac("AC-AUTH-017")
@pytest.mark.parametrize(("length", "ok"), [(8, True), (7, False), (128, True), (129, False)])
def test_length_boundaries(length: int, ok: bool) -> None:
    problems = password_problems("z" * length, current_password="TamThoi#14", email="khoa.tran@smyou.vn")
    assert (problems == []) is ok
