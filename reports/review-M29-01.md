# Review — M29-01 — 2026-11-08

Scope: uncommitted working tree vs HEAD (branch `feat/M27-01-customer-care-calls`; committed M27/M28 work out of scope).
Agents: code-reviewer PASS · test-auditor PASS · security-auditor PASS · ui-reviewer PASS. No Critical/High/Medium findings.

| Sev | Agent | File:line | Finding | Assessment / resolution |
|---|---|---|---|---|
| Low | ui-reviewer | `ProductFormSheet.tsx:172` | Create toast is "Đã thêm sản phẩm {tên}." but spec AC-CAT-112/§6 say "Đã thêm sản phẩm." | Confirmed (spec text). Code keeps the existing M2-01b AC-CAT-013 copy (e2e asserts it). **Fixed spec** to "Đã thêm sản phẩm {tên}." |
| Low | ui-reviewer | `reports/screenshots/mobile/product-create-image.png` | fullPage capture clips the fixed sheet | Confirmed, cosmetic. Not fixed — screenshot still shows image box, "Chọn ảnh", sticky "Lưu". |
| Low | code-reviewer | `backend/scripts/reset_uat_data.py:37,130` | Adds `customer_care_calls` cleanup, unrelated to M29-01 | Confirmed; belongs to M27 in the same batch branch. Keep, mention in batch commit/PR. |
| Low | test-auditor | `products.test.tsx:726,751` | AC-CAT-113 mocks `validateImageFile` | Disputed: real validator is covered in `imageCompression.test.ts`; the form test only needs to prove the message is shown and no API call. |
| Low | test-auditor | `products.test.tsx:775` | AC-CAT-114 doesn't re-pick an image and upload in edit mode after failure | Confirmed gap. Not fixed — edit-mode upload is already covered by M2-01b image tests; open for owner if desired. |

Security: frontend-only; create-time upload reuses existing `POST /products/{id}/image` (server enforces capability, magic bytes, size). No new routes.

Verification: `reports/verification.md` (21:41, after last code change) — all gates ✅, e2e 321 passed / 1 flaky unrelated (AC-ORD-024). Only a spec-doc edit after that, so no re-run.
