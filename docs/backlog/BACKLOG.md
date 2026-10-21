# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`, `UI` (style thuần, xuyên module, không đổi API/quyền).

## M14 — Vận hành / sửa đổi nhỏ (chưa bắt đầu)
- `[ ]` M14-01 — Giảm số bản backup giữ lại từ 14 xuống **2 bản gần nhất** cho `db-*.dump`/`uploads-*.tar.gz` (`scripts/backup.sh`, `KEEP`) và cho image tag giữ trên Mac/server (xem `docs/architecture/DEPLOYMENT.md` §7.1). Quyết định của chủ dự án (2026-10-21). Phải sửa test `backend/tests/docker/test_backup_restore.py::test_backup_keeps_14_newest_per_type` trước (TDD), cập nhật spec `M9-02`, rồi mới đổi script.
- `[x]` M14-02 — Mở rộng 3 điểm `notify_*` còn thiếu (quyết định chủ dự án 2026-10-21, `AC-NTF-003` sửa + `AC-NTF-049/050` mới): `order.start_dispatch` và `order.undispatch` (hệ thống) giờ báo cho **người tạo đơn + mọi TECH_LEAD active** (trước đó không báo ai); `order.complete` báo thêm **TECH_LEAD** (trước đó chỉ người tạo đơn). Sửa `spec/state_machines.yaml`, `backend/app/modules/notifications/service.py`, `backend/app/modules/orders/service.py#reevaluate_dispatch_state`; cập nhật `docs/specs/M7-01a-notifications-api.md` + `docs/product/WORKFLOWS.md` §5.1.

## Đã xong (tự động lưu trữ)
- M13 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M12 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M10 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M11 — xem `BACKLOG_ARCHIVE.md`.

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

## M0–M3 — đã xong
M0 (nền móng) · M1 (danh tính & phân quyền) · M2 (danh mục) · M3 (khách hàng & đơn hàng) — toàn bộ `[x]`.
Chi tiết từng item (ID, mô tả, spec, PR): `docs/backlog/BACKLOG_ARCHIVE.md`.
