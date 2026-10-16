# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`, `UI` (style thuần, xuyên module, không đổi API/quyền).

## M11 — Làm mới giao diện (UI refresh, theo yêu cầu chủ dự án 2026-10-15)
- [x] **M11-01 Làm mới style thẻ (card): bỏ viền, dùng bóng mờ, thoáng hơn** — áp mẫu trên 4 component (StatTile, TodayTaskCard, TaskBoardCard, KpiSelfCard) để chủ dự án duyệt hướng trước khi lan ra toàn app (UI); spec: `docs/specs/M11-01-ui-card-style-refresh.md`.
- [x] **M11-02a Lan style thẻ mới ra 5 trang danh sách (Đơn hàng, Khách hàng, Nhân viên, Sản phẩm, Dịch vụ)** — chỉ thẻ mobile, giữ nguyên bảng desktop; spec: `docs/specs/M11-02a-ui-card-style-list-pages.md`.
- [x] **M11-02b Lan style thẻ ra màn hình chi tiết đơn hàng** (các tab trong `OrderDetailTabs`) — spec: `docs/specs/M11-02b-ui-card-style-order-detail.md`.
- [ ] **M11-02c Lan style thẻ ra Điều phối, Việc của tôi, KPI, Nhật ký** (`DispatchQueueList`, `WorkloadList`, `MyAssignmentList`, `KpiRows`, `AuditEventList`) — PR #104 chờ merge; spec: `docs/specs/M11-02c-ui-card-style-dispatch-kpi-audit.md`.
- [~] **M11-02d Soát 3 trang form đơn lẻ** (Đăng nhập, Đổi mật khẩu, Hồ sơ cá nhân) — spec đã duyệt, đang implement; spec: `docs/specs/M11-02d-ui-card-style-standalone-forms.md`.

## Đã xong (tự động lưu trữ)
- M9 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M8 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M7 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M6 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M5 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M4 — xem `BACKLOG_ARCHIVE.md`.

## M10 — Phản hồi UAT (sau go-live)
- [x] **M10-01 Tên sản phẩm/dịch vụ không trùng** — thêm ràng buộc unique theo tên (CAT); spec: `docs/specs/M10-01-catalog-name-unique.md`.
- [ ] **M10-02 Disable nút Lưu nháp/Gửi đơn khi thiếu thông tin bắt buộc** — đơn mới phải có khách hàng + ≥1 dòng hàng mới cho lưu/gửi (ORD); đổi AC-ORD-024 của `M3-02b` (hiện ghi nút luôn hiện).
- [ ] **M10-03 Thẻ thống kê Tổng quan bấm vào để lọc danh sách** — drill-down từ `order_summary`/`dispatch_summary` sang `/orders` hoặc `/dispatch/queue` đã lọc sẵn (DASH); phần "Ngoài phạm vi" đã ghi ở `M7-02`.
- [x] **M10-04 Số liệu nhân sự (bận/rảnh) trên Tổng quan cho Điều phối kỹ thuật/Quản lý** — đếm KTV có/không có đầu việc đang mở (DASH); làm dưới dạng `staff_summary` mới (3 nhóm, cùng màu với "Lịch & tải việc") + `task_summary`/`my_task_summary` đi kèm; spec: `docs/specs/M7-02-role-dashboard.md` (M7-02c/M7-02d).
- [x] **M10-06 Đơn chỉ "Đang thực hiện" khi KTV thật sự Bắt đầu** — dời effect `start_dispatch` từ lúc tạo task sang lúc phân công đầu tiên `start` (ORD/DSP/ASG); phản hồi chủ dự án 2026-10-15, Q81. Tác dụng phụ: `recall`/`cancel` đổi mã lỗi từ `INVALID_TRANSITION` sang `GUARD_FAILED` khi đơn đã có task; hàng đợi "Chờ điều phối" giữ nguyên hành vi cũ (chưa tách loại "đã giao, chưa ai bắt đầu"). Spec: `docs/specs/M5-03-start-complete-assignment.md` (AC-ASG-069/070), amend `M4-01a`/`M4-01b`.
- [x] **M10-05 Web Push cho thông báo (khi đã đóng tab/app)** — Service Worker + VAPID key + bảng `push_subscriptions` mới (NTF); tách riêng khỏi `M7-03` theo quyết định của chủ dự án (làm WebSocket trước); spec: `docs/specs/M10-05-web-push-notifications.md`.
- [x] **M7-03 Thông báo realtime qua WebSocket** — thay polling 30s bằng đẩy tức thời khi tab đang mở (vẫn giữ polling làm lưới an toàn); Web Push (khi đã đóng tab) tách làm backlog riêng, chưa có ID; spec: `docs/specs/M7-03-notifications-realtime-ws.md`.

## M0–M3 — đã xong
M0 (nền móng) · M1 (danh tính & phân quyền) · M2 (danh mục) · M3 (khách hàng & đơn hàng) — toàn bộ `[x]`.
Chi tiết từng item (ID, mô tả, spec, PR): `docs/backlog/BACKLOG_ARCHIVE.md`.
