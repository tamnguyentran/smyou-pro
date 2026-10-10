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
- [x] **M8-01a Báo cáo KPI thô — API**: `GET /kpi/report` theo KTV & khoảng ngày (số task xong, % đúng hạn, số lần từ chối theo lý do, số lỗi (defect) trừ `excluded_from_kpi`, giờ ước tính vs thực tế) + `GET /kpi/report/export` (CSV). (Công thức điểm: Q10.) Spec `M8-01a-kpi-report-api.md`. Q76. `make verify` xanh (`reports/verification.md`); nhân tiện sửa `backend/scripts/seed_e2e.py` không dọn đơn do test tự tạo, chặn `make e2e` (xem `reports/review-M8-01a.md`).
- [x] **M8-01b Báo cáo KPI thô — giao diện**: trang `/reports/kpi` (bảng desktop/card mobile, bộ lọc ngày + KTV, nút xuất CSV). Spec `M8-01b-kpi-report-ui.md`. `make verify` xanh (`reports/verification.md`), `/review` không còn finding Critical/High/Medium (`reports/review-M8-01b.md`). Nhân tiện: `/reports/kpi` là mục menu "chưa làm" cuối cùng nên 2 test chung (`shell.test.tsx`, `shell.review2.test.tsx` AC-SYS-043, e2e `shell-review.spec.ts`) đổi từ dùng trang này làm ví dụ placeholder sang kiểm trực tiếp cơ chế `MenuPage`. Phát hiện thêm `M8-04` (CSV injection, thuộc code M8-01a).
- [ ] **M8-03 Điều tra flake `bottom-nav.spec.ts` AC-SYS-047/051**: test fail ngẫu nhiên (đổi vai trò mỗi lần chạy — manager/tech-lead/technician/sale-technician/sale), tự pass khi retry. Phát hiện lúc `/ship M8-01a` (`reports/verification.md`), không liên quan KPI/dispatch.
- [ ] **M8-04 CSV injection trong `GET /kpi/report/export`**: `build_csv` (`backend/app/modules/kpi/service.py`) ghi `employee_full_name`/`employee_code` vào ô CSV không escape — tên bắt đầu bằng `=`/`+`/`-`/`@` có thể bị Excel/Sheets chạy như công thức khi QLKT/Manager mở file xuất. Cần `employee.manage` trước (không khai thác độc lập được bởi TECHNICIAN/SALE). Phát hiện lúc `/review M8-01b` (`reports/review-M8-01b.md`), nằm trong code M8-01a đã merge nên để lại thành item riêng thay vì sửa lẫn vào M8-01b. Sửa: thêm `'` trước ô bắt đầu bằng `=+-@` trong `build_csv`.

## M9 — Production
- [ ] **M9-01 Deploy lên `https://ilabsviet.com/smyoutask/`**: thêm khối nginx hệ thống (DEPLOYMENT §5.1), HTTPS dùng chứng chỉ sẵn có của host.
- [ ] **M9-02 deploy.sh, backup/restore scripts + thử khôi phục**.
- [ ] **M9-03 Nhập dữ liệu thật, UAT toàn bộ, go-live checklist**.
