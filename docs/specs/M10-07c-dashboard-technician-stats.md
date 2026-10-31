# M10-07c — Kỹ thuật viên: đầu việc chưa thực hiện/quá hạn + đơn chờ KH xác nhận

- **Status:** Done
- **Backlog:** M10-07c · **Milestone:** M10 (3/3 lát cắt của M10-07; xem `M10-07a`/`M10-07b`)
- **Liên quan:** `docs/specs/M7-02-role-dashboard.md` (`my_task_summary`, component `MyTaskSummarySection`, `_OPEN_ASSIGNMENT_STATUSES`); `docs/specs/M10-07a-dashboard-overdue-orders.md` (lát cắt trước, cùng cơ chế drill-down); `spec/permissions.yaml#order.read` (TECHNICIAN scope `assigned`); `frontend/src/features/myTasks/pages/MyTasksPage.tsx` (3 tab Chờ nhận/Đang làm/Đã xong, local state).

## 1. Mục tiêu
Là Kỹ thuật viên (KTV), tôi muốn trang "Tổng quan" thêm thống kê "Chưa thực hiện", "Quá hạn chưa hoàn thành", "Chưa hoàn tất, cần KH xác nhận", bấm vào đi thẳng tới danh sách tương ứng.

## 2. Phạm vi
- `my_task_summary` thêm 3 trường mới (giữ nguyên `pending_count`/`active_count`/`done_today_count` đã có):
  - `not_started_count`: đầu việc đang mở của chính KTV ở trạng thái `ACCEPTED` (đã nhận, chưa bấm "Bắt đầu") — **không** gồm `IN_PROGRESS` (khác `active_count` hiện tại gồm cả 2).
  - `overdue_count`: đầu việc đang mở của chính KTV ở trạng thái `ACCEPTED`/`IN_PROGRESS` (không gồm `PENDING` — xem §8 giả định) với `due_at` đã qua.
  - `awaiting_confirmation_count`: số đơn (distinct) đang ở trạng thái `AWAITING_CONFIRMATION` có ít nhất 1 đầu việc mà chính KTV này có 1 phân công (bất kỳ trạng thái phân công nào, kể cả `DONE` — việc đã xong, đang chờ khách xác nhận).
- 3 `StatTile` mới trong khối "Đầu việc của tôi": "Chưa thực hiện" (tông `review`), "Quá hạn chưa hoàn thành" (tông `urgent`), "Chưa hoàn tất, cần KH xác nhận" (tông `review`) — thêm sau 3 thẻ hiện có (Chờ nhận/Đang làm/Đã xong hôm nay).
- `awaiting_confirmation_count` → `to="/orders?status=AWAITING_CONFIRMATION"` (không cần tham số lọc theo người — `order.read` của TECHNICIAN đã có scope `assigned`, tự giới hạn đúng đơn của KTV này).
- `not_started_count`/`overdue_count` → `/my-tasks`: thêm query param mới `focus` (`not_started` | `overdue`), đọc 1 lần lúc mount (như `OrdersListPage`): chọn tab "Đang làm" sẵn, và lọc thêm trong tab đó — `focus=not_started` chỉ hiện phân công `ACCEPTED`; `focus=overdue` chỉ hiện phân công có `due_at` đã qua (trong số `ACCEPTED`+`IN_PROGRESS`). Không `focus` → hành vi tab "Đang làm" y hệt hiện tại (không hồi quy).
- Ngoài phạm vi (không làm ở item này):
  - Đồng bộ URL hai chiều liên tục.
  - Thêm control thủ công chọn `focus` ngay trên trang `/my-tasks` (chỉ áp khi đến từ Tổng quan).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-043 | Đức (TECHNICIAN) có 3 đầu việc đang mở: 1 `ACCEPTED` chưa bắt đầu, 1 `IN_PROGRESS`, 1 `PENDING` | Đức `GET /api/v1/dashboard` | `my_task_summary.not_started_count == 1` (chỉ cái `ACCEPTED`) | integration |
| AC-DASH-044 | Đức có: A1 `ACCEPTED` quá hạn (`due_at` hôm qua), A2 `IN_PROGRESS` quá hạn, A3 `PENDING` quá hạn (không tính — xem §8), A4 `ACCEPTED` chưa quá hạn | Đức `GET /api/v1/dashboard` | `my_task_summary.overdue_count == 2` (A1, A2) | integration |
| AC-DASH-045 | Đức có đầu việc trong đơn X (`AWAITING_CONFIRMATION`, assignment của Đức đã `DONE`) và đơn Y (`AWAITING_CONFIRMATION`, không có assignment nào của Đức) | Đức `GET /api/v1/dashboard` | `my_task_summary.awaiting_confirmation_count == 1` (chỉ đơn X) | integration |
| ~~AC-DASH-046~~ (→ M18-01b: thẻ mở popup) | Đức ở Tổng quan, `awaiting_confirmation_count=1` | Bấm thẻ "Chưa hoàn tất, cần KH xác nhận" | Điều hướng `/orders?status=AWAITING_CONFIRMATION`; danh sách chỉ gồm đơn Đức có liên quan (scope `assigned` của `order.read`) | component + e2e |
| ~~AC-DASH-047~~ (→ M18-01b: thẻ mở popup) | Đức ở Tổng quan, `not_started_count=1` | Bấm thẻ "Chưa thực hiện" | Điều hướng `/my-tasks?focus=not_started`; trang tải với tab "Đang làm" đã chọn, chỉ hiện đúng 1 phân công `ACCEPTED` (ẩn `IN_PROGRESS` cùng tab) | component + e2e |
| AC-DASH-048 | Đức mở `/my-tasks?focus=overdue` | render | Tab "Đang làm" đã chọn, chỉ hiện phân công có `due_at` đã qua trong số `ACCEPTED`/`IN_PROGRESS` | component |
| AC-DASH-049 | Đức mở `/my-tasks` trực tiếp (không `focus`) | render | Tab "Đang làm" hiện đầy đủ `ACCEPTED`+`IN_PROGRESS` như hiện tại — không hồi quy | component |
| AC-DASH-052 | Bất kỳ 1 trong 3 trường mới của `my_task_summary` = 0 | render thẻ tương ứng | Thẻ số 0 vẫn hiện, vẫn bấm được (không vô hiệu hoá) — nhất quán ~~AC-DASH-026~~ (→ M18-01a) | component |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/dashboard | dashboard.read (không đổi) | — | `DashboardOut.my_task_summary` thêm `not_started_count`, `overdue_count`, `awaiting_confirmation_count: int` | không đổi |

## 5. Dữ liệu / Migration
Không có bảng/cột mới. Tính trực tiếp từ `tasks.due_at`, `assignments.status`/`employee_id`, `orders.status` hiện có.

## 6. UI
- `MyTaskSummarySection`: thêm 3 `StatTile` mới sau 3 thẻ hiện có.
- `MyTasksPage`: đọc thêm `focus` (`not_started` | `overdue`) từ URL lúc mount; nếu có, chọn tab `active` mặc định và áp thêm điều kiện lọc trong `tabItems` (không đổi nội dung 2 tab còn lại).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Đức (TECHNICIAN), có việc chưa bắt đầu + quá hạn + đơn chờ KH xác nhận → mở "Tổng quan" → bấm từng thẻ mới, kiểm tra đích đến + nội dung lọc đúng.

## 8. Giả định & câu hỏi
- Giả định (đã hỏi & chốt lúc viết spec): "Chưa hoàn tất, cần KH xác nhận" (KTV) chỉ đếm đơn có liên quan tới chính KTV đó (không phải toàn công ty).
- Giả định (đã hỏi & chốt lúc viết spec): "Chưa thực hiện" (KTV) = `ACCEPTED` only, tách khỏi "Đang làm" (`active_count` giữ nguyên gồm cả `ACCEPTED`+`IN_PROGRESS` — 2 số liệu overlap có chủ đích, giống cách `dispatch_summary`/`task_summary` đã overlap).
- **Câu hỏi mới (Q83):** `my_task_summary.overdue_count` (KTV) có nên tính cả đầu việc đang `PENDING` (chưa tiếp nhận) mà đã quá hạn không, hay chỉ tính từ lúc đã `ACCEPTED` trở đi (đề xuất mặc định trong spec này)? Đề xuất: chỉ tính `ACCEPTED`/`IN_PROGRESS` quá hạn — vì đầu việc `PENDING` quá hạn thuộc trách nhiệm xử lý của QLKT (gần giống `needs_assignee`/điều phối lại), không phải lỗi của riêng KTV chưa làm; đã ghi vào `OPEN_QUESTIONS.md`.
- **Câu hỏi mới (Q84):** `/my-tasks?focus=not_started|overdue` thêm 1 tham số URL mới, chỉ áp dụng khi đến từ Tổng quan (không có control thủ công chọn `focus` ngay trên trang `/my-tasks`) — nếu sau này chủ dự án muốn người dùng tự lọc thủ công luôn (không chỉ qua Tổng quan), cần thêm UI riêng (ngoài phạm vi item này). Đề xuất mặc định: chưa cần, chờ phản hồi thực tế sau khi dùng.
