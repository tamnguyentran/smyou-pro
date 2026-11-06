# M23a — API: "Biểu đồ kinh doanh" (3 nhóm số liệu), chỉ Manager

- **Status:** Approved (2026-11-04 — chủ dự án chạy `/implement`, chấp nhận mặc định Q165–Q172)
- **Backlog:** M23a · **Milestone:** M23 (tách từ M23: a = API, b = UI)
- **Phụ thuộc:** M16-05 (doanh số theo dòng hàng, công thức lợi nhuận), M16-08/M20-06 (`orders.division_id` — nhóm SP/DV), M21-01a/M21-02a (chỉ tiêu + tỷ lệ đạt KPI)
- **Liên quan:** spec/permissions.yaml#report.business_charts.read (mới), DOMAIN_MODEL §4 (customers.type), §6 (order_lines), §8–9 (tasks, assignments); Q157–Q161 (archive/open)

## 1. Mục tiêu
Là Manager, tôi muốn lấy số liệu tổng hợp theo kỳ (từ tháng – đến tháng) cho 3 nhóm biểu đồ — Kết quả kinh doanh, Bán hàng & sản phẩm, Nhân sự & KPI — để M23b vẽ biểu đồ ra quyết định.

## 2. Phạm vi
- Trong phạm vi:
  - Capability mới `report.business_charts.read: { MANAGER: all }` + menu "Biểu đồ kinh doanh" trong nhóm "Báo cáo" (`/reports/business-charts`), nhãn quyền ở `permissionLabels.ts`, `PERMISSIONS.md` (quy tắc 13).
  - 3 endpoint đọc, cùng tham số kỳ `from=YYYY-MM&to=YYYY-MM` (giờ `Asia/Ho_Chi_Minh`). Mặc định `to` = tháng hiện tại, `from` = `to` − 11 tháng (12 tháng). `from > to` hoặc kỳ > 24 tháng → 422.
  - **Tập doanh thu** (dùng cho mọi số tiền): dòng hàng của đơn `COMPLETED` có `completed_at` trong kỳ — cùng trục với M21-02a.
    - Doanh thu dòng = `line_total`.
    - Giá vốn đơn vị = `cost_price_snapshot`; nếu `null` → `round_half_up(unit_price × 0,7)` (Q158). Không ghi đè dữ liệu đơn (Q165).
    - Lợi nhuận dòng = `line_total − giá vốn đơn vị × quantity` (làm tròn half-up về số nguyên VND). Có thể âm.
  - **`GET /reports/business-charts/results`** — Kết quả kinh doanh:
    - `monthly[]`: mỗi tháng trong kỳ (kể cả tháng 0 đồng) `{ month, revenue, profit }`.
    - `composition.by_group[]`: theo nhóm SP/DV của đơn (`orders.division_id`; `NULL` → "Chưa phân nhóm").
    - `composition.by_item[]`: theo SP/DV (khoá = `product_id`/`service_id`; dòng `CUSTOM` gộp theo `name_snapshot`), lấy 9 mục doanh thu cao nhất + 1 mục "Khác" gộp phần còn lại (Q166).
    - `composition.by_customer_type[]`: `INDIVIDUAL` "Cá nhân" / `COMPANY` "Tổ chức"; đơn khách lẻ (không `customer_id`) tính "Cá nhân" (Q167).
    - Mỗi phần tử composition: `{ key, label, revenue, profit }`; sắp doanh thu giảm dần.
    - `customers_monthly[]`: mỗi tháng `{ month, new_count, returning_count }` — tính trên đơn **đã gửi** (`submitted_at` trong tháng, không `CANCELLED`, không cần hoàn tất — Q159). Khách mới = đơn đã gửi sớm nhất của khách (mọi thời gian) rơi vào tháng đó; khách quay lại = có đơn trong tháng và đã có đơn đã gửi trước tháng đó. Đếm khách khác nhau; đơn khách lẻ không tính (Q168).
  - **`GET /reports/business-charts/sales?metric=revenue|profit`** (mặc định `revenue`) — Bán hàng & sản phẩm:
    - `pareto[]`: SP/DV (khoá như `by_item`, không gộp "Khác") có giá trị > 0, sắp giảm dần, `{ key, label, value, cumulative_pct, is_vital }` — `cumulative_pct` 1 chữ số thập phân; `is_vital = true` cho các mục từ đầu tới mục đầu tiên làm `cumulative_pct ≥ 80` (bao gồm mục đó). Mục ≤ 0 không vào Pareto (Q169).
    - `top_selling[]`: 10 SP/DV **danh mục** (bỏ `CUSTOM`) có tổng `quantity` cao nhất trong kỳ, `{ key, label, unit, quantity, revenue }`.
    - `slow_selling[]`: 10 SP/DV danh mục **đang hoạt động** có tổng `quantity` thấp nhất trong kỳ, gồm cả mục không bán (0) — sắp `quantity` tăng, rồi tên A→Z (Q157, Q170).
  - **`GET /reports/business-charts/staff`** — Nhân sự & KPI:
    - `hours_by_technician[]`: mỗi nhân viên có phân công `{ employee_id, employee_code, employee_name, assigned_hours, task_count }` — `assigned_hours` = Σ `tasks.estimated_hours` của phân công có `created_at` trong kỳ và trạng thái không phải `REJECTED`/`REMOVED`; sắp giờ giảm dần (Q171).
    - `kpi_completion`: `{ month, rows[] }` với `month = to`; `rows` = đúng các dòng của báo cáo KPI M21-02a cho tháng đó (`employee_*`, `net_revenue`, `target`, `achievement_pct`), sắp `achievement_pct` giảm dần, `null` xuống cuối (Q160).
- Ngoài phạm vi: UI/biểu đồ (M23b); xuất Excel biểu đồ; lọc phòng ban/nhân viên; cập nhật giá vốn dữ liệu cũ (Q161, M21-08).

## 3. Acceptance Criteria
Dữ liệu mẫu (giờ VN): kỳ `2026-09..2026-10`.
- DH2609-0011 (KH Tổ chức "Công ty TNHH Minh Phát", nhóm "Thiết bị văn phòng", COMPLETED 15/09): dòng máy in Canon LBP 2900 — `quantity 2`, `unit_price 3_500_000`, `line_total 7_000_000`, `cost_price_snapshot 2_800_000`.
- DH2610-0021 (KH Cá nhân "Nguyễn Thị Lan", nhóm "Thiết bị an ninh", COMPLETED 05/10): dòng camera Imou — `quantity 4`, `line_total 3_200_000`, `cost_price_snapshot 600_000`; dòng `CUSTOM` "Công đi dây" — `quantity 1`, `unit_price 500_000`, `line_total 500_000`, `cost_price_snapshot null`.
- DH2610-0022 (khách lẻ, không `customer_id`, nhóm "Kỹ thuật chung", IN_PROGRESS, gửi 20/10) — không vào tập doanh thu.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-100 | Dữ liệu mẫu; An (MANAGER) | `GET /reports/business-charts/results?from=2026-09&to=2026-10` | 200; `monthly` = `[{2026-09, revenue 7_000_000, profit 1_400_000}, {2026-10, revenue 3_700_000, profit 950_000}]` (dòng "Công đi dây": giá vốn = 350_000 → lợi nhuận 150_000) | integration |
| AC-RPT-101 | Dòng thiếu giá vốn `unit_price 333_333`, `quantity 3` | tính lợi nhuận | Giá vốn đơn vị = 233_333 (half-up 233_333,1); lợi nhuận = `line_total − 699_999`; số nguyên | unit |
| AC-RPT-102 | Kỳ `2026-07..2026-10`, không có đơn tháng 7, 8 | `GET .../results` | `monthly` có đủ 4 tháng theo thứ tự tăng; tháng 7, 8 `revenue 0, profit 0` | integration |
| AC-RPT-103 | Đơn COMPLETED lúc 30/09 23:30 giờ VN (= 16:30 UTC 30/09) và đơn COMPLETED 31/10 17:30 UTC (= 01/11 00:30 VN) | `GET .../results?from=2026-09&to=2026-10` | Đơn đầu vào tháng 2026-09; đơn sau không vào kỳ | integration |
| AC-RPT-104 | Dữ liệu mẫu | `GET .../results` | `composition.by_group` = "Thiết bị văn phòng" 7_000_000 rồi "Thiết bị an ninh" 3_700_000 (đơn không có nhóm → "Chưa phân nhóm"); không có "Kỹ thuật chung" (đơn chưa hoàn tất) | integration |
| AC-RPT-105 | 12 SP/DV khác nhau có doanh thu trong kỳ | `GET .../results` | `composition.by_item` có 10 phần tử: 9 mục cao nhất + `{key: "OTHER", label: "Khác"}` = tổng doanh thu/lợi nhuận 3 mục còn lại; Σ `by_item.revenue` = Σ `monthly.revenue` | integration |
| AC-RPT-106 | Dữ liệu mẫu + 1 đơn khách lẻ COMPLETED 10/10 doanh thu 1_000_000 | `GET .../results` | `by_customer_type`: `COMPANY` "Tổ chức" 7_000_000; `INDIVIDUAL` "Cá nhân" 4_700_000 | integration |
| AC-RPT-107 | Lan có đơn đã gửi đầu tiên 03/10; Minh Phát có đơn đã gửi 10/08 và 12/10; Lan có đơn thứ 2 gửi 25/10; Hùng chỉ có đơn gửi 15/10 rồi bị huỷ; khách lẻ gửi 20/10 | `GET .../results?from=2026-09&to=2026-10` | `customers_monthly` tháng 2026-10: `new_count 1` (Lan, đếm 1 lần), `returning_count 1` (Minh Phát); Hùng và khách lẻ không tính; tháng 2026-09: `0/0` | integration |
| AC-RPT-108 | Đơn DRAFT (chưa gửi) của khách mới "Trần Văn Bình" tạo 08/10 | `GET .../results` | Bình không có trong `new_count` | integration |
| AC-RPT-109 | 5 SP/DV doanh thu 50tr, 30tr, 10tr, 6tr, 4tr (tổng 100tr) + 1 mục lợi nhuận âm | `GET /reports/business-charts/sales?metric=revenue` | `pareto` 5 mục theo thứ tự trên, `cumulative_pct` = 50.0, 80.0, 90.0, 96.0, 100.0; `is_vital` = true, true, false, false, false | integration |
| AC-RPT-110 | Như AC-109, mục thứ 6 có lợi nhuận −200_000 | `GET .../sales?metric=profit` | Mục lợi nhuận âm/0 không có trong `pareto` | integration |
| AC-RPT-111 | — | `GET .../sales?metric=quantity` | 422 `VALIDATION_ERROR` | integration |
| AC-RPT-112 | Dữ liệu mẫu | `GET .../sales` | `top_selling` đầu tiên = camera Imou `quantity 4, unit "CAI"` (mã đơn vị; UI hiện "Cái"), rồi Canon LBP 2900 `quantity 2`; không có "Công đi dây" (CUSTOM) | integration |
| AC-RPT-113 | Danh mục đang hoạt động: 12 mục, trong đó "Ổ cứng SSD 256GB", "Bảo trì máy in" không bán trong kỳ; "Switch 8 port" đã ngừng hoạt động, không bán | `GET .../sales` | `slow_selling` có 10 mục, mở đầu "Bảo trì máy in" 0, "Ổ cứng SSD 256GB" 0 (tên A→Z), rồi các mục bán ít nhất; không có "Switch 8 port" | integration |
| AC-RPT-114 | KTV Phạm Đức Long: phân công task 3,5 giờ (ACCEPTED, giao 02/10), task 2 giờ (DONE, giao 09/09), task 4 giờ (REJECTED, giao 12/10), task 1 giờ (PENDING, giao 28/08) | `GET /reports/business-charts/staff?from=2026-09&to=2026-10` | Dòng Long: `assigned_hours 5.5`, `task_count 2` | integration |
| AC-RPT-115 | KTV Long 5,5 giờ, KTV Võ Minh Quân 8 giờ | `GET .../staff` | `hours_by_technician` thứ tự Quân rồi Long | integration |
| AC-RPT-116 | Tháng 2026-10: Hoa (Sale) mục tiêu 50tr, thu nhập thuần 40tr; Tuấn mục tiêu 20tr, thuần 25tr; Mai có doanh số nhưng không có mục tiêu | `GET .../staff?from=2026-09&to=2026-10` | `kpi_completion.month = "2026-10"`; `rows` = Tuấn 125.0, Hoa 80.0, Mai `null` (cuối); số liệu trùng `GET /reports/kpi-sales?month=2026-10` | integration |
| AC-RPT-117 | Không truyền `from`/`to`, hôm nay 04/11/2026 | `GET .../results` | Kỳ = `2025-12..2026-11` (12 phần tử `monthly`) | integration |
| AC-RPT-118 | — | `GET .../results?from=2026-10&to=2026-09`; `?from=2024-01&to=2026-10` (34 tháng); `?from=2026-13` | 422 lần lượt `INVALID_RANGE`, `RANGE_TOO_LONG`, `VALIDATION_ERROR`; thông báo tiếng Việt | integration |
| AC-RPT-119 | Hoa (SALE), Linh (CUSTOMER_CARE), Dũng (TECH_LEAD), Long (TECHNICIAN) | gọi 3 endpoint | 403 `FORBIDDEN` cho mọi vai trò; chưa đăng nhập → 401 | integration + generated |
| AC-RPT-120 | Kỳ không có đơn/phân công | gọi 3 endpoint | 200; `monthly`/`customers_monthly` đủ tháng với 0; mọi mảng khác rỗng `[]`; `kpi_completion.rows = []` | integration |
| AC-RPT-121 | `spec/permissions.yaml` có `report.business_charts.read` | `make contract` | `menu.json` có mục "Biểu đồ kinh doanh" `/reports/business-charts` trong nhóm "Báo cáo", chỉ MANAGER; `permissionMatrix.json` + `permissionLabels.ts` có nhãn tiếng Việt "Xem biểu đồ kinh doanh" | generated + component |
| AC-RPT-122 | Sửa giá vốn danh mục Canon LBP 2900 thành 3_000_000 sau khi đơn DH2609-0011 hoàn tất | `GET .../results` | Lợi nhuận tháng 9 vẫn 1_400_000 (dùng snapshot); không cột nào của `order_lines` bị đổi bởi API này | integration |

> Endpoint chỉ đọc: không có lệnh, không `STALE_VERSION`, không ghi audit.

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/reports/business-charts/results | report.business_charts.read | `from?`, `to?` (`YYYY-MM`) | `BusinessResultsOut { from, to, monthly[], composition{by_group[], by_item[], by_customer_type[]}, customers_monthly[] }` | 401, 403, 422 |
| GET | /api/v1/reports/business-charts/sales | report.business_charts.read | `from?`, `to?`, `metric? = revenue\|profit` | `BusinessSalesOut { from, to, metric, pareto[], top_selling[], slow_selling[] }` | 401, 403, 422 |
| GET | /api/v1/reports/business-charts/staff | report.business_charts.read | `from?`, `to?` | `BusinessStaffOut { from, to, hours_by_technician[], kpi_completion{month, rows[]} }` | 401, 403, 422 |

Tiền: số nguyên VND. `assigned_hours`, `quantity`: số thập phân (2 chữ số). Phần trăm: 1 chữ số thập phân.

## 5. Dữ liệu / Migration
Không có bảng/cột mới. Có thể cần index đọc: `orders (status, completed_at)`, `orders (customer_id, submitted_at)`, `assignments (created_at)` — kiểm tra bằng `EXPLAIN` khi implement, thêm migration nếu thiếu.

`spec/permissions.yaml` (đề xuất, chưa sửa):
```yaml
   report.kpi_sales.read: { MANAGER: all }   # M21-02a ...
+  report.business_charts.read: { MANAGER: all }   # M23a: company-wide business charts (Q157–Q160)
```
Menu (cùng file, nhóm `reports`): thêm mục `reports-business-charts`, label "Biểu đồ kinh doanh", path `/reports/business-charts`, icon `ChartPie` (lucide), capability `report.business_charts.read`, đặt đầu nhóm.

## 6. UI
Không có ở item này (M23b). Chỉ menu + nhãn quyền sinh từ `make contract`; nếu M23a ship trước M23b, route trả trang tạm "Đang xây dựng" (cùng đợt commit thì bỏ qua).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager, mở `/api/docs` → gọi `GET /reports/business-charts/results` không tham số → thấy 12 tháng.
2. So `monthly` tháng 10 với tổng "Báo cáo KPI" tháng 10 (doanh số) — phải khớp.
3. Đăng nhập Sale → gọi cùng endpoint → 403; menu không có "Biểu đồ kinh doanh".

## 8. Giả định & câu hỏi
- Giả định đã chốt: Q157 (bán chậm thay tồn kho), Q158 (giá vốn trống → 70% giá bán, làm tròn), Q159 (khách mới = đơn đang thực hiện, chưa từng có đơn trước), Q160 (tỷ lệ hoàn thành KPI như M21-02).
- Câu hỏi mới (đã ghi `OPEN_QUESTIONS.md`, đang dùng mặc định):
  - **Q165** — "70% giá bán" tính lúc truy vấn (không sửa dữ liệu) hay chạy migration ghi `cost_price_snapshot = 70% × unit_price` vào các dòng cũ? Mặc định: tính lúc truy vấn, chỉ cho M23; "giá bán" = `unit_price` (giá thực bán, chưa VAT). Hệ quả: các báo cáo M16-05/M21-02 vẫn hiện "—" cho dòng thiếu giá vốn → số lợi nhuận ở biểu đồ có thể khác báo cáo KPI (AC-RPT-116 dùng số của M21-02a nguyên trạng).
  - **Q166** — Biểu đồ tròn theo SP/DV: 9 mục lớn nhất + "Khác".
  - **Q167** — Đơn khách lẻ (không gắn khách) tính vào "Cá nhân".
  - **Q168** — Khách mới/quay lại: "đơn đang thực hiện" hiểu là **đơn đã gửi** (`submitted_at` trong tháng, chưa huỷ); khách lẻ không tính.
  - **Q169** — Pareto chỉ gồm mục giá trị > 0; ngưỡng "80/20" = các mục cho tới khi luỹ kế đạt ≥ 80%.
  - **Q170** — "Bán chạy/bán chậm" xếp theo **số lượng** (không theo doanh thu), chỉ hàng danh mục (bỏ dòng tự nhập), top 10. Lưu ý: số lượng trộn đơn vị (Cái, Giờ, Điểm).
  - **Q171** — "Giờ được phân công": Σ giờ quy định của task theo phân công **giao trong kỳ**, bỏ phân công bị từ chối/gỡ; gồm mọi nhân viên được giao (cả QLKT nếu tự nhận).
  - **Q172** — Tỷ lệ KPI lấy theo **tháng cuối kỳ** (`to`), không cộng dồn cả kỳ.
