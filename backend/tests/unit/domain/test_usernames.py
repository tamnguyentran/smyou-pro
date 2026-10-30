"""M17-03b pure rules: usernames generated from the full name (AC-AUTH-064)."""

import pytest

from app.modules.identity.usernames import base_username, unique_username


@pytest.mark.ac("AC-AUTH-064")
@pytest.mark.parametrize(
    ("full_name", "username"),
    [
        ("Nguyễn Trần Tâm", "tam.nt"),
        ("Nguyễn Lê Kim Yến", "yen.nlk"),
        ("Đỗ Văn Đức", "duc.dv"),
        ("  Lê   Bình ", "binh.l"),
        ("Tâm", "tam"),
    ],
)
def test_base_username_from_full_name(full_name: str, username: str) -> None:
    assert base_username(full_name) == username


@pytest.mark.ac("AC-AUTH-064")
def test_non_letters_are_dropped() -> None:
    assert base_username("Trần-Văn (Tèo) 2") == "2.tt"


@pytest.mark.ac("AC-AUTH-064")
def test_duplicates_get_a_number_from_two() -> None:
    assert unique_username("tam.nt", set()) == "tam.nt"
    assert unique_username("tam.nt", {"tam.nt"}) == "tam.nt2"
    assert unique_username("tam.nt", {"tam.nt", "tam.nt2"}) == "tam.nt3"
    assert unique_username("tam.nt", {"TAM.NT"}) == "tam.nt2"  # citext: case-insensitive
