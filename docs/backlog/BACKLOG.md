# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`, `UI` (style thuần, xuyên module, không đổi API/quyền).

## M15 — Giai đoạn 2: CSKH, vai trò kết hợp, giá vốn, báo cáo doanh thu (spec Draft, 2026-10-21)
- `[R]` M15-01 — Vai trò CSKH (`CUSTOMER_CARE`) + ràng buộc gán vai trò: Manager ⇒ tự có Sale/CSKH/QLKT (không bao giờ cùng Kỹ thuật viên); nhân viên khác gán tự do. `docs/specs/M15-01-customer-care-role.md`
- `[R]` M15-02a — API: CSKH tra cứu đơn + ghi phản hồi (sao 1–5 + nội dung, tách riêng `customer_feedback`/`result_note`). `docs/specs/M15-02a-customer-feedback-api.md`
- `[R]` M15-02b — UI: màn tra cứu CSKH + tô màu theo sao + ô thống kê. `docs/specs/M15-02b-customer-feedback-ui.md` (gộp chung PR #127 với M15-02a theo quyết định chủ dự án 2026-10-22)
- `[R]` M15-03 — CSKH tạo yêu cầu chỉnh sửa gửi QLKT (chỉ thông báo, QLKT tự quyết revise). `docs/specs/M15-03-csk-revision-request.md`
- `[R]` M15-04 — Dashboard: Top 10 KH doanh thu cao nhất + tổng hợp đánh giá KH (Manager/QLKT/Sale/CSKH). `docs/specs/M15-04-dashboard-top-customers-feedback.md`
- `[x]` M15-05 — Khách hàng: thêm trường tổ chức (ngày thành lập, giám đốc, phụ trách IT + SĐT/email riêng) / cá nhân (ngày sinh, giới tính, nghề nghiệp); `type` bất biến sau khi tạo. `docs/specs/M15-05-customer-extended-fields.md`
- `[x]` M15-06 — Bỏ dòng hàng "Tự do" khi tạo đơn (chỉ chọn danh mục). `docs/specs/M15-06-remove-custom-order-line.md`
- `[x]` M15-07 — Giá vốn bắt buộc trên Sản phẩm/Dịch vụ. `docs/specs/M15-07-catalog-cost-price.md`
- `[x]` M15-08 — Lịch sử giá bán/giá vốn + `cost_price_snapshot` trên dòng hàng đơn. `docs/specs/M15-08-catalog-price-history.md`
- `[R]` M15-09a — API: Báo cáo "Doanh thu theo khách hàng" (list, drilldown, xuất CSV). `docs/specs/M15-09a-revenue-by-customer-report-api.md`
- `[ ]` M15-09b — UI: Báo cáo "Doanh thu theo khách hàng". `docs/specs/M15-09b-revenue-by-customer-report-ui.md`
- `[S]` M15-10a/b — Báo cáo "Doanh thu theo nhân viên" (API + UI, drilldown, xuất Excel). `docs/specs/M15-10a-revenue-by-employee-report-api.md`, `M15-10b-revenue-by-employee-report-ui.md`
- `[S]` M15-11 — Gộp menu "Báo cáo" (KPI + 2 báo cáo doanh thu mới), làm sau cùng. `docs/specs/M15-11-reports-menu-group.md`

Mỗi spec đang **Draft**, có mục "8. Giả định & câu hỏi" ghi rõ giả định mặc định — vài điểm ảnh hưởng lớn (phạm vi xem báo cáo doanh thu của Sale/CSKH, cấu trúc "Phụ trách IT") đã đẩy sang `docs/product/OPEN_QUESTIONS.md` (Q86–Q89), cần chủ dự án chốt trước khi duyệt Approved.

## M14 — Vận hành / sửa đổi nhỏ (chưa bắt đầu)
- `[R]` M14-01 — Giảm số bản backup giữ lại từ 14 xuống **2 bản gần nhất** cho `db-*.dump`/`uploads-*.tar.gz` (`scripts/backup.sh`, `KEEP`); image tag trên Mac/server giữ 2 bản đã là hướng dẫn thủ công có sẵn ở `docs/architecture/DEPLOYMENT.md` §7.1. Quyết định của chủ dự án (2026-10-21). Spec `M9-02` đã cập nhật.
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
