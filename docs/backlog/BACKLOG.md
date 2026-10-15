# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`.

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
- [ ] **M10-04 Số liệu nhân sự (bận/rảnh) trên Tổng quan cho Điều phối kỹ thuật/Quản lý** — đếm KTV có/không có đầu việc đang mở (DASH); mở rộng `dispatch_summary`.
- [x] **M7-03 Thông báo realtime qua WebSocket** — thay polling 30s bằng đẩy tức thời khi tab đang mở (vẫn giữ polling làm lưới an toàn); Web Push (khi đã đóng tab) tách làm backlog riêng, chưa có ID; spec: `docs/specs/M7-03-notifications-realtime-ws.md`.

## M0–M3 — đã xong
M0 (nền móng) · M1 (danh tính & phân quyền) · M2 (danh mục) · M3 (khách hàng & đơn hàng) — toàn bộ `[x]`.
Chi tiết từng item (ID, mô tả, spec, PR): `docs/backlog/BACKLOG_ARCHIVE.md`.
