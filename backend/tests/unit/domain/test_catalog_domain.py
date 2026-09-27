"""M2-01a pure rules: VAT rate validation."""

from decimal import Decimal

import pytest

from app.modules.catalog.domain import vat_rate_problem


@pytest.mark.ac("AC-CAT-004")
@pytest.mark.parametrize("value", [Decimal("0"), Decimal("8"), Decimal("8.5"), Decimal("10"), Decimal("100")])
def test_valid_vat_rates(value: Decimal) -> None:
    assert vat_rate_problem(value) is None


@pytest.mark.ac("AC-CAT-004")
@pytest.mark.parametrize("value", [Decimal("-0.01"), Decimal("100.01"), Decimal("8.123"), None])
def test_invalid_vat_rates(value: Decimal | None) -> None:
    assert vat_rate_problem(value) is not None
