#!/usr/bin/env bash
# SessionStart: give Claude a compact snapshot of where work stands (stdout is added to context).
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0
echo "## Session snapshot"
echo "Branch: $(git branch --show-current 2>/dev/null)"
echo "Uncommitted: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') files"
if [ -f docs/backlog/BACKLOG.md ]; then
  echo "Backlog items in flight:"
  grep -E '^\s*- \[(S|A|~|R)\]' docs/backlog/BACKLOG.md | head -5
fi
open_q=$(grep -c '| ❓ |' docs/product/OPEN_QUESTIONS.md 2>/dev/null)
echo "Open questions awaiting owner: ${open_q:-0} (docs/product/OPEN_QUESTIONS.md)"
echo "Reminder: spec Approved → tests first → make verify → /review → /ship."
exit 0
