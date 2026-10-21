# M15-09a — Báo cáo Doanh thu theo khách hàng — API

- **Status:** Draft
- **Backlog:** M15-09a · **Milestone:** M15
- **Liên quan:** M15-07/08 (`cost_price`, `cost_price_snapshot` dùng tính lợi nhuận); `docs/specs/M8-01a-kpi-report-api.md` (mẫu báo cáo + export CSV UTF-8 BOM, tái dùng cách làm); `spec/state_machines.yaml#order.states`; `spec/permissions.yaml`

## 1. Mục tiêu
Là Manager/Sale/QLKT/CSKH, tôi muốn xem báo cáo doanh thu nhóm theo từng khách hàng trong khoảng thời gian chọn, xem chi tiết từng đơn và dòng hàng, và xuất file để đối chiếu.

## 2. Phạm vi
- Trong phạm vi:
  - Capability mới `report.revenue.read` — `MANAGER: all, SALE: all, TECH_LEAD: all, CUSTOMER_CARE: all` (xem §8 — giả định cả 4 vai trò thấy dữ liệu **toàn công ty**, không giới hạn theo người tạo đơn).
  - `GET /api/v1/reports/revenue-by-customer?from=&to=&customer_id=&status=` —
    - `from`/`to`: mặc định `from` = ngày 1 tháng hiện tại, `to` = hôm nay (giờ VN).
    - `customer_id`: mặc định "Tất cả" (bỏ trống = tất cả khách hàng có đơn trong khoảng).
    - `status`: `COMPLETED` (mặc định) hoặc `NOT_COMPLETED` (= mọi trạng thái khác `DRAFT`/`COMPLETED`, tức `PENDING_DISPATCH, IN_PROGRESS, AWAITING_CONFIRMATION, REVISION, CANCELLED` — xem giả định §8).
    - Mỗi dòng: `{customer_code, customer_name, contact_person, contact_phone, seller:{id,code,full_name}, order_count, subtotal_revenue (Σ total), profit (Σ (line_total − cost_price_snapshot×quantity) các dòng, null nếu có dòng thiếu `cost_price_snapshot`)}`, sắp theo `customer_code` tăng.
    - `seller` trong context báo cáo gộp theo khách hàng có thể có nhiều Sale tạo đơn khác nhau — mỗi khách hàng có thể xuất hiện ở báo cáo với **người bán của đơn gần nhất** (xem giả định §8) hoặc 1 dòng/khách hàng không phân biệt theo người bán — quyết định ở §8.
  - `GET /api/v1/reports/revenue-by-customer/{customer_id}/orders?from=&to=&status=` — danh sách đơn của 1 khách hàng trong cùng điều kiện (dùng cho drilldown cấp 1).
  - `GET /api/v1/orders/{id}/lines` (đã có, M3-02a) — dùng cho drilldown cấp 2 (dòng hàng của 1 đơn), không cần route mới.
  - `GET /api/v1/reports/revenue-by-customer/export?...` — CSV UTF-8 BOM, cùng cột, theo mẫu `kpi/report/export` (M8-01a).
- Ngoài phạm vi: UI (M15-09b); báo cáo theo nhân viên (M15-10a).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-001 | KH `KH00001` có 3 đơn `COMPLETED` trong tháng (tổng `total` = 50.000.000, lợi nhuận tính được = 12.000.000); KH `KH00002` có 1 đơn `COMPLETED` | An (MANAGER) `GET /reports/revenue-by-customer` (không truyền filter) | 200; áp mặc định `from`=đầu tháng, `to`=hôm nay, `status=COMPLETED`; 2 dòng, sắp theo `customer_code`; dòng `KH00001` có `order_count=3, subtotal_revenue=50000000, profit=12000000` | integration |
| AC-RPT-002 | Đơn có dòng hàng `cost_price_snapshot = null` (tạo trước M15-08) | gọi báo cáo | Dòng khách hàng tương ứng có `profit = null` (không tính được, không coi bằng 0) | integration |
| AC-RPT-003 | KH `KH00003` có đơn `PENDING_DISPATCH`, `CANCELLED`, không có đơn `COMPLETED` | gọi `?status=NOT_COMPLETED` | `KH00003` xuất hiện, `order_count` gồm cả đơn `CANCELLED` (theo giả định §8); không gồm đơn `DRAFT` | integration |
| AC-RPT-004 | — | gọi `?customer_id=<KH00001>` | Chỉ 1 dòng của `KH00001` | integration |
| AC-RPT-005 | Hoa (SALE) | `GET /reports/revenue-by-customer` | 200 — thấy **toàn bộ** khách hàng, không chỉ khách của đơn do Hoa tạo (scope `all`) | integration |
| AC-RPT-006 | Đức (TECHNICIAN, không có `report.revenue.read`) | `GET /reports/revenue-by-customer` | 403 | integration |
| AC-RPT-007 | Dữ liệu như AC-RPT-001 | `GET /reports/revenue-by-customer/<KH00001-id>/orders` | 200; 3 đơn, mỗi đơn `{code, created_at, completed_at, total, profit}` | integration |
| AC-RPT-008 | — | `GET /reports/revenue-by-customer/export?from=&to=` | 200; `Content-Type: text/csv; charset=utf-8`, BOM đầu file, `Content-Disposition` có tên file `doanh-thu-theo-khach-hang-{from}_{to}.csv`, cột khớp 1:1 với JSON | integration |

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
1. Gọi báo cáo không filter → thấy mặc định đầu tháng→hôm nay, trạng thái Hoàn tất.
2. Đổi `status=NOT_COMPLETED` → thấy đơn các trạng thái khác (trừ DRAFT), kể cả đã huỷ.
3. Drilldown 1 khách hàng → thấy danh sách đơn → export CSV mở bằng Excel đọc đúng dấu.

## 8. Giả định & câu hỏi (cần chủ dự án xác nhận — mức ảnh hưởng cao)
- **Phạm vi xem (scope):** mặc định cho SALE/CUSTOMER_CARE xem **toàn công ty** (không giới hạn `own`) vì yêu cầu gốc liệt kê đúng 4 vai trò này cùng nhìn 1 báo cáo có cột "Người bán" — nếu SALE chỉ thấy đơn của mình thì cột "Người bán" luôn là chính họ, vô nghĩa. Nếu chủ dự án muốn giới hạn SALE chỉ thấy khách hàng/đơn của mình → cần sửa lại capability thành `SALE: own` và bỏ cột "Người bán" khỏi góc nhìn của SALE.
- **"Người bán" khi 1 khách hàng có nhiều đơn do nhiều Sale khác nhau tạo:** giả định báo cáo này nhóm theo khách hàng nên cột "Người bán" lấy theo **đơn gần nhất** (`created_at` lớn nhất) của khách đó trong khoảng lọc; nếu chủ dự án muốn hiểu khác (vd liệt kê nhiều người bán, hoặc đây thực ra là 1 dòng/khách-hàng-×-người-bán) cần chốt lại trước khi code.
- **`CANCELLED` có tính vào "chưa xong":** mặc định **có** (bám sát câu chữ "các trạng thái còn lại trừ đơn nháp"). Nếu chủ dự án muốn báo cáo doanh thu loại trừ đơn đã huỷ khỏi cả 2 nhóm trạng thái → cần sửa lại enum `status` filter.
- Giả định: "lợi nhuận" = Σ(`line_total` − `cost_price_snapshot` × `quantity`) của mọi dòng hàng thuộc các đơn trong kết quả — chưa trừ chi phí vận hành khác (lương, vận chuyển…), chỉ là lợi nhuận gộp trên giá vốn hàng/dịch vụ.
