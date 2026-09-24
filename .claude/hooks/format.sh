#!/usr/bin/env bash
# PostToolUse: auto-format the file Claude just edited. Never blocks; lint errors surface in Stop hook / CI.
set -u
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
file=$(python3 -c 'import json,sys; print((json.load(sys.stdin).get("tool_input") or {}).get("file_path",""))' 2>/dev/null)
[ -n "$file" ] && [ -f "$file" ] || exit 0

case "$file" in
  "$root"/backend/*.py)
    if [ -f "$root/backend/pyproject.toml" ] && command -v uv >/dev/null 2>&1; then
      (cd "$root/backend" && uv run --quiet ruff check --fix --quiet "$file" >/dev/null 2>&1; uv run --quiet ruff format --quiet "$file" >/dev/null 2>&1)
    fi
    ;;
  "$root"/frontend/*.ts|"$root"/frontend/*.tsx|"$root"/frontend/*.css|"$root"/frontend/*.json|"$root"/frontend/*.md)
    if [ -x "$root/frontend/node_modules/.bin/prettier" ]; then
      "$root/frontend/node_modules/.bin/prettier" --write --log-level silent "$file" >/dev/null 2>&1
    fi
    ;;
esac
exit 0
