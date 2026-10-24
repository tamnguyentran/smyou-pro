# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`, `UI` (style thuần, xuyên module, không đổi API/quyền).

## M15 — Giai đoạn 2: CSKH, vai trò kết hợp, giá vốn, báo cáo doanh thu (spec Draft, 2026-10-21)
- `[x]` M15-01 — Vai trò CSKH (`CUSTOMER_CARE`) + ràng buộc gán vai trò: Manager ⇒ tự có Sale/CSKH/QLKT (không bao giờ cùng Kỹ thuật viên); nhân viên khác gán tự do. `docs/specs/M15-01-customer-care-role.md` (PR #126)
- `[x]` M15-02a — API: CSKH tra cứu đơn + ghi phản hồi (sao 1–5 + nội dung, tách riêng `customer_feedback`/`result_note`). `docs/specs/M15-02a-customer-feedback-api.md` (PR #127)
- `[x]` M15-02b — UI: màn tra cứu CSKH + tô màu theo sao + ô thống kê. `docs/specs/M15-02b-customer-feedback-ui.md` (gộp chung PR #127 với M15-02a theo quyết định chủ dự án 2026-10-22)
- `[x]` M15-03 — CSKH tạo yêu cầu chỉnh sửa gửi QLKT (chỉ thông báo, QLKT tự quyết revise). `docs/specs/M15-03-csk-revision-request.md` (PR #129)
- `[x]` M15-04 — Dashboard: Top 10 KH doanh thu cao nhất + tổng hợp đánh giá KH (Manager/QLKT/Sale/CSKH). `docs/specs/M15-04-dashboard-top-customers-feedback.md` (PR #130)
- `[x]` M15-05 — Khách hàng: thêm trường tổ chức (người liên hệ + SĐT, ngày thành lập, giám đốc + SĐT, phụ trách IT + SĐT) / cá nhân (ngày sinh, giới tính, nghề nghiệp); `type` bất biến sau khi tạo. Addendum 2026-10-24: `contact_person`/`contact_person_phone` chuyển COMPANY-only, thêm `director_phone`, bỏ `it_contact_email`, form 2 cột từ `md:`. `docs/specs/M15-05-customer-extended-fields.md`
- `[x]` M15-06 — Bỏ dòng hàng "Tự do" khi tạo đơn (chỉ chọn danh mục). `docs/specs/M15-06-remove-custom-order-line.md`
- `[x]` M15-07 — Giá vốn bắt buộc trên Sản phẩm/Dịch vụ. `docs/specs/M15-07-catalog-cost-price.md`
- `[x]` M15-08 — Lịch sử giá bán/giá vốn + `cost_price_snapshot` trên dòng hàng đơn. `docs/specs/M15-08-catalog-price-history.md`
- `[x]` M15-09a — API: Báo cáo "Doanh thu theo khách hàng" (list, drilldown, xuất CSV). `docs/specs/M15-09a-revenue-by-customer-report-api.md`
- `[x]` M15-09b — UI: Báo cáo "Doanh thu theo khách hàng". `docs/specs/M15-09b-revenue-by-customer-report-ui.md`
- `[x]` M15-10a — API: Báo cáo "Doanh thu theo nhân viên" (list, drilldown, xuất CSV; áp lại scope Q88/Q96). `docs/specs/M15-10a-revenue-by-employee-report-api.md`
- `[x]` M15-10b — UI: Báo cáo "Doanh thu theo nhân viên". `docs/specs/M15-10b-revenue-by-employee-report-ui.md`
- `[x]` M15-11 — Gộp menu "Báo cáo" (KPI + 2 báo cáo doanh thu mới), làm sau cùng. `docs/specs/M15-11-reports-menu-group.md`

Mỗi spec đang **Draft**, có mục "8. Giả định & câu hỏi" ghi rõ giả định mặc định — vài điểm ảnh hưởng lớn (phạm vi xem báo cáo doanh thu của Sale/CSKH, cấu trúc "Phụ trách IT") đã đẩy sang `docs/product/OPEN_QUESTIONS.md` (Q86–Q89), cần chủ dự án chốt trước khi duyệt Approved.

## M16 — Tặng quà khách hàng (spec Approved, 2026-10-24)
- `[A]` M16-01a — API: ghi nhận tặng quà KH (`customer_gifts`, CRUD trừ xoá, ảnh, lịch sử sửa qua `audit_events`). `docs/specs/M16-01a-customer-gift-tracking-api.md`
- `[x]` M16-01b — UI: màn hình riêng "Ghi nhận quà tặng KH" trong menu Đơn hàng. `docs/specs/M16-01b-customer-gift-tracking-ui.md`
- `[A]` M16-02a — API: báo cáo "Chi phí quà tặng KH" (list theo khách hàng, drilldown, xuất CSV). `docs/specs/M16-02a-customer-gift-report-api.md`
- `[A]` M16-02b — UI: báo cáo "Chi phí quà tặng KH" + menu Báo cáo. `docs/specs/M16-02b-customer-gift-report-ui.md`
- `[x]` M16-03 — Dashboard: 3 thẻ thống kê CSKH (KH đã chăm sóc, NV gọi điện CSKH, đơn phải sửa) trước khối Phản hồi KH. `docs/specs/M16-03-dashboard-cskh-stats.md`
- `[x]` M16-04 — Dòng hàng: trường "Ghi doanh số" (NV ghi nhận doanh số/dòng, có thể để trống). `docs/specs/M16-04-order-line-credited-employee.md`
- `[x]` M16-05 — Báo cáo "Doanh thu theo nhân viên": đổi tính theo dòng hàng (Ghi doanh số), thay Q88/Q96 cho báo cáo này. Phụ thuộc M16-04. `docs/specs/M16-05-revenue-by-employee-line-based.md`
- `[x]` M16-06 — Báo cáo "Doanh thu theo khách hàng": cột "người bán" đổi tính theo dòng hàng. Phụ thuộc M16-04. `docs/specs/M16-06-revenue-by-customer-line-based.md`

## M14 — Vận hành / sửa đổi nhỏ (chưa bắt đầu)
- `[x]` M14-01 — Giảm số bản backup giữ lại từ 14 xuống **2 bản gần nhất** cho `db-*.dump`/`uploads-*.tar.gz` (`scripts/backup.sh`, `KEEP`); image tag trên Mac/server giữ 2 bản đã là hướng dẫn thủ công có sẵn ở `docs/architecture/DEPLOYMENT.md` §7.1. Quyết định của chủ dự án (2026-10-21). Spec `M9-02` đã cập nhật. (PR #132)
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
