"""M23a: lợi nhuận dòng khi thiếu giá vốn → 70% giá bán, làm tròn số nguyên VND (Q158, Q165)."""

from decimal import Decimal

import pytest

from app.modules.business_charts.domain import fallback_unit_cost, line_profit


@pytest.mark.ac("AC-RPT-101")
def test_missing_cost_uses_seventy_percent_of_unit_price_rounded_half_up() -> None:
    assert fallback_unit_cost(333_333) == 233_333  # 233_333,1
    assert fallback_unit_cost(5) == 4  # 3,5 → half-up
    assert fallback_unit_cost(0) == 0


@pytest.mark.ac("AC-RPT-101")
def test_line_profit_with_and_without_cost_snapshot() -> None:
    profit = line_profit(
        line_total=999_999, cost_price_snapshot=None, unit_price=333_333, quantity=Decimal("3")
    )
    assert profit == 999_999 - 699_999
    assert isinstance(profit, int)
    assert (
        line_profit(
            line_total=7_000_000, cost_price_snapshot=2_800_000, unit_price=3_500_000, quantity=Decimal("2")
        )
        == 1_400_000
    )
    # same rounding as M16-05 `_line_profit`: 1000 - 333 x 1,5 = 500,5 → 501 (half-up, once per line)
    assert (
        line_profit(line_total=1_000, cost_price_snapshot=333, unit_price=400, quantity=Decimal("1.5")) == 501
    )
