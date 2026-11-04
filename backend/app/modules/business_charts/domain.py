"""Pure rules for "Biểu đồ kinh doanh" (M23a)."""

from decimal import ROUND_HALF_UP, Decimal

FALLBACK_COST_RATIO = Decimal("0.7")  # Q158: giá vốn trống → 70% giá bán
MAX_MONTHS = 24


def fallback_unit_cost(unit_price: int) -> int:
    return int((Decimal(unit_price) * FALLBACK_COST_RATIO).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def line_profit(
    *, line_total: int, cost_price_snapshot: int | None, unit_price: int, quantity: Decimal
) -> int:
    """Same formula/rounding as M16-05 `_line_profit`, but a missing cost snapshot falls back to
    70% of `unit_price`
    (computed at read time only — order lines are never rewritten, Q165)."""
    cost = cost_price_snapshot if cost_price_snapshot is not None else fallback_unit_cost(unit_price)
    return int((Decimal(line_total) - Decimal(cost) * quantity).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def pareto(values: list[tuple[str, str, int]]) -> list[dict[str, object]]:
    """`(key, label, value)` → Pareto rows: only value > 0, sorted desc; `is_vital` up to and
    including the first item whose cumulative share reaches 80% (Q169)."""
    items = sorted((v for v in values if v[2] > 0), key=lambda v: (-v[2], v[1]))
    total = sum(v[2] for v in items)
    rows: list[dict[str, object]] = []
    running = 0
    vital = True
    for key, label, value in items:
        running += value
        pct = float(
            (Decimal(running) * 100 / Decimal(total)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        )
        rows.append({"key": key, "label": label, "value": value, "cumulative_pct": pct, "is_vital": vital})
        if pct >= 80:
            vital = False
    return rows
