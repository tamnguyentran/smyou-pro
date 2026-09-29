"""M3-02a pure pricing rules (DOMAIN_MODEL "Quy tắc tính tiền")."""

from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.modules.orders.domain import order_code, price_line, sum_order

quantities = st.decimals(min_value="0.01", max_value="10000", places=2)
unit_prices = st.integers(min_value=0, max_value=10**11)
vat_rates = st.decimals(min_value="0", max_value="100", places=2)
discount_ratios = st.floats(min_value=0, max_value=1, allow_nan=False, allow_infinity=False)


@given(quantity=quantities, unit_price=unit_prices, vat_rate=vat_rates, discount_ratio=discount_ratios)
@pytest.mark.ac("AC-ORD-021")
def test_price_line_and_sum_order_invariants(
    quantity: Decimal, unit_price: int, vat_rate: Decimal, discount_ratio: float
) -> None:
    # Derive a valid discount (0 ≤ line_discount ≤ line_gross) from the function's own rounding,
    # rather than approximating line_gross independently (that could disagree by 1 at .5 boundaries).
    zero_discount = price_line(quantity, unit_price, vat_rate, 0)
    line_discount = int(zero_discount.line_gross * discount_ratio)

    totals = price_line(quantity, unit_price, vat_rate, line_discount)

    assert totals.line_gross == zero_discount.line_gross
    assert 0 <= totals.line_discount <= totals.line_gross
    assert totals.line_vat >= 0
    assert totals.line_total == totals.line_gross - totals.line_discount + totals.line_vat

    order_totals = sum_order([totals, totals])
    assert order_totals.subtotal == 2 * totals.line_gross
    assert order_totals.discount_amount == 2 * totals.line_discount
    assert order_totals.vat_amount == 2 * totals.line_vat
    assert order_totals.total == 2 * totals.line_total


@pytest.mark.ac("AC-ORD-022")
def test_round_half_up_boundary() -> None:
    totals = price_line(Decimal("1"), 125, Decimal("10"), 0)

    assert totals.line_vat == 13  # 125 x 10% = 12.5 → làm tròn nửa lên, không phải làm tròn ngân hàng
    assert totals.line_gross == 125
    assert totals.line_total == 138


def test_order_code_format() -> None:
    assert order_code("2609", 35) == "DH2609-0035"
    assert order_code("2609", 4) == "DH2609-0004"
