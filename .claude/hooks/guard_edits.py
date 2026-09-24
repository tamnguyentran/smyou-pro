#!/usr/bin/env python3
"""PreToolUse guard for Edit/Write/MultiEdit.

Blocks (exit 2, reason fed back to Claude) when an edit *adds* a pattern that weakens
verification: skipped/focused tests, bare type/lint suppressions, coverage exclusions.
Also blocks writes to real .env files. Existing occurrences are not counted — only additions.
Any unexpected error exits 0 (fail open) so a broken guard never locks the session.
"""

from __future__ import annotations

import json
import os
import re
import sys

RULES = [
    (r"\bpytest\.mark\.(skip|skipif|xfail)\b|\bpytest\.(skip|xfail)\(", "skipped/xfail pytest test"),
    (r"\b(it|test|describe)\.(skip|only|todo|fixme)\(|\b(xit|xdescribe|fit|fdescribe)\(", "skipped/focused JS test"),
    (r"#\s*type:\s*ignore(?!\[[a-z-]+(,\s*[a-z-]+)*\]\s*#\s*\S)", "bare `# type: ignore` (use `# type: ignore[code]  # reason`)"),
    (r"#\s*noqa(?!:\s*[A-Z]+\d+[^\n]*#\s*\S)", "bare `# noqa` (use `# noqa: CODE  # reason`)"),
    (r"@ts-(ignore|nocheck)\b", "`@ts-ignore`/`@ts-nocheck` (use `@ts-expect-error -- reason` only if unavoidable)"),
    (r"eslint-disable(?:-next-line|-line)?(?![^\n]*--\s*\S)", "`eslint-disable` without `-- reason`"),
    (r"pragma:\s*no\s*cover|/\*\s*(istanbul|c8|v8)\s+ignore", "coverage exclusion pragma"),
]

# Files that legitimately mention these patterns (the guards themselves, docs describing them).
EXEMPT = re.compile(r"/\.claude/(hooks|agents|skills)/|/docs/|CLAUDE\.md$|AGENTS\.md$")
TEST_PATH = re.compile(r"(^|/)(tests?|e2e|__tests__)/|\.(test|spec)\.[jt]sx?$|(^|/)test_[^/]*\.py$")


def _edits(tool_input):
    """Return (old_text, new_text) of this tool call."""
    new_parts, old_parts = [], []
    if "content" in tool_input:  # Write: compare against file on disk
        new_parts.append(tool_input.get("content") or "")
        path = tool_input.get("file_path", "")
        if path and os.path.isfile(path):
            try:
                with open(path, encoding="utf-8", errors="ignore") as fh:
                    old_parts.append(fh.read())
            except OSError:
                pass
    if "new_string" in tool_input:
        new_parts.append(tool_input.get("new_string") or "")
        old_parts.append(tool_input.get("old_string") or "")
    for edit in tool_input.get("edits") or []:
        new_parts.append(edit.get("new_string") or "")
        old_parts.append(edit.get("old_string") or "")
    return "\n".join(old_parts), "\n".join(new_parts)


def check(data):
    tool_input = data.get("tool_input") or {}
    path = tool_input.get("file_path", "") or ""
    base = os.path.basename(path)

    if base == ".env" or (base.startswith(".env.") and not base.endswith(".example")):
        return f"BLOCKED: do not write real env files ({base}). Edit .env.dev.example / .env.prod.example and tell the user."

    if EXEMPT.search(path):
        return None

    old, new = _edits(tool_input)
    problems = [label for pattern, label in RULES if len(re.findall(pattern, new)) > len(re.findall(pattern, old))]
    if not problems:
        return None
    where = "test file" if TEST_PATH.search(path) else "file"
    return (
        f"BLOCKED edit to {where} {path}: adds " + "; ".join(problems) + ".\n"
        "Project rule (CLAUDE.md #3): never weaken verification to get green. Fix the code or the "
        "test setup instead. If the suppression is truly unavoidable, stop and ask the user to add it."
    )


def main():
    try:
        message = check(json.load(sys.stdin))
    except Exception:  # fail open: a guard bug must not lock the session
        return 0
    if message:
        print(message, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
