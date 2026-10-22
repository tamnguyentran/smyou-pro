# M15-09a — Báo cáo Doanh thu theo khách hàng — API

- **Status:** Approved
- **Backlog:** M15-09a · **Milestone:** M15
- **Liên quan:** M15-07/08 (`cost_price`, `cost_price_snapshot` dùng tính lợi nhuận); `docs/specs/M8-01a-kpi-report-api.md` (mẫu báo cáo + export CSV UTF-8 BOM, tái dùng cách làm); `spec/state_machines.yaml#order.states`; `spec/permissions.yaml`

## 1. Mục tiêu
Là Manager/Sale/QLKT/CSKH, tôi muốn xem báo cáo doanh thu nhóm theo từng khách hàng trong khoảng thời gian chọn, xem chi tiết từng đơn và dòng hàng, và xuất file để đối chiếu.

## 2. Phạm vi
- Trong phạm vi:
  - Capability mới `report.revenue.read` — `MANAGER: all, SALE: own, TECH_LEAD: all, CUSTOMER_CARE: own` (quyết định chủ dự án Q88, 2026-10-23 — `docs/product/OPEN_QUESTIONS_ARCHIVE.md`).
    - `own` cho **SALE** = chỉ đơn có `orders.created_by = tôi` (và khách hàng của các đơn đó).
    - `own` cho **CUSTOMER_CARE**: chưa có trường "CSKH phụ trách" trên `orders`/`customers` — xem giả định §8 (Q96, câu hỏi mới) đề xuất mặc định `customers.created_by = tôi`.
  - `GET /api/v1/reports/revenue-by-customer?from=&to=&customer_id=&status=` —
    - `from`/`to`: mặc định `from` = ngày 1 tháng hiện tại, `to` = hôm nay (giờ VN).
    - `customer_id`: mặc định "Tất cả" (bỏ trống = tất cả khách hàng có đơn trong khoảng, trong phạm vi scope của người gọi).
    - `status`: `COMPLETED` (mặc định) hoặc `NOT_COMPLETED` (= `PENDING_DISPATCH, IN_PROGRESS, AWAITING_CONFIRMATION, REVISION` — **không gồm `DRAFT` và không gồm `CANCELLED`**, theo Q88: đơn đã huỷ loại khỏi cả 2 nhóm trạng thái của báo cáo này).
    - Mỗi dòng là 1 cặp **(khách hàng × người bán)**: `{customer_code, customer_name, contact_person, contact_phone, seller:{id,code,full_name}, order_count, subtotal_revenue (Σ total), profit (Σ (line_total − cost_price_snapshot×quantity) các dòng, null nếu có dòng thiếu `cost_price_snapshot`)}`, sắp theo `customer_code` tăng rồi `seller.full_name` tăng.
    - Khách hàng có nhiều Sale tạo đơn trong khoảng lọc → **tách thành nhiều dòng**, mỗi dòng 1 người bán (Q88 — không gộp "người bán gần nhất").
  - `GET /api/v1/reports/revenue-by-customer/{customer_id}/orders?from=&to=&status=&seller_id=` — danh sách đơn của 1 khách hàng trong cùng điều kiện (dùng cho drilldown cấp 1); `seller_id` tuỳ chọn để khớp đúng 1 dòng (khách hàng × người bán) đã bấm vào.
  - `GET /api/v1/orders/{id}/lines` (đã có, M3-02a) — dùng cho drilldown cấp 2 (dòng hàng của 1 đơn), không cần route mới.
  - `GET /api/v1/reports/revenue-by-customer/export?...` — CSV UTF-8 BOM, cùng cột, theo mẫu `kpi/report/export` (M8-01a).
  - Mọi route trên áp dụng scope `own`/`all` theo capability — SALE/CUSTOMER_CARE gọi `customer_id` ngoài phạm vi `own` của mình → 404 (không lộ tồn tại khách hàng ngoài scope).
- Ngoài phạm vi: UI (M15-09b); báo cáo theo nhân viên (M15-10a, cũng cần áp lại Q88 — chưa làm ở item này).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-001 | KH `KH00001` có 2 đơn `COMPLETED` do Hoa (SALE) tạo (tổng `total` = 30.000.000, lợi nhuận = 8.000.000) + 1 đơn `COMPLETED` do Minh (SALE) tạo (`total` = 20.000.000, lợi nhuận = 4.000.000); KH `KH00002` có 1 đơn `COMPLETED` do Hoa tạo | An (MANAGER) `GET /reports/revenue-by-customer` (không truyền filter) | 200; áp mặc định `from`=đầu tháng, `to`=hôm nay, `status=COMPLETED`; 3 dòng (scope `all`, tách theo người bán): `KH00001`+Hoa (`order_count=2, subtotal_revenue=30000000, profit=8000000`), `KH00001`+Minh (`order_count=1, subtotal_revenue=20000000, profit=4000000`), `KH00002`+Hoa — sắp theo `customer_code` rồi `seller.full_name` | integration |
| AC-RPT-002 | Đơn có dòng hàng `cost_price_snapshot = null` (tạo trước M15-08) | gọi báo cáo | Dòng khách hàng×người bán tương ứng có `profit = null` (không tính được, không coi bằng 0) | integration |
| AC-RPT-003 | KH `KH00003` có đơn `PENDING_DISPATCH` và đơn `CANCELLED`, không có đơn `COMPLETED` | gọi `?status=NOT_COMPLETED` | `KH00003` xuất hiện với `order_count=1` (chỉ đơn `PENDING_DISPATCH`); đơn `CANCELLED` **không** được tính (Q88); không gồm đơn `DRAFT` | integration |
| AC-RPT-004 | — | gọi `?customer_id=<KH00001>` | Chỉ (các) dòng của `KH00001` (1 dòng/người bán) | integration |
| AC-RPT-005 | Hoa (SALE), dữ liệu như AC-RPT-001 | `GET /reports/revenue-by-customer` | 200 — chỉ 2 dòng do Hoa tạo (`KH00001`+Hoa, `KH00002`+Hoa); **không** thấy dòng `KH00001`+Minh (scope `own` theo Q88) | integration |
| AC-RPT-006 | Đức (TECHNICIAN, không có `report.revenue.read`) | `GET /reports/revenue-by-customer` | 403 | integration |
| AC-RPT-007 | Dữ liệu như AC-RPT-001 | An (MANAGER) `GET /reports/revenue-by-customer/<KH00001-id>/orders?seller_id=<Hoa-id>` | 200; 2 đơn (chỉ của Hoa), mỗi đơn `{code, created_at, completed_at, total, profit}` | integration |
| AC-RPT-008 | — | `GET /reports/revenue-by-customer/export?from=&to=` | 200; `Content-Type: text/csv; charset=utf-8`, BOM đầu file, `Content-Disposition` có tên file `doanh-thu-theo-khach-hang-{from}_{to}.csv`, cột khớp 1:1 với JSON | integration |
| AC-RPT-043 | Hoa (SALE), KH `KH00004` chỉ có đơn do Minh tạo (không có đơn nào của Hoa) | Hoa `GET /reports/revenue-by-customer/<KH00004-id>/orders` | 404 (khách hàng ngoài scope `own` của Hoa — không lộ tồn tại) | integration |
| AC-RPT-044 | Lan (CUSTOMER_CARE) tạo hồ sơ khách hàng `KH00005` (`customers.created_by = Lan`), `KH00005` có 1 đơn `COMPLETED` do Hoa (SALE) tạo | Lan `GET /reports/revenue-by-customer` | 200 — thấy dòng `KH00005` (vì `customers.created_by = Lan`, theo giả định §8/Q96), dù người bán là Hoa; không thấy khách hàng do người khác tạo | integration |

## 4. API
| Method | Path | Capability | Response |
|---|---|---|---|
| GET | /api/v1/reports/revenue-by-customer | report.revenue.read | `{items:[...], total}` |
| GET | /api/v1/reports/revenue-by-customer/{customer_id}/orders | report.revenue.read | `[{order summary}]` |
| GET | /api/v1/reports/revenue-by-customer/export | report.revenue.read | `text/csv` |

## 5. Dữ liệu / Migration
Không có migration — truy vấn tổng hợp từ `orders`/`order_lines`/`customers` đã có (+ `cost_price_snapshot` từ M15-08).

## 6. UI
Không có ở item này — xem M15-09b.

## 7. Kịch bản UAT thủ công
1. Gọi báo cáo không filter (MANAGER) → thấy mặc định đầu tháng→hôm nay, trạng thái Hoàn tất, khách hàng nhiều Sale tách nhiều dòng.
2. Đổi `status=NOT_COMPLETED` → thấy đơn các trạng thái khác (trừ `DRAFT`, trừ `CANCELLED`).
3. Đăng nhập Sale → chỉ thấy khách hàng/đơn do chính mình tạo.
4. Drilldown 1 dòng (khách hàng × người bán) → thấy danh sách đơn đúng người bán đó → export CSV mở bằng Excel đọc đúng dấu.

## 8. Giả định & câu hỏi
- **Đã chốt (Q88, 2026-10-23):** scope `own` cho SALE/CUSTOMER_CARE, `all` cho MANAGER/TECH_LEAD; khách hàng nhiều người bán → tách nhiều dòng; `CANCELLED` loại khỏi cả 2 nhóm trạng thái. Áp dụng trong spec này — xem `docs/product/OPEN_QUESTIONS_ARCHIVE.md#Q88`.
- **Q96 (mới — cần chủ dự án xác nhận):** `own` cho CUSTOMER_CARE là gì? `orders` không có cột "CSKH phụ trách"; `customers.created_by` thì có (CSKH được tạo/sửa khách hàng qua `customer.manage`). Giả định mặc định: `own` của CUSTOMER_CARE = khách hàng có `customers.created_by = tôi` (bất kể Sale nào tạo đơn cho khách đó) — đã đăng ký vào `docs/product/OPEN_QUESTIONS.md`.
- Giả định: "lợi nhuận" = Σ(`line_total` − `cost_price_snapshot` × `quantity`) của mọi dòng hàng thuộc các đơn trong kết quả — chưa trừ chi phí vận hành khác (lương, vận chuyển…), chỉ là lợi nhuận gộp trên giá vốn hàng/dịch vụ.
- M15-10a (báo cáo theo nhân viên) cần áp lại quyết định Q88 tương tự khi viết spec của nó — chưa làm ở item này.
