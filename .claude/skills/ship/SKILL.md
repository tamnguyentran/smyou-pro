---
name: ship
description: Open a pull request for a verified and reviewed backlog item with the evidence-based PR template. Use as /ship <backlog-ID> after /verify and /review passed.
disable-model-invocation: true
argument-hint: <backlog-ID>
---

# /ship $ARGUMENTS

1. Preconditions: `reports/verification.md` is from the current HEAD and all green; `reports/review-$ARGUMENTS.md` has no unresolved High+ findings; branch is not `main`. Otherwise stop and say what is missing.
2. Update docs affected by behaviour changes; set backlog item to `[R]`; spec `Status: Done` once merged (leave Approved now).
3. Commit remaining changes (Conventional Commits, English).
4. `git push -u origin HEAD` (the user will be asked to approve).
5. `gh pr create` using `.github/pull_request_template.md`, filling:
   - Summary (Vietnamese, 3–5 bullets, user-visible behaviour)
   - AC matrix (from `reports/ac-matrix.md`, this spec's rows)
   - Verification table (from `reports/verification.md`)
   - Review resolutions summary
   - Screenshots (list of files in `reports/screenshots/`; they are also uploaded as CI artifacts)
   - New assumptions / open questions
6. Reply with the PR URL and what the owner should look at (checklist in QUALITY_GATES §4).
