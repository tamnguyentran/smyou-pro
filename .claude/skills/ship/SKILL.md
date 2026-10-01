---
name: ship
description: Open a pull request for a verified and reviewed backlog item with the evidence-based PR template. Use as /ship <backlog-ID> after /verify and /review passed.
disable-model-invocation: true
argument-hint: <backlog-ID>
---

# /ship $ARGUMENTS

1. Preconditions: `reports/verification.md` is from the current HEAD and all green; `reports/review-$ARGUMENTS.md` has no unresolved High+ findings; branch is not `main`. Otherwise stop and say what is missing.
2. Update docs affected by behaviour changes; set backlog item to `[x]` and spec `Status: Done` now, as part of this same branch — do not leave this for a separate post-merge "close-out" PR. By the time `/ship` runs, `/review` + `make verify` have already gated the work; merging this PR is the only remaining step, so there's nothing left to re-verify before calling it Done. (Do not reference this PR's own number in the backlog note — it isn't known yet and isn't required; `git log`/GitHub already has that history.)
3. Commit remaining changes (Conventional Commits, English) — this includes the backlog/spec commit from step 2. Do not push yet.
4. Only once everything above is committed and `make verify` was the last thing run (no further local changes pending): `git push -u origin HEAD` (the user will be asked to approve). One push for the whole item — do not push again mid-review for incremental fixes; finish fixing and re-verifying locally first.
5. `gh pr create` using `.github/pull_request_template.md`, filling:
   - Summary (Vietnamese, 3–5 bullets, user-visible behaviour)
   - AC matrix (from `reports/ac-matrix.md`, this spec's rows)
   - Verification table (from `reports/verification.md`)
   - Review resolutions summary
   - Screenshots (list of files in `reports/screenshots/`; they are also uploaded as CI artifacts)
   - New assumptions / open questions
6. If the CI job "Claude PR Review" fails, report it — never re-run it without asking (each run is billed to the owner's API key; one run here cost $3).
7. Reply with the PR URL and what the owner should look at (checklist in QUALITY_GATES §4).
