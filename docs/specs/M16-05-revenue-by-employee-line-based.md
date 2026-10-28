# M16-05 — Báo cáo "Doanh thu theo nhân viên": tính theo dòng hàng (Ghi doanh số)

- **Status:** Approved (2026-10-24, chủ dự án chốt trực tiếp trong phiên — xem mục 8; thay thế quyết định Q88/Q96 cũ cho báo cáo này)
- **Backlog:** M16-05 · **Milestone:** M16
- **Phụ thuộc:** M16-04 (field `order_lines.credited_employee_id`) phải xong trước
- **Thay thế:** `docs/specs/M15-10a-revenue-by-employee-report-api.md`, `docs/specs/M15-10b-revenue-by-employee-report-ui.md` (logic nhóm theo `orders.created_by` không còn đúng — spec này viết lại toàn bộ trục tính)

## 1. Mục tiêu
Là Manager/Sale/CSKH/QLKT, tôi muốn "Doanh thu theo nhân viên" tính đúng theo từng dòng hàng được "Ghi doanh số" cho nhân viên đó, không gộp theo người tạo đơn, để số liệu phản ánh đúng ai thực sự bán.

## 2. Phạm vi
- Trong phạm vi:
  - **Trục nhóm đổi**: từ `orders.created_by` (toàn đơn) sang `order_lines.credited_employee_id` (từng dòng). 1 đơn có dòng của nhiều NV khác nhau → tách vào nhiều nhóm NV khác nhau, mỗi nhóm chỉ cộng doanh thu/lợi nhuận của đúng các dòng được ghi cho NV đó.
  - **Dòng chưa ghi ai** (`credited_employee_id IS NULL`): không tính cho bất kỳ NV nào — gộp vào 1 dòng tổng hợp riêng **"Chưa gán"** (`unassigned: true`, không có `employee_id`/`employee_code`/`employee_name`).
  - **`own` đổi nghĩa**: SALE/CUSTOMER_CARE chỉ thấy dòng mà `credited_employee_id = chính mình` (trước đây = đơn do mình tạo). `spec/permissions.yaml#report.revenue.read` không đổi cấu trúc quyền (vẫn `SALE: own, CUSTOMER_CARE: own, MANAGER: all, TECH_LEAD: all`), chỉ đổi rule tính `own`.
  - **`order_count`** trong mỗi dòng báo cáo = số đơn **khác nhau** có ít nhất 1 dòng hàng thuộc nhóm này (không còn là "số đơn do NV tạo").
  - **`subtotal_revenue`** = tổng `line_total` các dòng thuộc nhóm. **`profit`** = tổng (`line_total − cost_price_snapshot × quantity`) của các dòng có `cost_price_snapshot`; nhóm có ≥1 dòng thiếu `cost_price_snapshot` → `profit = null` (giữ quy tắc cũ, áp theo dòng thay vì theo đơn).
  - **Drilldown đổi hình dạng**: endpoint `GET /{employee_id}/orders` (trả danh sách ĐƠN) bị thay bằng `GET /lines?employee_id=<uuid>` (trả danh sách DÒNG HÀNG — `RevenueLineOut`). Thêm `unassigned=true` (loại trừ `employee_id`) để xem chi tiết nhóm "Chưa gán". Phải truyền đúng 1 trong 2 (`employee_id` hoặc `unassigned=true`) — thiếu cả 2 hoặc có cả 2 → 422.
  - UI (M15-10b cũ): đổi cột tiêu đề nếu cần, hiện dòng "Chưa gán" ở cuối bảng (không sort theo `employee_code` vì không có), bảng drilldown đổi từ "danh sách đơn" sang "danh sách dòng hàng" (cột: Mã đơn, Tên hàng, Số lượng, Doanh thu dòng, Lợi nhuận dòng).
- Ngoài phạm vi: báo cáo "Doanh thu theo khách hàng" (M16-06, item riêng, phụ thuộc field M16-04 giống nhau nhưng là spec khác).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-056 | Đơn A có 2 dòng: dòng 1 ghi doanh số cho Hoa (100tr), dòng 2 ghi cho Tuấn (50tr); đơn B có 1 dòng ghi cho Hoa (30tr) | An (MANAGER) `GET /reports/revenue-by-employee` | Có dòng Hoa: `subtotal_revenue=130_000_000, order_count=2`; dòng Tuấn: `subtotal_revenue=50_000_000, order_count=1` | integration |
| AC-RPT-057 | Đơn C có 1 dòng không ghi ai (`credited_employee_id = null`), doanh thu 20tr | An `GET /reports/revenue-by-employee` | Có 1 dòng `unassigned=true`, không có `employee_id`, `subtotal_revenue=20_000_000` | integration |
| AC-RPT-058 | Hoa (SALE) tạo đơn D nhưng dòng hàng trong đơn D ghi doanh số cho Tuấn (không phải Hoa) | Hoa `GET /reports/revenue-by-employee` (scope `own`) | Không thấy dòng doanh thu từ đơn D (vì không có dòng nào ghi cho Hoa) — khác hành vi cũ (trước đây Hoa luôn thấy đơn D vì là người tạo) | integration |
| AC-RPT-059 | Đơn E có 1 dòng ghi doanh số cho Hoa, dòng thiếu `cost_price_snapshot` (dữ liệu cũ) | An `GET /reports/revenue-by-employee` | Dòng Hoa có `profit = null` | integration |
| AC-RPT-060 | Như AC-056 | An `GET /reports/revenue-by-employee/lines?employee_id=<Hoa>` | Trả 2 dòng hàng (đơn A dòng 1, đơn B dòng 1), mỗi dòng có `order_code`, tên hàng, `line_total` đúng của dòng đó | integration |
| AC-RPT-061 | Như AC-057 | An `GET /reports/revenue-by-employee/lines?unassigned=true` | Trả 1 dòng (đơn C dòng 1) | integration |
| AC-RPT-062 | — | `GET /reports/revenue-by-employee/lines` (không có `employee_id` lẫn `unassigned`), hoặc cả 2 cùng lúc | 422 | integration |
| AC-RPT-063 | Dữ liệu AC-056/057 | An mở "Doanh thu theo nhân viên" desktop 1440px | Bảng có dòng Hoa, Tuấn, và dòng cuối "Chưa gán" (tông trung tính, không phải lỗi) | component |
| AC-RPT-064 | An bấm "Xem chi tiết" dòng Hoa | render | Bảng con hiện danh sách DÒNG HÀNG (không phải đơn): mã đơn, tên hàng, số lượng, doanh thu dòng | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| GET | /api/v1/reports/revenue-by-employee | report.revenue.read | Nhóm theo `order_lines.credited_employee_id`; thêm dòng `unassigned`; `EmployeeRevenueRowOut.employee_id/employee_code/employee_name` → `\| None`, thêm `unassigned: bool` |
| GET | /api/v1/reports/revenue-by-employee/lines | report.revenue.read | **Thay thế** `GET /{employee_id}/orders`. Query: `employee_id: uuid \| None`, `unassigned: bool = False` (đúng 1 trong 2), `from`/`to`/`status` giữ nguyên. Trả `list[RevenueLineOut]` |
| GET | /api/v1/reports/revenue-by-employee/export | report.revenue.read | CSV thêm dòng "Chưa gán" (cột mã/tên NV để trống) |

`RevenueLineOut` (mới, thay `RevenueOrderOut` cho báo cáo này): `{ id (order_line id), order_id, order_code, line_name, quantity, line_total, profit: int | None, order_created_at, order_completed_at }`.

## 5. Dữ liệu / Migration
Không có (dùng `order_lines.credited_employee_id` từ M16-04).

## 6. UI
- `docs/specs/M15-10b-revenue-by-employee-report-ui.md` cập nhật theo đây: bảng chính thêm dòng "Chưa gán" ở cuối; màn/khung "Xem chi tiết" đổi tiêu đề cột từ "Mã đơn, Ngày hoàn tất, Doanh thu, Lợi nhuận" (theo đơn) sang "Mã đơn, Tên hàng, Số lượng, Doanh thu, Lợi nhuận" (theo dòng).

## 7. Kịch bản UAT thủ công
1. Tạo 2 đơn, dùng M16-04 gán "Ghi doanh số" chéo giữa 2 NV + để trống 1 dòng.
2. Xem báo cáo theo Manager → đúng số theo từng NV + dòng "Chưa gán".
3. Đăng nhập Sale (own) → chỉ thấy dòng của chính mình, không thấy "Chưa gán" (không scope nào là "chưa gán").
4. Xem chi tiết 1 NV → đúng danh sách dòng hàng (không phải đơn).

## 8. Giả định & câu hỏi
Chủ dự án đã chốt trực tiếp trong phiên (2026-10-24), ghi đè quyết định Q88/Q96 cũ **cho báo cáo này**:
- `own` = dòng hàng có `credited_employee_id = actor.id`, không còn là `orders.created_by`.
- Dòng không ghi ai → không tính cho ai, hiện riêng 1 dòng "Chưa gán" tổng hợp (không có trong scope `own` của bất kỳ ai, chỉ `all` thấy được).
- Màn chi tiết đổi từ liệt kê đơn sang liệt kê dòng hàng.
