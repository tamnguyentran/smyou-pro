# Verification — M27-03 (batch M27-01..03) — 2026-11-08 18:20
| Gate | Command | Result |
|---|---|---|
| Lint BE/FE | make lint | ✅ |
| Typecheck | make typecheck | ✅ (mypy 145 files, tsc) |
| Unit | make test-unit | ✅ 265 passed |
| Integration + generated + stateful | make test | ⚠️ 1566 passed, 1 failed per run (different test each run: run 1 `test_rbac_real_routes[MANAGER]` 401≠403, run 2 `test_workflow_stateful` Hypothesis FailedHealthCheck "input generation is slow"); both pass when run alone. Coverage 97% |
| Frontend unit | vitest | ⚠️ 1084/1091 under load (timeouts only); 1091/1091 in `make check-fast` earlier at lower load |
| Contract drift | make contract | ⚠️ drift = this batch's regenerated files (uncommitted); clean after commit |
| Migrations up/down | make migrations-check | ✅ |
| AC traceability | make ac | ✅ 1766/1766 ACs covered |
| E2E mobile + desktop + axe | make e2e | ✅ 319 passed, 1 flaky (dispatch mobile, passed on retry), 0 serious/critical a11y |

Screenshots: reports/screenshots/{mobile,desktop}/customer-care-all-390.png, customer-care-all-1440.png, dashboard-card-popup-care-customers.png

Failures / skipped gates: no fully green single `make verify` run — machine load avg 20–32 (external process ~240% CPU) caused timeout/health-check flakes in unrelated tests. Owner chose to ship without a third full run (2026-11-08). Pre-existing slow test AC-RPT-123 (businessCharts) times out at 5s under load.
