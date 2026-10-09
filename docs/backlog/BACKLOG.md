# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`.

## Đã xong (tự động lưu trữ)
- M7 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M5 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M4 — xem `BACKLOG_ARCHIVE.md`.

## M0–M3 — đã xong
M0 (nền móng) · M1 (danh tính & phân quyền) · M2 (danh mục) · M3 (khách hàng & đơn hàng) — toàn bộ `[x]`.
Chi tiết từng item (ID, mô tả, spec, PR): `docs/backlog/BACKLOG_ARCHIVE.md`.

## M6 — Hoàn tất & Chỉnh sửa
- [x] **M6-01 Tải ảnh phiếu xác nhận** (nén client, kiểm magic bytes, lưu an toàn, xem có kiểm quyền).
- [x] **M6-02 Hoàn tất đơn**.
- [x] **M6-03a Chuyển Chỉnh sửa + mở lại task + defect records — API**: bảng `order_revisions`/`defect_records`, cột `tasks.reopen_count`/`last_reopened_in_revision`, guard `order_in_revision`/`revision_has_work_if_revision`, `POST /orders/{id}/revise`, `POST /orders/{order_id}/tasks/{task_id}/reopen`, badge `revision_count`. Spec `M6-03a-revision-reopen-api.md`. `make verify` xanh (`reports/verification.md`).
- [x] **M6-03b Chuyển Chỉnh sửa + mở lại task — giao diện**: nút "Chuyển Chỉnh sửa" trên trang đơn, "Mở lại" trên đầu việc, trang `/dispatch/revisions`. Spec `M6-03b-revision-reopen-ui.md`. `make verify` xanh (`reports/verification.md`).
- [ ] **M6-04 Stateful test toàn workflow + E2E golden path** (TESTING_STRATEGY §5).

## M8 — KPI
- [ ] **M8-01 Báo cáo KPI thô** theo KTV & khoảng ngày: số task xong, % đúng hạn, số lần từ chối theo lý do, số lỗi (defect) trừ `excluded_from_kpi`, giờ ước tính vs thực tế; xuất CSV. (Công thức điểm: Q10.)

## M9 — Production
- [ ] **M9-01 Deploy lên `https://ilabsviet.com/smyoutask/`**: thêm khối nginx hệ thống (DEPLOYMENT §5.1), HTTPS dùng chứng chỉ sẵn có của host.
- [ ] **M9-02 deploy.sh, backup/restore scripts + thử khôi phục**.
- [ ] **M9-03 Nhập dữ liệu thật, UAT toàn bộ, go-live checklist**.
