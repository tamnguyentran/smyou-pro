"""Pure order pricing + code rules (DOMAIN_MODEL §5/§6, "Quy tắc tính tiền"). No framework imports."""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.core.spec_loader import Machine, Transition


def find_transition(machine: Machine, command: str) -> Transition:
    for t in machine.transitions:
        if t.command == command:
            return t
    raise AssertionError(f"unknown order command: {command!r}")  # routes only ever pass known commands


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
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def price_line(quantity: Decimal, unit_price: int, vat_rate: Decimal, line_discount: int) -> LineTotals:
    line_gross = round_half_up(quantity * unit_price)
    line_vat = round_half_up((line_gross - line_discount) * vat_rate / 100)
    line_total = line_gross - line_discount + line_vat
    return LineTotals(line_gross, line_discount, line_vat, line_total)


def sum_order(lines: Sequence[LineTotals]) -> OrderTotals:
    return OrderTotals(
        subtotal=sum(line.line_gross for line in lines),
        discount_amount=sum(line.line_discount for line in lines),
        vat_amount=sum(line.line_vat for line in lines),
        total=sum(line.line_total for line in lines),
    )


def order_code(period: str, number: int) -> str:
    return f"DH{period}-{number:04d}"
