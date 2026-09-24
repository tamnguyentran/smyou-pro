#!/usr/bin/env python3
"""Regression tests for the Claude Code guard hooks. Run: python3 -m unittest discover -s .claude/hooks -p 'test_*.py'"""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOKS = Path(__file__).resolve().parent


def run_hook(script: str, tool_input: dict) -> int:
    result = subprocess.run(
        [sys.executable, str(HOOKS / script)],
        input=json.dumps({"tool_input": tool_input}),
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode


class BashGuardEnvSecrets(unittest.TestCase):
    BLOCKED = [
        "cat .env",
        "cat .env.dev",
        "cat .env.dev|head",
        'cat ".env.dev"',
        "cat '.env.prod'",
        "cat .env.dev;",
        "grep . .env.dev",
        "grep -r SECRET .env.prod",
        "awk 1 .env.local",
        "sed -n 1p ./.env.dev",
        "cp .env.prod /tmp/x",
        "base64 < .env.dev",
        "cat .env.test",
        "python3 -c \"print(open('.env.dev').read())\"",
    ]
    ALLOWED = [
        "cat .env.dev.example",
        "cat .env.prod.example",
        "cp .env.dev.example .env.dev",
        "make setup",
        "ls -la",
        "grep -rn DATABASE_URL backend/app",
        "echo environment",
    ]

    def test_blocks_reading_real_env_files(self) -> None:
        for command in self.BLOCKED:
            with self.subTest(command=command):
                self.assertEqual(run_hook("guard_bash.py", {"command": command}), 2)

    def test_allows_examples_and_unrelated_commands(self) -> None:
        for command in self.ALLOWED:
            with self.subTest(command=command):
                self.assertEqual(run_hook("guard_bash.py", {"command": command}), 0)


class BashGuardDestructive(unittest.TestCase):
    def test_blocks(self) -> None:
        for command in [
            "git commit --no-verify -m x",
            "git push -f origin feat/x",
            "git push origin main",
            "docker compose down -v",
            "rm -rf .",
            "alembic downgrade base",
        ]:
            with self.subTest(command=command):
                self.assertEqual(run_hook("guard_bash.py", {"command": command}), 2)

    def test_allows(self) -> None:
        for command in ["git push -u origin feat/M0-01-x", "docker compose down", "rm -rf frontend/node_modules"]:
            with self.subTest(command=command):
                self.assertEqual(run_hook("guard_bash.py", {"command": command}), 0)


class EditGuard(unittest.TestCase):
    def edit(self, path: str, new: str, old: str = "") -> int:
        return run_hook("guard_edits.py", {"file_path": path, "old_string": old, "new_string": new})

    def test_blocks_weakening_patterns(self) -> None:
        cases = [
            ("/x/backend/tests/test_a.py", "@pytest.mark." + "skip\ndef t(): ..."),
            ("/x/frontend/e2e/a.spec.ts", "test." + "only('x', () => {})"),
            ("/x/backend/app/a.py", "x = 1  # type: " + "ignore"),
            ("/x/backend/app/a.py", "import os  # " + "noqa"),
            ("/x/frontend/src/a.tsx", "// @ts-" + "ignore"),
            ("/x/frontend/src/a.tsx", "// eslint-" + "disable-next-line no-console"),
        ]
        for path, new in cases:
            with self.subTest(new=new):
                self.assertEqual(self.edit(path, new), 2)

    def test_allows_justified_suppressions_and_existing_occurrences(self) -> None:
        skip = "@pytest.mark." + "skip\n"
        self.assertEqual(self.edit("/x/backend/tests/test_a.py", skip + "def t2(): ...", old=skip + "def t(): ..."), 0)
        self.assertEqual(self.edit("/x/backend/app/a.py", "x = 1  # type: " + "ignore[attr-defined]  # untyped lib"), 0)
        self.assertEqual(self.edit("/x/frontend/src/a.tsx", "// eslint-" + "disable-next-line no-console -- CLI"), 0)

    def test_blocks_real_env_files_only(self) -> None:
        self.assertEqual(run_hook("guard_edits.py", {"file_path": "/x/.env.dev", "content": "A=1"}), 2)
        self.assertEqual(run_hook("guard_edits.py", {"file_path": "/x/.env.dev.example", "content": "A=1"}), 0)


if __name__ == "__main__":
    unittest.main()
