# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `KPI`.

## M0–M3 — đã xong
M0 (nền móng) · M1 (danh tính & phân quyền) · M2 (danh mục) · M3 (khách hàng & đơn hàng) — toàn bộ `[x]`.
Chi tiết từng item (ID, mô tả, spec, PR): `docs/backlog/BACKLOG_ARCHIVE.md`.

## M4 — Điều phối (QLKT)
- [x] **M4-01a Hàng đợi điều phối + tạo task + giao nhiều KTV — API**: bảng `tasks`/`assignments`, 5 guard đang treo (`order_in_dispatchable_state`/`at_least_one_assignee`/`assignees_are_active_technicians`/`estimated_hours_positive`/`due_at_not_in_past`), lệnh tạo task (đơn → IN_PROGRESS khi là task đầu tiên), `GET /orders/{id}/tasks`, `GET /orders?sort=dispatch`, badge `pending_dispatch_count`. Spec `M4-01a-dispatch-task-create-api.md`. Q59, Q60, Q61, Q62, Q63.
- [x] **M4-01b Hàng đợi điều phối + tạo task + giao nhiều KTV — giao diện**: trang `/dispatch/queue` (sắp theo ưu tiên + ngày hẹn), panel/form tạo task nhiều người giao. Spec `M4-01b-dispatch-task-create-ui.md`. Q64. `make verify` xanh (`reports/verification.md`), `/review` xong (`reports/review-M4-01b.md`).
- [x] **M4-01c Tab "Đầu việc" trên trang chi tiết đơn**: danh sách task của đơn (`GET /orders/{id}/tasks`), badge trạng thái task, nút "Tạo đầu việc" dùng lại `TaskCreateSheet` của M4-01b cho đơn `PENDING_DISPATCH`/`IN_PROGRESS`/`REVISION` (Q65). Tách từ M4-01b vì gộp vượt ~400 dòng non-test (Q64). Spec `M4-01c-order-tasks-tab.md`. `make verify` xanh (`reports/verification.md`), `/review` xong (`reports/review-M4-01c.md`). Còn treo một quyết định sản phẩm: nhãn "Tạo đầu việc" trùng giữa shortcut toàn cục của shell (`AppShell.PrimaryAction` → `/dispatch/queue`) và nút trong tab — đề xuất đổi tên shortcut thành "Hàng đợi điều phối" ở một item riêng.
- [x] **M4-01d Component `Sheet`: header + footer ngoài vùng cuộn**: đổi panel thành flex-col (header cố định, body `overflow-y-auto`, footer dính đáy) để tiêu đề sheet không cuộn mất; áp cho cả 10 màn đang dùng `Sheet`. Phát hiện ở `/review` M4-01b (`reports/review-M4-01b.md` #4). Cần AC riêng + chụp lại ảnh các sheet hiện có.
- [x] **M4-01e Đánh bóng UI điều phối**: picker KTV báo lỗi tải + nút "Thử lại" khi `GET /employees` fail (hiện báo nhầm "Không có kỹ thuật viên nào đang hoạt động."); thẻ mobile hàng đợi thêm nhãn "Ngày hẹn:" và "Người tạo:"; nút footer panel tạo đầu việc xếp dọc, `w-full sm:w-auto` trên mobile; bỏ ép kiểu `order.priority as Priority` ở module dispatch, dùng type guard `isPriority`/`priorityBadge`/`priorityOrDefault`. Phát hiện ở `/review` M4-01b (`reports/review-M4-01b.md` #5–#8). Spec `M4-01e-dispatch-ui-polish.md`. `make verify` xanh (`reports/verification.md`).
- [x] **M4-02a Sửa task, thêm/gỡ người, huỷ task — API**: lệnh `update`/`add_assignee`/`cancel` của task, chuyển `assignment.remove`, `GET /orders/{id}/tasks/{task_id}`; cài guard `not_already_active_assignee`/`task_not_cancelled`. Lỗi `create_task` lưu `order_line_ids` không kiểm thuộc đơn (phát hiện `/review` M4-01c) **chưa vá** — Q67/Q68 đề xuất thêm guard đã hỏi và chủ dự án không duyệt (2026-10-03), để lại cho item sau nếu cần. Spec `M4-02a-task-edit-cancel-api.md`. Q69 còn ⏳ (không chặn).
- [x] **M4-02b Sửa task, thêm/gỡ người, huỷ task — giao diện**: tab "Đầu việc" cho bấm vào từng task mở sheet sửa + thêm/gỡ người + huỷ; trạng thái task suy ra hiển thị đúng (kể cả `NEEDS_ASSIGNEE`). Spec `M4-02b-task-edit-cancel-ui.md`. `/review` phát hiện + vá 2 lỗi Medium (hàng task desktop không thao tác được bằng bàn phím; toast đè nút "Lưu" của sheet sau khi lưu — nay `Sheet` luôn nổi trên `Toast`) và chấp nhận 2 gap Low (AC-DSP-069 "không cuộn ngang" chỉ kiểm qua className; `CancelTaskSheet` chưa có ảnh chụp e2e riêng). `make verify` xanh (`reports/verification.md`), `/review` xong (`reports/review-M4-02b.md`).
- [x] **M4-03a Bảng đầu việc — API**: `GET /api/v1/tasks` toàn công ty, lọc `status`/`priority`/`assignee_id`/`due_from`/`due_to` (capability `task.read` có sẵn, không sửa `permissions.yaml`). Spec `M4-03a-dispatch-board-api.md`. `make verify` xanh (`reports/verification.md`), `/review` xong (`reports/review-M4-03a.md`).
- [x] **M4-03b Bảng đầu việc — giao diện**: trang `/dispatch/board`, Kanban 6 cột (desktop) / danh sách lọc theo trạng thái (mobile), thanh lọc KTV/hạn/ưu tiên. Tách từ M4-03 theo mẫu M4-01/M4-02 (API + UI riêng, dự kiến vượt ~400 dòng non-test nếu gộp). Spec `M4-03b-dispatch-board-ui.md`. `make verify` xanh (`reports/verification.md`), `/review` xong (`reports/review-M4-03b.md`) — 2 finding Medium (test skeleton/AC-DSP-089 thiếu nhánh desktop; e2e AC-DSP-092 ép 390px + thiếu tag `@a11y`/`@screenshot`) đã vá.
- [x] **M4-03c Dọn dữ liệu dev catalog tích tụ (`services.spec.ts` chập chờn)**: dev DB có 86 services (57 active) trong khi `seed_e2e.py` chỉ quản lý 2 dòng cố định — đẩy fixture `E2E-DV-001` ra khỏi trang 1 của danh sách dịch vụ (sort theo `code`, `limit=20`), làm `AC-CAT-027`/`AC-CAT-031` timeout không ổn định. Đã sửa bằng cách đổi cách tìm fixture trong test — gõ vào ô "Tìm kiếm" (mã/tên) trước khi assert thấy fixture, thay vì dựa vào trang 1 — không đụng tới dữ liệu dev DB của người khác. Xác nhận lại bằng cách chạy `services.spec.ts` (cả `mobile`/`desktop`) trên đúng dev DB đang có 86 services: 12/12 xanh.
- [ ] **M4-04 Lịch & tải việc** theo nhân viên.

## M5 — Kỹ thuật viên (mobile)
- [ ] **M5-01 Việc của tôi** (tab, card, gọi/bản đồ).
- [ ] **M5-02 Tiếp nhận / Từ chối (lý do)**.
- [ ] **M5-03 Bắt đầu / Hoàn thành** (+ ghi chú, giờ thực tế, ảnh công việc) → task DONE → đơn AWAITING_CONFIRMATION; test đồng thời.

## M6 — Hoàn tất & Chỉnh sửa
- [ ] **M6-01 Tải ảnh phiếu xác nhận** (nén client, kiểm magic bytes, lưu an toàn, xem có kiểm quyền).
- [ ] **M6-02 Hoàn tất đơn**.
- [ ] **M6-03 Chuyển Chỉnh sửa + task phát sinh + mở lại task + defect records**.
- [ ] **M6-04 Stateful test toàn workflow + E2E golden path** (TESTING_STRATEGY §5).

## M7 — Thông báo & Tổng quan
- [ ] **M7-01 Thông báo in-app** (chuông, badge, đánh dấu đã đọc, polling 30s).
  - Follow-up (review M1-03b): bọc route `/thong-bao` và `/ca-nhan` bằng kiểm tra capability (`notification.read`, `profile.manage`) như các trang menu.
- [ ] **M7-02 Dashboard theo vai trò** (Sale: đơn của tôi theo trạng thái; QLKT: chờ điều phối, cần giao lại, quá hạn; KTV: việc hôm nay; Manager: tổng hợp).

## M8 — KPI
- [ ] **M8-01 Báo cáo KPI thô** theo KTV & khoảng ngày: số task xong, % đúng hạn, số lần từ chối theo lý do, số lỗi (defect) trừ `excluded_from_kpi`, giờ ước tính vs thực tế; xuất CSV. (Công thức điểm: Q10.)

## M9 — Production
- [ ] **M9-01 Deploy lên `https://ilabsviet.com/smyoutask/`**: thêm khối nginx hệ thống (DEPLOYMENT §5.1), HTTPS dùng chứng chỉ sẵn có của host.
- [ ] **M9-02 deploy.sh, backup/restore scripts + thử khôi phục**.
- [ ] **M9-03 Nhập dữ liệu thật, UAT toàn bộ, go-live checklist**.
