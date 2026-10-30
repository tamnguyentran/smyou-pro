"""M17-04: invoice slip number `NN-XBHddmmyyyy` (AC-ORD-217)."""

from datetime import date

import pytest

from app.modules.orders.domain import invoice_slip_no


@pytest.mark.ac("AC-ORD-217")
@pytest.mark.parametrize(
    ("seq", "printed_on", "expected"),
    [
        (24, date(2026, 9, 24), "24-XBH24092026"),
        (1, date(2026, 9, 24), "01-XBH24092026"),
        (9, date(2026, 1, 5), "09-XBH05012026"),
        (99, date(2026, 12, 31), "99-XBH31122026"),
        (100, date(2026, 9, 24), "100-XBH24092026"),
        (1234, date(2026, 9, 24), "1234-XBH24092026"),
    ],
)
def test_slip_no_format(seq: int, printed_on: date, expected: str) -> None:
    assert invoice_slip_no(seq, printed_on) == expected
