import pytest

from app.modules.dashboard.cards import _cell


@pytest.mark.ac("AC-DASH-075")
@pytest.mark.parametrize("value", ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\t=1", "\r=1"])
def test_formula_prefixes_are_neutralized(value: str) -> None:
    assert _cell(value) == f"'{value}"


@pytest.mark.ac("AC-DASH-075")
def test_plain_values_untouched() -> None:
    assert _cell("Nguyễn Văn A") == "Nguyễn Văn A"
    assert _cell(None) == ""
