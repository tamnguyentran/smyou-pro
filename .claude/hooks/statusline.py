#!/usr/bin/env python3
"""statusLine command: show per-turn token usage + session cost/context%,
with a visual warning once context usage crosses a threshold (so the
owner knows when to /clear instead of letting auto-compact do it).
Reads the statusline JSON on stdin; must never crash or block."""
import json
import sys

WARN_PCT = 50   # yellow: fine to keep going, plan to /clear soon
HOT_PCT = 80    # red: /clear now, before the next heavy step


def fmt_tokens(n: int) -> str:
    if n >= 1000:
        return f"{n / 1000:.1f}K"
    return str(n)


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        print("…")
        return 0

    model = (data.get("model") or {}).get("display_name", "Claude")
    cw = data.get("context_window") or {}
    cur = cw.get("current_usage") or {}
    cost = data.get("cost") or {}

    turn_in = cur.get("input_tokens") or 0
    turn_out = cur.get("output_tokens") or 0
    cache_read = cur.get("cache_read_input_tokens") or 0

    total_in = cw.get("total_input_tokens") or 0
    total_out = cw.get("total_output_tokens") or 0
    window_size = cw.get("context_window_size") or 200000
    used_pct = cw.get("used_percentage")
    if used_pct is None:
        used_pct = round((total_in + total_out) / window_size * 100, 1) if window_size else 0

    total_cost = cost.get("total_cost_usd") or 0.0

    if used_pct >= HOT_PCT:
        dot, warn = "\033[31m●\033[0m", " · \033[31m⚠ vượt 80% — /clear ngay\033[0m"
    elif used_pct >= WARN_PCT:
        dot, warn = "\033[33m●\033[0m", " · \033[33m⚠ vượt 50% — /clear sau việc này\033[0m"
    else:
        dot, warn = "\033[32m●\033[0m", ""

    turn = f"lượt +{fmt_tokens(turn_in)} in/+{fmt_tokens(turn_out)} out"
    if cache_read:
        turn += f" (cache {fmt_tokens(cache_read)})"
    session = f"phiên {fmt_tokens(total_in + total_out)}/{fmt_tokens(window_size)} ({used_pct:.0f}%)"

    print(f"{dot} {model} · {turn} · {session} · ${total_cost:.4f}{warn}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
