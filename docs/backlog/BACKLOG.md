# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`, `UI` (style thuần, xuyên module, không đổi API/quyền).

## M13 — Đơn hàng: tách trạng thái "Đã điều phối"
- [~] `M-order-dispatched-state-a` — Backend: thêm state `DISPATCHED` vào `spec/state_machines.yaml#order` (đảo Q81, chốt Q90), migration CHECK constraint, service bắn `dispatch`/`undispatch`. Spec: `docs/specs/M-order-dispatched-state-a-order-state-machine.md`.
- [S] `M-order-dispatched-state-b` — UI: badge/nhãn, lịch sử, bộ lọc trạng thái, hành vi hàng đợi "Chờ điều phối" (Q91). Phụ thuộc `-a`. Spec: `docs/specs/M-order-dispatched-state-b-ui.md`.

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
