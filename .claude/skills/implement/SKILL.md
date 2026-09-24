---
name: implement
description: Implement an APPROVED spec with strict TDD (tests committed first, then code until green), then produce verification evidence. Use as /implement <backlog-ID> after /spec was approved.
disable-model-invocation: true
argument-hint: <backlog-ID>
---

# /implement $ARGUMENTS

## 0. Preconditions (stop and tell the user if any fails)
- `docs/specs/$ARGUMENTS-*.md` exists and says `Status: Approved`.
- Items it depends on in `docs/backlog/BACKLOG.md` are `[x]`.
- Working tree clean or only contains this item's work. Create branch: `git switch -c feat/$ARGUMENTS-<slug>` (never commit on main).
- Mark backlog item `[~]`.

## 1. Explore (no edits)
Read the spec, the YAML sections it references, and existing code of the touched modules. For wide searches use the Explore subagent. Note existing patterns to copy (a similar router/service/test/page).

## 2. Plan
Enter plan mode and present: files to add/change; migration(s); endpoints (method, path, capability); components/pages; and **a table AC-ID → test file::test name → layer**. Keep diff ≤ ~400 lines of non-test code; if larger, propose splitting the item. Wait for approval if the user is present; otherwise proceed.

## 3. RED — tests first
- Write tests for every AC, tagged with the AC ID (`@pytest.mark.ac("AC-…")` / `test("AC-… …")`). Include negative cases the spec lists.
- Add any required fixtures/factories/seed data. Stubs only as needed for imports to resolve.
- Run them: they must FAIL for the right reason (assertion / 404 / missing route), not for syntax/import errors.
- `python3 scripts/check_ac_coverage.py --spec $ARGUMENTS` must report 0 missing.
- Commit: `git commit -m "test($ARGUMENTS): acceptance tests for <feature>"`. From now on **do not change these tests**. If one is genuinely wrong versus the spec, stop and ask the user.

## 4. GREEN — implement
- Migration → models → domain (pure) → service (transaction, lock, guards, effects, audit) → router → `make contract` (OpenAPI + TS types) → frontend api hooks → components/pages.
- Follow `docs/architecture/ARCHITECTURE.md` and `docs/design/UI_GUIDELINES.md`. New dependency → stop and ask.
- Loop: smallest relevant test command after each meaningful edit; `make check-fast` regularly.
- Commit in small steps: `feat($ARGUMENTS): …`.

## 5. REFACTOR
Remove duplication/dead code; keep tests green.

## 6. Verify
Run `/verify`. Everything must pass. If after 3 honest attempts something still fails, stop and report exactly what fails with output — never weaken tests.

## 7. Hand-off
Tell the user (Vietnamese): what was built, `make verify` summary, AC matrix path, screenshots path, any new assumptions. Suggest next step: `/review`.
