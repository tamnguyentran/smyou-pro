# M10-07a — Sale: đơn quá hạn chưa hoàn tất

- **Status:** Done
- **Backlog:** M10-07a · **Milestone:** M10 (1/3 lát cắt của M10-07; xem `M10-07b`/`M10-07c`)
- **Liên quan:** `docs/specs/M7-02-role-dashboard.md` (nguồn `order_summary`, component `StatTile`/`OrderSummarySection`); `docs/specs/M10-03-dashboard-drilldown.md` (cơ chế drill-down `StatTile.to`, `mine` filter, đọc URL 1 lần lúc mount); `backend/app/modules/dashboard/service.py` (`_order_summary`, `_OPEN_TASK_STATUSES_EXCLUDE`); `backend/app/modules/orders/service.py` `list_orders()`.

## 1. Mục tiêu
Là Sale, tôi muốn trang "Tổng quan" thêm thống kê "đơn quá hạn chưa hoàn tất" và bấm được vào đó để đi thẳng tới danh sách đơn quá hạn, để biết đơn nào cần xử lý gấp.

## 2. Phạm vi
- `order_summary` (đã có, SALE scope `own` / MANAGER scope `all`) thêm 1 trường mới `overdue_count`: đếm đơn **chưa hoàn tất** (status ∉ {COMPLETED, CANCELLED}) và có **ít nhất 1 đầu việc đang mở** (status ∉ {DONE, CANCELLED}, tái dùng `_OPEN_TASK_STATUSES_EXCLUDE`) với `due_at` đã qua — cùng khái niệm "quá hạn" đã dùng ở `dispatch_summary.overdue_task_count`, chỉ khác là đếm theo **đơn** (distinct order) thay vì theo **đầu việc**.
- `GET /api/v1/orders` thêm query param tuỳ chọn `overdue: bool = false` (độc lập với `status`, kết hợp được với `mine`/`q`): lọc đúng điều kiện trên.
- `OrdersListPage`: thêm 1 chip "Quá hạn" vào cuối `ChipGroup` "Trạng thái" hiện có (cùng hàng với 7 trạng thái + "Tất cả") — chọn "Quá hạn" đặt bộ lọc `overdue=true` (gửi lên API) và bỏ chọn `status`; chọn 1 trạng thái thật hoặc "Tất cả" sẽ bỏ `overdue`. Đọc `overdue` từ URL lúc mount qua quy ước `overdue=1` (giống `mine=1`, M10-03), không phải `overdue=true`.
- `StatTile` mới "Quá hạn" trong `OrderSummarySection`, tông `urgent`, nối vào sau 7 thẻ trạng thái; `to` = `/orders?overdue=1${scope === "own" ? "&mine=1" : ""}` (URL điều hướng nội bộ dùng `overdue=1`, khác với query param `overdue=true` gửi lên API — xem §4).
- Ngoài phạm vi (không làm ở item này): các lát cắt M10-07b (Quản lý/Điều phối)/M10-07c (Kỹ thuật viên) — spec riêng.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-032 | Hoa (SALE); đơn A: `IN_PROGRESS`, có task quá hạn (`due_at` hôm qua, status `ACCEPTED`); đơn B: `IN_PROGRESS`, có task **không** quá hạn; đơn C: `COMPLETED`, có task quá hạn (đã hoàn tất, không tính); đơn D: `IN_PROGRESS`, task quá hạn nhưng task đã `DONE` (không tính) | Hoa `GET /api/v1/dashboard` | `order_summary.overdue_count == 1` (chỉ đơn A) | integration |
| AC-DASH-033 | Hoa (SALE) có 2 đơn quá hạn của mình; công ty có thêm 3 đơn quá hạn của An (SALE khác) | Hoa `GET /api/v1/orders?overdue=true&mine=true` | 200; chỉ trả 2 đơn của Hoa | integration |
| AC-DASH-034 | Như AC-DASH-033, không truyền `mine` | Hoa `GET /api/v1/orders?overdue=true` | 200; trả cả đơn của Hoa lẫn của An (scope `order.read` của SALE là `all`, không đổi) | integration |
| AC-DASH-035 | Hoa (SALE) ở Tổng quan, `order_summary.scope="own"`, `overdue_count=2` | Hoa bấm thẻ "Quá hạn" | Điều hướng `/orders?overdue=1&mine=1`; trang tải với chip "Quá hạn" đang chọn (không chip trạng thái nào khác), checkbox "Chỉ đơn của tôi" đã tick | component + e2e |
| AC-DASH-036 | Người dùng ở `/orders`, chip "Quá hạn" đang chọn | Bấm chip "Chờ điều phối" | Bỏ chọn "Quá hạn" (bật `status=PENDING_DISPATCH`, `overdue` tắt) — 2 chip loại trừ lẫn nhau | component |
| AC-DASH-050 | Bất kỳ vai trò thấy `order_summary`, `overdue_count = 0` | render thẻ "Quá hạn" | Thẻ số 0 vẫn hiện, vẫn bấm được (không vô hiệu hoá) — nhất quán `AC-DASH-026` | component |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/dashboard | dashboard.read (không đổi) | — | `DashboardOut.order_summary` thêm `overdue_count: int` | không đổi |
| GET | /api/v1/orders | order.read (không đổi) | thêm query param tuỳ chọn `overdue?: boolean` (mặc định `false`), độc lập với `status`/`mine` hiện có | `OrderPage` (không đổi schema) | không đổi |

`overdue=true` ở `GET /orders`: `Order.status NOT IN (COMPLETED, CANCELLED)` AND tồn tại `Task` của đơn với `status NOT IN (DONE, CANCELLED)` AND `due_at < now()`.

## 5. Dữ liệu / Migration
Không có bảng/cột mới. Tính trực tiếp từ `orders.status`, `tasks.status`/`due_at` hiện có.

## 6. UI
- `OrderSummarySection`: thêm `StatTile` "Quá hạn" (tông `urgent`) sau 7 thẻ trạng thái.
- `OrdersListPage`: thêm chip "Quá hạn" vào cuối danh sách chip trạng thái hiện có; chọn chip này ẩn/bỏ `status`, đặt bộ lọc `overdue`; chọn chip khác tắt `overdue`.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Hoa (SALE), có đơn quá hạn → mở "Tổng quan" → thấy thẻ "Quá hạn" → bấm vào → đúng danh sách đơn quá hạn của Hoa.
2. Ở `/orders`, chọn chip "Quá hạn" rồi chọn 1 chip trạng thái khác → xác nhận 2 chip loại trừ lẫn nhau.

## 8. Giả định & câu hỏi
- Giả định (đã hỏi & chốt lúc viết spec): "Quá hạn chưa hoàn tất" (đơn, Sale) = chưa `COMPLETED`/`CANCELLED` và có đầu việc con đang mở quá hạn — dùng lại đúng khái niệm `overdue_task_count`.
- Không có câu hỏi mới ở lát cắt này.
