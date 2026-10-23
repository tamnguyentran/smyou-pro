# M15-10a — Báo cáo Doanh thu theo nhân viên — API

- **Status:** Draft
- **Backlog:** M15-10a · **Milestone:** M15
- **Liên quan:** M15-09a (cùng cấu trúc/điều kiện, chỉ đổi chiều nhóm); M15-07/08 (`cost_price_snapshot`)

## 1. Mục tiêu
Là Manager/Sale/QLKT/CSKH, tôi muốn xem báo cáo doanh thu nhóm theo từng nhân viên bán hàng (người tạo đơn) để biết ai đang bán tốt, lợi nhuận đem về bao nhiêu.

## 2. Phạm vi
- Trong phạm vi (giống hệt M15-09a, chỉ đổi trục nhóm từ khách hàng → nhân viên; **áp lại Q88/Q96** — xem `docs/product/OPEN_QUESTIONS_ARCHIVE.md#Q88`/`#Q96`, đã chốt chung cho cả 2 báo cáo doanh thu):
  - Dùng chung capability `report.revenue.read` (đã khai ở M15-09a, không khai lại) — `MANAGER: all, SALE: own, TECH_LEAD: all, CUSTOMER_CARE: own`, `own` = `orders.created_by = tôi` cho cả SALE và CUSTOMER_CARE.
  - `GET /api/v1/reports/revenue-by-employee?from=&to=&employee_id=&status=` — `employee_id` mặc định "Tất cả"; mỗi dòng `{employee_code, employee_name, order_count, subtotal_revenue, profit}`, sắp theo `employee_code` tăng. `employee` = `orders.created_by`. `status`: `COMPLETED` (mặc định) hoặc `NOT_COMPLETED` (= `PENDING_DISPATCH, IN_PROGRESS, AWAITING_CONFIRMATION, REVISION` — không gồm `DRAFT`, không gồm `CANCELLED`, theo Q88).
    - Vì scope `own` lọc theo chính `orders.created_by` — trục nhóm cũng là `orders.created_by` — nên SALE/CUSTOMER_CARE gọi báo cáo này **chỉ có thể thấy dòng của chính mình** (hệ quả tự nhiên của Q88, không phải lỗi).
  - `GET /api/v1/reports/revenue-by-employee/{employee_id}/orders?from=&to=&status=` — drilldown cấp 1 (đơn do nhân viên đó tạo); áp scope `own`/`all` như trên — SALE/CUSTOMER_CARE gọi `employee_id` khác chính mình → 404 (không lộ tồn tại).
  - Drilldown cấp 2 dùng lại `GET /orders/{id}/lines` như M15-09a.
  - `GET /api/v1/reports/revenue-by-employee/export?...` — CSV UTF-8 BOM, cùng mẫu M8-01a/M15-09a.
- Ngoài phạm vi: UI (M15-10b).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-020 | Hoa (NV005, SALE) tạo 4 đơn `COMPLETED` tháng này (tổng `total`=80.000.000, lợi nhuận=20.000.000); An (NV001, SALE) tạo 1 đơn | An (MANAGER) `GET /reports/revenue-by-employee` | 200; mặc định đầu tháng→hôm nay, `status=COMPLETED`; 2 dòng sắp theo mã NV (scope `all`); dòng `NV005` có `order_count=4, subtotal_revenue=80000000, profit=20000000` | integration |
| AC-RPT-021 | Dữ liệu như AC-RPT-020 | An (MANAGER) `?employee_id=<Hoa-id>` | Chỉ 1 dòng của Hoa | integration |
| AC-RPT-022 | Lan (CUSTOMER_CARE) tự tạo 2 đơn `COMPLETED` (đóng vai sale, theo M15-01) | An (MANAGER) `GET /reports/revenue-by-employee` | Lan xuất hiện như 1 dòng nhân viên có đơn, dữ liệu đúng (CSKH cũng nằm trong trục nhóm vì cũng tạo được đơn) | integration |
| AC-RPT-046 | Dữ liệu như AC-RPT-020 | Hoa (SALE) `GET /reports/revenue-by-employee` | 200 — **chỉ 1 dòng** của chính Hoa (`NV005`); **không** thấy dòng của An (scope `own` theo Q88 — hệ quả: SALE chỉ thấy chính mình ở báo cáo này) | integration |
| AC-RPT-047 | Dữ liệu như AC-RPT-020 | Hoa (SALE) `GET /reports/revenue-by-employee/<An-id>/orders` | 404 (nhân viên khác ngoài scope `own` của Hoa — không lộ tồn tại) | integration |
| AC-RPT-048 | KH có đơn `PENDING_DISPATCH` và đơn `CANCELLED` cùng do Hoa tạo, không có đơn `COMPLETED` | An (MANAGER) `?status=NOT_COMPLETED` | Dòng Hoa có `order_count=1` (chỉ đơn `PENDING_DISPATCH`); đơn `CANCELLED` **không** tính (Q88); không gồm `DRAFT` | integration |
| AC-RPT-049 | Đức (TECHNICIAN, không có `report.revenue.read`) | `GET /reports/revenue-by-employee` | 403 | integration |
| AC-RPT-024 | Dữ liệu như AC-RPT-020 | An (MANAGER) `GET /reports/revenue-by-employee/<Hoa-id>/orders` | 200; danh sách đơn do Hoa tạo trong khoảng lọc | integration |
| AC-RPT-025 | — | An (MANAGER) `GET /reports/revenue-by-employee/export?...` | 200 CSV UTF-8 BOM, đúng tên file `doanh-thu-theo-nhan-vien-{from}_{to}.csv` | integration |

## 4. API
| Method | Path | Capability | Response |
|---|---|---|---|
| GET | /api/v1/reports/revenue-by-employee | report.revenue.read | `{items:[...], total}` |
| GET | /api/v1/reports/revenue-by-employee/{employee_id}/orders | report.revenue.read | `[{order summary}]` |
| GET | /api/v1/reports/revenue-by-employee/export | report.revenue.read | `text/csv` |

## 5. Dữ liệu / Migration
Không có — truy vấn tổng hợp, không bảng mới.

## 6. UI
Không có ở item này — xem M15-10b.

## 7. Kịch bản UAT thủ công
1. Gọi báo cáo không filter → đúng mặc định, nhóm theo nhân viên.
2. Lọc 1 nhân viên cụ thể → đúng 1 dòng.
3. Export CSV → đúng cột, đúng dữ liệu.

## 8. Giả định & câu hỏi
- **Đã chốt (Q88/Q96, 2026-10-23):** áp lại nguyên văn quyết định của M15-09a — scope `own` (SALE/CUSTOMER_CARE) / `all` (MANAGER/TECH_LEAD); `own` = `orders.created_by = tôi`; `CANCELLED` loại khỏi cả 2 nhóm trạng thái. Xem `docs/product/OPEN_QUESTIONS_ARCHIVE.md#Q88`/`#Q96`. Cách tính "lợi nhuận" cũng giống M15-09a §8 (lợi nhuận gộp, chưa trừ chi phí vận hành khác).
- Hệ quả riêng của báo cáo này (không có ở M15-09a): vì trục nhóm = `orders.created_by` và scope `own` cũng lọc theo `orders.created_by`, SALE/CUSTOMER_CARE xem báo cáo "theo nhân viên" sẽ **chỉ thấy đúng 1 dòng của chính mình** — không xem được số liệu của đồng nghiệp. Đây là hệ quả tự nhiên của Q88 áp cho báo cáo có trục nhóm = người tạo đơn, không phải giả định mới; nếu chủ dự án muốn khác (ví dụ chỉ MANAGER/TECH_LEAD mới được xem báo cáo này) cần quyết định riêng — tạm coi là có thể chấp nhận được vì không sai dữ liệu, chỉ hạn chế hữu ích với SALE/CUSTOMER_CARE.
- Giả định: nhân viên đã bị khoá (`is_active=false`) nhưng từng tạo đơn trong khoảng lọc vẫn xuất hiện trong báo cáo (dữ liệu lịch sử không biến mất khi khoá tài khoản) — cùng nguyên tắc với `M8-01a` (báo cáo KPI).
