#!/usr/bin/env python3
"""Fail if frontend components use raw hex colors instead of design tokens (UI_GUIDELINES §2).

Allowed: the token definitions in frontend/src/styles/index.css.
Blocked: Tailwind arbitrary values like bg-[#0F2F2E] and inline hex in .ts/.tsx.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "frontend" / "src"
PATTERN = re.compile(r"\[#[0-9a-fA-F]{3,8}\]|['\"`]#[0-9a-fA-F]{3,8}['\"`]")


def main():
    if not ROOT.is_dir():
        return 0
    hits = []
    for path in list(ROOT.rglob("*.tsx")) + list(ROOT.rglob("*.ts")):
        for no, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if PATTERN.search(line):
                hits.append(f"{path.relative_to(ROOT.parent.parent)}:{no}: {line.strip()}")
    for hit in hits:
        print(f"RAW COLOR (use a token from styles/index.css): {hit}")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
