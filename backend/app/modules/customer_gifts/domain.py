"""Pure customer-gift rules (DOMAIN_MODEL §14). No framework imports."""


def total_amount(*, quantity: int, unit_price: int, other_cost: int) -> int:
    """Thành tiền — server always computes this, never trusts a client-sent value (§2)."""
    return quantity * unit_price + other_cost
