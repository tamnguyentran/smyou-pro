#!/usr/bin/env bash
# Stop hook: if backend/frontend/spec has uncommitted changes, run `make check-fast`.
# On failure, exit 2 so Claude keeps working and sees the errors (max 3 attempts, then report to user).
# Opt out for a session: export SMYOU_SKIP_STOP_VERIFY=1
set -u
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0
cat >/dev/null  # consume hook input

[ "${SMYOU_SKIP_STOP_VERIFY:-0}" = "1" ] && exit 0
[ -f Makefile ] && [ -d backend ] || exit 0   # nothing to verify before M0 scaffold
changed=$(git status --porcelain -- backend frontend spec 2>/dev/null)
counter="$root/.claude/.stop_attempts"
if [ -z "$changed" ]; then rm -f "$counter"; exit 0; fi

n=$(cat "$counter" 2>/dev/null || echo 0)
if [ "$n" -ge 3 ]; then
  rm -f "$counter"
  printf '{"systemMessage":"stop-verify: make check-fast still failing after 3 attempts — Claude must report the failures honestly."}\n'
  exit 0
fi

if out=$(make check-fast 2>&1); then
  rm -f "$counter"
  exit 0
fi

echo $((n + 1)) >"$counter"
{
  echo "make check-fast FAILED (attempt $((n + 1))/3). Fix the cause (do not weaken tests), then finish. Last output:"
  echo "$out" | tail -80
} >&2
exit 2
