---
name: verify
description: Run every automated quality gate and write an evidence report (reports/verification.md) with real command output. Use before claiming any work is done, before /review and before /ship.
argument-hint: "[backlog-ID]"
---

# /verify $ARGUMENTS

1. Make sure the Docker stack is up (`make up`; wait for health).
2. Run `make verify` (= `make check` + `make e2e` + screenshots). Capture output.
3. If something fails: fix the cause (never the test's expectations), rerun. Max 3 cycles; then stop and report.
4. Write `reports/verification.md`:
   ```
   # Verification — <ID> — <date/time>
   | Gate | Command | Result |
   |---|---|---|
   | Lint BE/FE | make lint | ✅/❌ (counts) |
   | Typecheck | make typecheck | … |
   | Unit | make test-unit | N passed |
   | Integration + generated + stateful | make test | N passed, coverage X% (domain Y%) |
   | Contract drift | make contract | clean |
   | Migrations up/down | make migrations-check | … |
   | AC traceability | make ac | M/M ACs covered |
   | E2E mobile + desktop + axe | make e2e | N passed, 0 a11y violations |
   Screenshots: reports/screenshots/…
   Failures / skipped gates: <explicit list or "none">
   ```
5. Paste the table into your reply. Never write "should pass" — only results you observed.
