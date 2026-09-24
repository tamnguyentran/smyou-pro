#!/usr/bin/env python3
"""Acceptance-criteria traceability: every AC in an Approved/Done spec must be referenced by ≥1 test.

Specs:  docs/specs/*.md  (status line: "- **Status:** Approved")
Tests:  backend/tests/**, frontend/src/**/*.test.ts(x), frontend/e2e/**  — any occurrence of the AC ID counts
        (pytest: @pytest.mark.ac("AC-ORD-001"); JS: test("AC-ORD-001 ...")).
Output: reports/ac-matrix.md; exit 1 if an enforced AC has no test, or a test references an unknown AC.

Usage: python3 scripts/check_ac_coverage.py [--spec M3-02]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPECS = ROOT / "docs" / "specs"
REPORT = ROOT / "reports" / "ac-matrix.md"
AC_RE = re.compile(r"\bAC-[A-Z]{2,5}-\d{3}\b")
STATUS_RE = re.compile(r"\*\*Status:\*\*\s*([A-Za-z]+)")
ENFORCED = {"approved", "done"}
TEST_GLOBS = [
    ("backend/tests", "**/*.py"),
    ("frontend/src", "**/*.test.ts"),
    ("frontend/src", "**/*.test.tsx"),
    ("frontend/e2e", "**/*.ts"),
]


def load_specs(only):
    specs = {}
    for path in sorted(SPECS.glob("*.md")):
        if path.name.startswith("_"):
            continue
        spec_id = path.stem.split("-", 2)
        spec_id = "-".join(spec_id[:2]) if len(spec_id) >= 2 else path.stem
        if only and spec_id != only:
            continue
        text = path.read_text(encoding="utf-8")
        match = STATUS_RE.search(text)
        status = match.group(1).lower() if match else "draft"
        # Struck-through ACs (~~AC-XXX-001~~) are retired and not enforced.
        retired = set(re.findall(r"~~\s*(AC-[A-Z]{2,5}-\d{3})", text))
        acs = [ac for ac in dict.fromkeys(AC_RE.findall(text)) if ac not in retired]
        specs[path.name] = {"id": spec_id, "status": status, "acs": acs}
    return specs


def scan_tests():
    refs = {}
    for base, pattern in TEST_GLOBS:
        root = ROOT / base
        if not root.is_dir():
            continue
        for path in root.glob(pattern):
            if "node_modules" in path.parts:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for ac in set(AC_RE.findall(text)):
                refs.setdefault(ac, []).append(str(path.relative_to(ROOT)))
    return refs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", help="only check one backlog ID, e.g. M3-02")
    args = parser.parse_args()

    specs = load_specs(args.spec)
    refs = scan_tests()
    all_known = {ac for s in load_specs(None).values() for ac in s["acs"]}

    lines = ["# AC → Test matrix", "", "| Spec | Status | AC | Tests |", "|---|---|---|---|"]
    missing = []
    for name, spec in specs.items():
        for ac in spec["acs"]:
            tests = sorted(set(refs.get(ac, [])))
            enforced = spec["status"] in ENFORCED
            if not tests and enforced:
                missing.append(f"{ac} ({name})")
            mark = "<br>".join(tests) if tests else ("❌ missing" if enforced else "— (draft)")
            lines.append(f"| {spec['id']} | {spec['status']} | {ac} | {mark} |")

    unknown = sorted(ac for ac in refs if ac not in all_known)
    if unknown:
        lines += ["", "## Tests referencing unknown AC IDs", *[f"- {ac}: {', '.join(refs[ac])}" for ac in unknown]]

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    total = sum(len(s["acs"]) for s in specs.values() if s["status"] in ENFORCED)
    print(f"AC traceability: {total - len(missing)}/{total} enforced ACs covered → {REPORT.relative_to(ROOT)}")
    for item in missing:
        print(f"  MISSING TEST: {item}")
    for ac in unknown:
        print(f"  UNKNOWN AC referenced by tests: {ac}")
    return 1 if missing or unknown else 0


if __name__ == "__main__":
    sys.exit(main())
