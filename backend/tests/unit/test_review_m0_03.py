"""Review M0-03: dev stack must not keep a stale node_modules volume after dependencies change."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


def recipe(target: str) -> str:
    text = (ROOT / "Makefile").read_text(encoding="utf-8")
    match = re.search(rf"^{re.escape(target)}:.*\n((?:\t.*\n)+)", text, re.M)
    assert match, f"target {target} not found"
    return match.group(1)


@pytest.mark.ac("AC-SYS-004")
@pytest.mark.parametrize("target", ["up", "e2e"])
def test_dev_up_renews_anonymous_volumes(target: str) -> None:
    lines = [ln for ln in recipe(target).splitlines() if "up -d" in ln]
    assert lines, f"{target} does not start the stack"
    assert all("--renew-anon-volumes" in ln for ln in lines), lines
