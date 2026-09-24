#!/usr/bin/env python3
"""PreToolUse guard for Bash: block destructive or verification-bypassing commands.
Any unexpected error exits 0 (fail open) so a broken guard never locks the session."""

from __future__ import annotations

import json
import re
import subprocess
import sys

RULES = [
    (r"--no-verify\b", "bypassing git hooks (--no-verify)"),
    (r"\bgit\s+push\b[^\n;&|]*\s(--force(?!-with-lease)|-f)(\s|$)", "force push"),
    (r"\bgit\s+push\b[^\n;&|]*\s(origin\s+)?(HEAD:)?main(\s|$)", "pushing directly to main (open a PR)"),
    (r"\bgit\s+reset\s+--hard\b", "git reset --hard (ask the user)"),
    (r"\bgit\s+clean\s+-[a-zA-Z]*f", "git clean -f"),
    (r"\bgit\s+checkout\s+--\s+\.(\s|$)|\bgit\s+restore\s+\.(\s|$)", "discarding all working-tree changes"),
    (r"\bdocker\s+compose\b[^\n;&|]*\bdown\b[^\n;&|]*\s(-v|--volumes)(\s|$)", "deleting Docker volumes (database data)"),
    (r"\bdocker\s+(volume\s+rm|system\s+prune)", "deleting Docker volumes/data"),
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+(/|~|\$HOME|\*|\.)(\s|$)", "recursive delete of a root/home/cwd path"),
    (r"\bDROP\s+(DATABASE|SCHEMA|TABLE)\b", "dropping database objects outside migrations"),
    (r"\balembic\b[^\n;&|]*\bdowngrade\s+base\b", "downgrading all migrations"),
    (r"\b(cat|less|head|tail|more)\s+[^\n|;&]*\.env(\.local|\.prod)?(\s|$)", "reading real .env secrets"),
]


def current_branch():
    try:
        return subprocess.run(
            ["git", "branch", "--show-current"], capture_output=True, text=True, timeout=5, check=False
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def check(data):
    command = (data.get("tool_input") or {}).get("command", "") or ""
    for pattern, label in RULES:
        if re.search(pattern, command, flags=re.IGNORECASE):
            return f"BLOCKED: {label}. Ask the user to run this themselves if it is really needed."
    if re.search(r"\bgit\s+commit\b", command) and current_branch() in {"main", "master"}:
        return "BLOCKED: committing on main. Create a branch first: `git switch -c feat/<ID>-<slug>`."
    return None


def main():
    try:
        message = check(json.load(sys.stdin))
    except Exception:  # fail open
        return 0
    if message:
        print(message, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
