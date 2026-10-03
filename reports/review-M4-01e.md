# Review M4-01e — Dispatch UI polish

Agents: code-reviewer (PASS), test-auditor (PASS), ui-reviewer (PASS). security-auditor bỏ qua: chỉ đổi frontend (dispatch components + schemas), không đụng route/query/auth/upload/config.

Phạm vi review: `git diff 4424431..HEAD` (5 commit M4-01e trên nền M4-01d đã merge), không dùng `main...HEAD` vì `main` local đang lùi sau nhiều PR xếp chồng đã merge (M4-01a/b/c/d, M3-07/08) — diff đó sẽ lẫn việc không thuộc M4-01e.

| # | Sev | Nguồn | Vị trí | Finding | Đánh giá / Xử lý |
|---|---|---|---|---|---|
| 1 | Low | test-auditor | frontend/e2e/dispatch.spec.ts (AC-DSP-044) | Test mobile chỉ kiểm tỉ lệ chiều rộng + chiều cao nút chính, chưa kiểm thứ tự DOM "nút chính ở trên" khi xếp dọc | **Confirmed, đã sửa (trivial).** Thêm assertion `footerButtons.first()` = "Tạo đầu việc", `.last()` = "Đóng" trong nhánh mobile. Chạy lại: 2/2 passed (desktop + mobile) |
| 2 | Low | ui-reviewer | AssigneePicker.tsx:26-34 | Banner lỗi tải danh sách kỹ thuật viên tự lặp lại style của `components/ui/Alert.tsx` thay vì tái dùng component đó | **Confirmed, không sửa.** `Alert` hiện không hỗ trợ slot cho nút hành động cạnh nội dung (chỉ icon + text, `items-start`); để tái dùng cần đổi API của component dùng chung, vượt phạm vi polish UI dispatch. Thuần thẩm mỹ, không có lỗi hiển thị — ghi nhận cho lần sau |
| 3 | Low | test-auditor | dispatchPolish.test.tsx:228 (AC-DSP-046) | Assertion dựa vào `className` chứa `bg-sidebar-sub` (chi tiết cài đặt) thay vì thuộc tính ngữ nghĩa | **Disputed (chấp nhận).** `Badge` không có `data-tone`/`aria` tương ứng; thêm riêng cho mục đích test là scope creep với spec hiện tại. Giữ nguyên |

## Xác nhận khác (không phải finding)
- AC coverage: 12/12 AC-DSP-038…047 có test, `check_ac_coverage.py --spec M4-01e` xanh.
- Không có assertion nào ở các bộ test cũ (dispatchQueue/taskCreate/orderTasksTab, AC-DSP-015…037) bị sửa hay yếu đi — 0 diff trong các file đó.
- `as Priority` đã bị loại khỏi `features/dispatch/**` đúng AC-DSP-047 (grep xác nhận).
- `tsc --noEmit` sạch; `vitest run src/features/dispatch` 45/45 passed; `playwright --grep "AC-DSP-038|039|040|041|044"` 2/2 passed; axe `@a11y` dispatch-queue/task-create không có vi phạm ở 390px và 1440px.
- Screenshot 390px/1440px cho dispatch-queue và dispatch-task-create đã có trong `reports/screenshots/` (từ `make screenshots` trong lúc review).

## Kết luận
Không có finding High/Medium. 1 Low đã sửa (trivial), 2 Low ghi nhận không sửa (ngoài phạm vi / scope creep). Không cần chạy lại agent nào (không có Confirmed Medium+).
