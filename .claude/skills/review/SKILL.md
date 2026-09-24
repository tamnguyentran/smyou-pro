---
name: review
description: Independent multi-agent review of the current branch - launches code-reviewer, test-auditor, security-auditor and (if frontend changed) ui-reviewer in parallel with fresh context, then fixes confirmed findings and re-verifies. Use after /implement and before /ship.
disable-model-invocation: true
argument-hint: <backlog-ID>
---

# /review $ARGUMENTS

1. Determine scope: `git diff --stat main...HEAD`; check whether `frontend/src` changed.
2. Launch **in parallel, in a single message**, the subagents (each gets only: the backlog ID, the spec path, and "review branch vs main"; do NOT pass your own reasoning — they must judge independently):
   - `code-reviewer`
   - `test-auditor`
   - `security-auditor` (always when routes/queries/auth/uploads/config changed; otherwise skip and say so)
   - `ui-reviewer` (only if `frontend/src` changed)
3. Consolidate findings into one table: severity, source agent, file:line, finding, your assessment (Confirmed / Disputed + reason). Verify disputed ones yourself by reading code or running a test — do not dismiss without evidence.
4. Fix every Confirmed Critical/High/Medium finding. For bugs: first add a failing test that reproduces it (commit `test($ARGUMENTS): reproduce …`), then fix. Low findings: fix if trivial, else list them.
5. Run `/verify`. If any fix was non-trivial, re-run only the agent(s) whose findings you fixed (max 3 review rounds in total).
6. Write `reports/review-$ARGUMENTS.md` with the table and resolutions. Reply with the summary; flag anything unresolved or disputed for the user's decision.

Also available for a second opinion: the built-in `/code-review` and `/security-review` commands.
