# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`, `UI` (style thuần, xuyên module, không đổi API/quyền).

## M13 — Đơn hàng: điều phối chuyển thẳng "Đang thực hiện"
- [~] `M-order-dispatched-state-a` — Đảo lại Q81 (chốt Q90, 2026-10-19): `start_dispatch` dời về `task.create` (QLKT giao ≥1 người không bị từ chối → đơn `IN_PROGRESS` ngay, không chờ KTV bấm "Bắt đầu"), 2 chiều (`undispatch` khi từ chối/gỡ hết → về `PENDING_DISPATCH`); `cancel_active` thêm guard chặn huỷ khi đã có ảnh KH xác nhận. Spec: `docs/specs/M-order-dispatched-state-a-order-state-machine.md`.

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
