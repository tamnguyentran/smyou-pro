# M15-10a — Báo cáo Doanh thu theo nhân viên — API

- **Status:** Draft
- **Backlog:** M15-10a · **Milestone:** M15
- **Liên quan:** M15-09a (cùng cấu trúc/điều kiện, chỉ đổi chiều nhóm); M15-07/08 (`cost_price_snapshot`)

## 1. Mục tiêu
Là Manager/Sale/QLKT/CSKH, tôi muốn xem báo cáo doanh thu nhóm theo từng nhân viên bán hàng (người tạo đơn) để biết ai đang bán tốt, lợi nhuận đem về bao nhiêu.

## 2. Phạm vi
- Trong phạm vi (giống hệt M15-09a, chỉ đổi trục nhóm từ khách hàng → nhân viên):
  - `GET /api/v1/reports/revenue-by-employee?from=&to=&employee_id=&status=` — `employee_id` mặc định "Tất cả"; mỗi dòng `{employee_code, employee_name, order_count, subtotal_revenue, profit}`, sắp theo `employee_code` tăng. `employee` = `orders.created_by`.
  - `GET /api/v1/reports/revenue-by-employee/{employee_id}/orders?from=&to=&status=` — drilldown cấp 1 (đơn của nhân viên đó).
  - Drilldown cấp 2 dùng lại `GET /orders/{id}/lines` như M15-09a.
  - `GET /api/v1/reports/revenue-by-employee/export?...` — CSV UTF-8 BOM, cùng mẫu M8-01a/M15-09a.
  - Dùng chung capability `report.revenue.read` (đã khai ở M15-09a, không khai lại).
- Ngoài phạm vi: UI (M15-10b).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-020 | Hoa (NV005) tạo 4 đơn `COMPLETED` tháng này (tổng `total`=80.000.000, lợi nhuận=20.000.000); An (NV001) tạo 1 đơn | An (MANAGER) `GET /reports/revenue-by-employee` | 200; mặc định đầu tháng→hôm nay, `status=COMPLETED`; 2 dòng sắp theo mã NV; dòng `NV005` có `order_count=4, subtotal_revenue=80000000, profit=20000000` | integration |
| AC-RPT-021 | — | `?employee_id=<Hoa-id>` | Chỉ 1 dòng của Hoa | integration |
| AC-RPT-022 | Lan (CUSTOMER_CARE) tự tạo 2 đơn (đóng vai sale, theo M15-01) | `GET /reports/revenue-by-employee` | Lan xuất hiện như 1 nhân viên có đơn, dữ liệu đúng | integration |
| AC-RPT-023 | Hoa (SALE) | `GET /reports/revenue-by-employee` | 200 — thấy **toàn bộ** nhân viên (scope `all`, giống M15-09a), không chỉ dữ liệu của chính mình | integration |
| AC-RPT-024 | — | `GET /reports/revenue-by-employee/<Hoa-id>/orders` | 200; danh sách đơn do Hoa tạo trong khoảng lọc | integration |
| AC-RPT-025 | — | `GET /reports/revenue-by-employee/export?...` | 200 CSV UTF-8 BOM, đúng tên file `doanh-thu-theo-nhan-vien-{from}_{to}.csv` | integration |

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
- Dùng chung giả định phạm vi xem (`scope: all` cho cả 4 vai trò) và cách tính "lợi nhuận" đã nêu ở M15-09a §8 — không lặp lại chi tiết, chỉ tham chiếu.
- Giả định: nhân viên đã bị khoá (`is_active=false`) nhưng từng tạo đơn trong khoảng lọc vẫn xuất hiện trong báo cáo (dữ liệu lịch sử không biến mất khi khoá tài khoản).
