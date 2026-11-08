# Verification — M29-01 — 2026-11-08

| Gate | Command | Result |
|---|---|---|
| Lint BE/FE | make lint | ✅ ruff "All checks passed!", eslint 0 problems |
| Typecheck | make typecheck | ✅ |
| Unit FE | vitest --coverage | ✅ 102 files, 1100 passed |
| Integration + generated + stateful (BE) | make test | ✅ 1567 passed, 29 deselected; coverage 97.01% (≥ 85%) |
| Contract drift | make contract | ✅ clean (no API change) |
| Migrations up/down | make migrations-check | ✅ downgrade/upgrade 3e8a1c5d7b90 OK |
| AC traceability | make ac | ✅ 1774/1774 enforced ACs covered (M29-01: 8/8) |
| E2E mobile + desktop + axe | make e2e | ✅ 321 passed, 1 flaky, 0 a11y violations |

Screenshots: `reports/screenshots/{mobile,desktop}/product-create-image.png`, `reports/screenshots/{mobile,desktop}/products-with-image.png`

Failures / skipped gates:
- Flaky (passed on retry), unrelated to M29-01: `[desktop] e2e/orders.spec.ts:76 AC-ORD-024…` timed out waiting for the customer option "Cty Sáng Tạo Mới E2E" in the customer picker.
- The previous `make verify` run failed the axe check of `AC-CAT-016` (color-contrast on "Lưu" while its color was still transitioning). Cause: an upload on the edit form also locked "Lưu". Fixed by locking only during the create-form upload (spec §6); `products.spec.ts` then passed 48/48 (repeat-each 3) before this final run.
