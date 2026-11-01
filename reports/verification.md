# Verification — M20-10 — 2026-11-01

| Gate | Command | Result |
|---|---|---|
| Lint BE/FE | make lint | ✅ ruff + ruff format + import-linter (1 kept, 0 broken) + eslint + prettier |
| Typecheck | make typecheck | ✅ |
| Unit + Integration + generated + stateful (BE) | make test | ✅ 1293 passed, 29 deselected; coverage 97.12% (ngưỡng 85%) |
| Unit (FE) | vitest --coverage | ✅ 85 files, 854 tests passed |
| Contract drift | make contract | ✅ clean (openapi.json + schema.d.ts sinh lại đã stage, chế độ đợt — chưa commit) |
| Migrations up/down | make migrations-check | ✅ upgrade → downgrade -1 → upgrade, "No new upgrade operations detected" |
| AC traceability | make ac | ✅ 1415/1415 enforced ACs covered |
| E2E mobile + desktop + axe | make e2e | ✅ docker stack 4 passed; Playwright 262 passed, 0 a11y violations |

Screenshots: `reports/screenshots/mobile/dashboard-care-section-grid.png`, `reports/screenshots/desktop/dashboard-care-section-grid.png`

Failures / skipped gates: lượt `make verify` 1 dừng ở `make contract` vì file sinh lại (`openapi.json`, `schema.d.ts` — đổi mô tả "KH đã gọi") chưa stage → `git add` (không commit) rồi chạy `make contract ac migrations-check e2e`: xanh hết.
