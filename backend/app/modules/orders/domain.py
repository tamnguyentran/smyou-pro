"""Pure order pricing + code rules (DOMAIN_MODEL §5/§6, "Quy tắc tính tiền"). No framework imports."""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class LineTotals:
    line_gross: int
    line_discount: int
    line_vat: int
    line_total: int


@dataclass(frozen=True)
class OrderTotals:
    subtotal: int
    discount_amount: int
    vat_amount: int
    total: int


def round_half_up(value: Decimal) -> int:
    raise NotImplementedError


def price_line(quantity: Decimal, unit_price: int, vat_rate: Decimal, line_discount: int) -> LineTotals:
    raise NotImplementedError


def sum_order(lines: Sequence[LineTotals]) -> OrderTotals:
    raise NotImplementedError


def order_code(period: str, number: int) -> str:
    raise NotImplementedError
