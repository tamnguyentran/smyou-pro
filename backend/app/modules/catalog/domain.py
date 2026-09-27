"""Pure product rules (DOMAIN_MODEL §2). No framework imports."""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation


def vat_rate_problem(value: Decimal) -> str | None:
    """None if `value` is a valid VAT rate (0-100, <= 2 decimal places); else a Vietnamese error."""
    if value < 0 or value > 100:
        return "VAT phải trong khoảng 0-100."
    try:
        quantized = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return "VAT không hợp lệ."
    if quantized != value:
        return "VAT tối đa 2 chữ số thập phân."
    return None
