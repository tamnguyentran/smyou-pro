# Bằng chứng ổn định e2e (M3-08)

Bằng chứng này nằm trong `docs/evidence/` (được git theo dõi) thay vì `reports/verification.md` (bị gitignore, nên CI bản sạch không có file và `e2eEvidence.test.ts` đỏ).

## AC-SYS-080 — 3 lần `make e2e` liên tiếp (2026-10-03, `workers=2`, mỗi lần dựng lại stack)

| Lần | Kết quả    | Thời gian                                        | Test chậm nhất      |
| --- | ---------- | ------------------------------------------------ | ------------------- |
| 1 | 144 passed | 171 s (tổng gồm dựng stack; Playwright 2,1 phút) | AC-ORD-061 · 15,1 s |
| 2 | 144 passed | 150 s (Playwright 1,7 phút)                      | AC-ORD-061 · 12,9 s |
| 3 | 144 passed | 136 s (Playwright 1,7 phút)                      | AC-ORD-061 · 12,9 s |

Cả 3 log chỉ có dòng `144 passed`, không có dòng nào báo test đỏ, flaky hay bị bỏ qua.

Thang thử `workers` (theo lịch sử commit): 4 → 3 → 2. Với 3, `AC-ORD-024` vẫn quá hạn trên DB sạch nên chốt **2** (commit 2a2f02a). Số liệu từng lần chạy ở 4 và 3 không còn được lưu (file `reports/verification.md` cũ đã bị ghi đè); chỉ giá trị chốt 2 được chạy lại và ghi nhận ở trên.

Lưu ý khi chạy: một lần thử trước đó (trước khi dọn đĩa Docker) đỏ `AC-ORD-024` trên desktop vì ổ đĩa của Docker VM đã đầy 100%, và các lần sau không khởi động được DB; sau khi dọn volume ẩn danh bỏ lại (`docker volume prune`), 3 lần ở trên đều xanh.

Không có assertion/timeout nào trong `frontend/e2e/**` bị đổi để đạt kết quả này: kiểm bằng `git diff origin/main -- frontend/e2e` (nhánh này chỉ thêm test mới của M4-01d và đổi selector `sticky` → `sheet-footer` của AC-DSP-026, xem `reports/review-M4-01d.md`).
