# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`.

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

## M8 — KPI
- [S] **M8-01a Báo cáo KPI thô — API**: `GET /kpi/report` theo KTV & khoảng ngày (số task xong, % đúng hạn, số lần từ chối theo lý do, số lỗi (defect) trừ `excluded_from_kpi`, giờ ước tính vs thực tế) + `GET /kpi/report/export` (CSV). (Công thức điểm: Q10.) Spec `M8-01a-kpi-report-api.md`. Q78.
- [S] **M8-01b Báo cáo KPI thô — giao diện**: trang `/reports/kpi` (bảng desktop/card mobile, bộ lọc ngày + KTV, nút xuất CSV). Spec `M8-01b-kpi-report-ui.md`.

## M9 — Production
- [ ] **M9-01 Deploy lên `https://ilabsviet.com/smyoutask/`**: thêm khối nginx hệ thống (DEPLOYMENT §5.1), HTTPS dùng chứng chỉ sẵn có của host.
- [ ] **M9-02 deploy.sh, backup/restore scripts + thử khôi phục**.
- [ ] **M9-03 Nhập dữ liệu thật, UAT toàn bộ, go-live checklist**.
