# Verification — CI e2e fixes (AC-UI-069, AC-KPI-054) — 2026-11-06

| Gate | Command | Result |
|---|---|---|
| Lint BE/FE | make lint | ✅ |
| Typecheck | make typecheck | ✅ |
| Unit + integration + generated + stateful | make test | ✅ BE 1532 passed, coverage 96.95%; FE 1034 passed (98 files) |
| Contract drift | make contract | ✅ clean |
| Migrations up/down | make migrations-check | ✅ |
| AC traceability | make ac | ✅ 1686/1686 enforced ACs covered |
| E2E mobile + desktop + axe | make e2e | ✅ 312 passed, 2 flaky (passed on retry: dashboard-drilldown AC-UI-071/072 desktop, orders AC-ORD-024… desktop) |

`make verify` exit 0.
Screenshots: reports/screenshots/{mobile,desktop}/
Failures / skipped gates: none.

Fixes in this round:
- `CustomerFormSheet.tsx`: server 422 errors are rendered (`flushSync`) before focusing the first rejected field, which is then centred (`scrollIntoView({block:"center"})`) — error line no longer left off-screen on mobile (CI failure of AC-UI-069).
- `e2e/kpi-targets.spec.ts`: `getByLabel("Phòng ban", { exact: true })` — leftover e2e employee "QA Phòng ban" made the locator ambiguous (CI failure of AC-KPI-054). Assertion unchanged.
- `src/test/setup.ts`: no-op `scrollIntoView` for jsdom.
