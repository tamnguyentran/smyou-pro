# Review M4-01d — Sheet header/footer ngoài vùng cuộn

Agents: code-reviewer (PASS), test-auditor (CHANGES_REQUIRED → đã xử lý), ui-reviewer (PASS). security-auditor bỏ qua: chỉ đổi frontend, không đụng route/query/auth/upload.

| # | Sev | Nguồn | Vị trí | Finding | Đánh giá / Xử lý |
|---|---|---|---|---|---|
| 1 | High | test-auditor | e2e/sheet.spec.ts:60 | AC-SYS-089 chỉ thử form Khách hàng, chưa thử form "Tạo đầu việc" + nhập đủ rồi tạo thành công | **Confirmed.** Thêm e2e `AC-SYS-089` trong dispatch.spec.ts (390×520, bấm khi form trống → lỗi trong body, footer + tiêu đề trong khung nhìn, nhập đủ → tạo thành công). `make e2e`: 143 passed |
| 2 | Medium | test-auditor | sheet.test.tsx:190 | AC-SYS-090 chỉ grep mã nguồn | **Disputed (chấp nhận).** Hành vi từng màn được test component hiện có phủ (bấm nút trong footer → submit; đã chạy xanh sau khi chuyển nút) + e2e dispatch/customer |
| 3 | Medium | test-auditor | sheet.test.tsx:12 | AC-SYS-082 jsdom chỉ kiểm class | **Disputed.** Layout thật đã kiểm ở e2e AC-083/084 (bounding box) |
| 4 | Medium | test-auditor | sheet.spec.ts:66 | Matcher AC-089 nới từ `role=alert` sang `aria-invalid` | **Confirmed một phần, chấp nhận.** Lỗi field dùng `aria-invalid` (commit 9c94d88 giải thích); test dispatch mới cũng dùng cùng cách. Không có assertion nào bị xoá |
| 5 | Low | code-reviewer, test-auditor | taskCreate.test.tsx, dispatch.spec.ts | Bỏ assertion `sticky bottom-0` (AC-DSP-026) | **Có chủ đích:** `sticky` không còn trong DOM, thay bằng assert nút nằm trong `sheet-footer` + safe-area. Do đổi thiết kế theo spec AC-SYS-090 |
| 6 | Low | code-reviewer | spec §6 vs code | Spec nêu `flex-col-reverse` cho footer, code dùng `justify-end`; §8 yêu cầu giữ thứ tự nút | Spec tự mâu thuẫn; code theo §8 + AC-SYS-091. Không sửa |
| 7 | Low | ui-reviewer | employees form | Nút "Lưu" căn trái, ConfirmDialog căn phải | Ghi nhận, chưa thống nhất (ngoài AC) |
| 8 | Low | ui-reviewer | reports/screenshots/mobile/employee-form.png | Ảnh full-page, không chứng minh footer ghim ở 390×844 | Ghi nhận; chụp lại khi `make screenshots` |
| 9 | Info | test-auditor | src/e2eEvidence.test.ts | 2 test M3-08 đỏ: `reports/verification.md` (gitignored, do `make verify` sinh) không còn mục "AC-SYS-080" | Không thuộc M4-01d; branch đang xếp trên M3-08 chưa merge. Cần chạy lại `make verify` (sẽ ghi lại báo cáo) hoặc xử lý ở M3-08 |
