# M21-02a — API: "Báo cáo KPI" doanh số theo tháng + KPI của tôi

- **Status:** Approved (2026-11-01, chủ dự án chốt Q146–Q156)
- **Backlog:** M21-02a · **Milestone:** M21
- **Phụ thuộc:** M21-01a (chỉ tiêu), M16-04/M16-05 (doanh số theo dòng hàng `credited_employee_id`), M16-08 (nhóm SP/DV của đơn `orders.division_id`)
- **Liên quan:** spec/permissions.yaml#report.kpi_sales.read (mới), #profile.manage

## 1. Mục tiêu
Là Manager, tôi muốn xem theo tháng mỗi nhân viên bán được bao nhiêu (Tổng doanh số), lợi nhuận bao nhiêu (Doanh thu thuần) so với Mục tiêu, để đánh giá KPI. Mỗi nhân viên cũng tự xem được KPI của mình.

## 2. Phạm vi
- Trong phạm vi:
  - `GET /reports/kpi-sales?month=YYYY-MM&department_id=&group_id=&employee_id=` (mặc định tháng hiện tại theo giờ VN).
  - Dữ liệu tính: các dòng hàng của đơn **`COMPLETED` có `completed_at` trong tháng** (giờ `Asia/Ho_Chi_Minh`), nhóm theo `order_lines.credited_employee_id` — đúng trục của M16-05.
    - **Tổng doanh số** = Σ `line_total`.
    - **Doanh thu thuần** = Σ (`line_total − cost_price_snapshot × quantity`) — cùng công thức `profit` của M16-05; nhân viên có ≥1 dòng thiếu `cost_price_snapshot` → `net_revenue=null`.
    - **Mục tiêu** = `employee_kpi_targets.net_revenue_target` của tháng đó (hoặc `null`).
    - **Tỷ lệ đạt (%)** = `net_revenue / target × 100`, làm tròn 1 chữ số thập phân; `null` khi target `null`/`0` hoặc net_revenue `null`. Có thể > 100 hoặc âm.
  - Dòng hiện ra: nhân viên **có chỉ tiêu trong tháng HOẶC có doanh số trong tháng** (sau khi áp lọc). Dòng không ghi doanh số cho ai không vào báo cáo này.
  - `group_id`: chỉ tính dòng hàng của đơn có `orders.division_id = group_id`. Khi lọc nhóm, nhân viên chỉ có chỉ tiêu mà không có doanh số trong nhóm vẫn hiện (doanh số 0), mục tiêu vẫn là chỉ tiêu tổng.
  - Sắp theo mã NV tăng; `stt` đánh từ 1 theo thứ tự đó; có dòng tổng (`totals`).
  - `GET /reports/kpi-sales/export` — CSV UTF-8 BOM, chống CSV injection (như M8-04), tên `bao-cao-kpi-{YYYY-MM}.csv`.
  - `GET /me/kpi-sales?month=YYYY-MM` — một dòng của chính người gọi (mọi vai trò có `profile.manage`), không lọc nhóm.
  - Capability mới `report.kpi_sales.read: { MANAGER: all }`.
- Ngoài phạm vi: UI (M21-02b); báo cáo "Công việc theo nhân viên" (KPI cũ) giữ nguyên API.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-072 | Tháng 11/2026: đơn A (COMPLETED 05/11) dòng ghi Hoa 100tr, giá vốn 80tr; đơn B (COMPLETED 20/11) dòng ghi Hoa 30tr, giá vốn 25tr. Chỉ tiêu Hoa 11/2026 = 20tr | An (MANAGER) `GET /reports/kpi-sales?month=2026-11` | Dòng Hoa: `stt=1, employee_code="NV005", total_sales=130000000, net_revenue=25000000, target=20000000, achievement_pct=125.0` | integration |
| AC-RPT-073 | Đơn C hoàn tất 31/10/2026 23:30 giờ VN (= 16:30 UTC 31/10); đơn D hoàn tất 01/11/2026 00:10 giờ VN (= 17:10 UTC 31/10) | `month=2026-11` | Chỉ đơn D được tính | integration |
| AC-RPT-074 | Đơn E ghi Hoa, đang `IN_PROGRESS`; đơn F `CANCELLED` | `month=2026-11` | Không tính E, F | integration |
| AC-RPT-075 | Tuấn có chỉ tiêu 11/2026 = 15tr, không có doanh số | `month=2026-11` | Dòng Tuấn `total_sales=0, net_revenue=0, target=15000000, achievement_pct=0.0` | integration |
| AC-RPT-076 | Ngọc có doanh số 10tr, không có chỉ tiêu | `month=2026-11` | Dòng Ngọc `target=null, achievement_pct=null` | integration |
| AC-RPT-077 | Hoa có 1 dòng thiếu `cost_price_snapshot` | `month=2026-11` | Dòng Hoa `net_revenue=null, achievement_pct=null`; `total_sales` vẫn đúng | integration |
| AC-RPT-078 | Đơn A thuộc nhóm "Thiết bị an ninh", đơn B thuộc "Thiết bị văn phòng" | `group_id=<An ninh>` | Dòng Hoa `total_sales=100000000, net_revenue=20000000`, `target=20000000`, `achievement_pct=100.0` | integration |
| AC-RPT-079 | Hoa phòng "Phát Triển Kinh Tế", Ngọc phòng "Kế Toán - Tài chính" | `department_id=<PTKT>` / `employee_id=<Ngọc>` | Lần 1 chỉ Hoa (+ NV khác cùng phòng); lần 2 chỉ Ngọc | integration |
| AC-RPT-080 | Dữ liệu AC-072/075/076 | GET | `totals = { total_sales, net_revenue, target }` = tổng các dòng (dòng `null` không cộng; nếu có dòng `net_revenue=null` thì `totals.net_revenue` vẫn cộng các dòng còn lại và `totals.has_missing_cost=true`) | integration |
| AC-RPT-081 | — | `month=2026-13`, `month=11-2026` | 422 | integration |
| AC-RPT-082 | Đăng nhập SALE, CUSTOMER_CARE, TECH_LEAD, TECHNICIAN | `GET /reports/kpi-sales` hoặc `/export` | 403 | integration |
| AC-RPT-083 | Như AC-072 | An `GET /reports/kpi-sales/export?month=2026-11` | 200 CSV BOM, tên `bao-cao-kpi-2026-11.csv`, cột: STT, Mã NV, Họ tên, Tổng doanh số, Doanh thu thuần, Mục tiêu, Tỷ lệ đạt (%); tên NV bắt đầu bằng `=` được thoát | integration |
| AC-RPT-084 | Như AC-072, Hoa (SALE) đăng nhập | Hoa `GET /me/kpi-sales?month=2026-11` | 200 `{ month:"2026-11", total_sales:130000000, net_revenue:25000000, target:20000000, achievement_pct:125.0 }` | integration |
| AC-RPT-085 | Khang (TECHNICIAN) không có doanh số, không có chỉ tiêu | Khang `GET /me/kpi-sales` (không truyền month, hôm nay 01/11/2026) | 200 `{ month:"2026-11", total_sales:0, net_revenue:0, target:null, achievement_pct:null }` | integration |
| AC-RPT-086 | — | `/me/kpi-sales` không có `employee_id` trong tham số; truyền `employee_id=<Tuấn>` | Tham số bị bỏ qua, luôn trả của chính người gọi | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/reports/kpi-sales | report.kpi_sales.read | `month?`, `department_id?`, `group_id?`, `employee_id?` | `KpiSalesReportOut { month, rows: [{ stt, employee_id, employee_code, employee_name, department_name, total_sales, net_revenue\|null, target\|null, achievement_pct\|null }], totals }` | 403, 422 |
| GET | /api/v1/reports/kpi-sales/export | report.kpi_sales.read | như trên | `text/csv` | 403, 422 |
| GET | /api/v1/me/kpi-sales | profile.manage (self) | `month?` | `MyKpiSalesOut` | 422 |

## 5. Dữ liệu / Migration
Không có bảng mới (dùng `employee_kpi_targets` của M21-01a). Có thể cần index `orders (status, completed_at)` nếu chưa có — kiểm khi implement.

## 6. UI
Không có (M21-02b).

## 7. Kịch bản UAT thủ công
Kiểm qua UI ở M21-02b.

## 8. Giả định & câu hỏi
- Chốt 2026-11-01: chỉ tính đơn **hoàn tất trong tháng** (theo `completed_at`).
- "Doanh thu thuần" = tổng lợi nhuận ghi nhận cho nhân viên (theo yêu cầu); "Tổng doanh số" = tổng thành tiền dòng hàng.
- Giả định (Q149): "nhóm dịch vụ" = nhóm SP/DV của **đơn** (`orders.division_id`, "Phòng phụ trách" M16-08), không phải nhóm của từng sản phẩm trên dòng.
- Giả định (Q150): chỉ **Manager** xem báo cáo KPI toàn công ty; nhân viên khác chỉ xem KPI của mình ở "Thông tin tài khoản".
- Diff YAML đề xuất:
  ```yaml
  report.kpi_sales.read: { MANAGER: all }   # M21-02a
  # menu reports.children: đổi nhãn reports-kpi, thêm mục mới ngay sau
  - { id: reports-kpi,       label: Công việc theo nhân viên, icon: BarChart3, path: /reports/kpi,       capability: kpi.read }
  - { id: reports-kpi-sales, label: Báo cáo KPI,              icon: Target,    path: /reports/kpi-sales, capability: report.kpi_sales.read }
  ```
