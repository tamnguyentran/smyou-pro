# M10-07b — Quản lý/Điều phối: đơn đang thực hiện + đầu việc chưa tiếp nhận

- **Status:** Done
- **Backlog:** M10-07b · **Milestone:** M10 (2/3 lát cắt của M10-07; xem `M10-07a`/`M10-07c`)
- **Liên quan:** `docs/specs/M7-02-role-dashboard.md` (`dispatch_summary`/`staff_summary`, component `DispatchSummarySection`/`StaffSummarySection`); `docs/specs/M10-07a-dashboard-overdue-orders.md` (lát cắt trước, cùng cơ chế drill-down); `spec/permissions.yaml#task.manage` (TECH_LEAD only — MANAGER **không** có); `spec/state_machines.yaml#task.states` (`PENDING_ACCEPTANCE` suy ra "có assignment PENDING"); `frontend/src/features/dispatch/pages/TaskBoardPage.tsx`/`TaskBoardFilters.tsx` (lọc theo `status`, hiện là local state, chưa đọc URL).

## 1. Mục tiêu
Là Quản lý/Quản lý kỹ thuật (QLKT), tôi muốn trang "Tổng quan" thêm thống kê "đơn đang thực hiện" và "đầu việc chưa tiếp nhận", bấm vào đi thẳng tới danh sách tương ứng.

## 2. Phạm vi
- `dispatch_summary` (TECH_LEAD/MANAGER, toàn công ty) thêm 1 trường mới `in_progress_order_count`: đếm `Order.status == IN_PROGRESS`. `StatTile` mới "Đang thực hiện" tông `in_progress`, `to="/orders?status=IN_PROGRESS"` (đích này không cần `mine` — `order.read` của cả MANAGER lẫn TECH_LEAD đều scope `all`).
- `staff_summary` thêm 1 trường mới `pending_acceptance_count`: đếm `Task.status == PENDING_ACCEPTANCE` (đếm theo **đầu việc**, toàn công ty, không lọc theo KTV đang hoạt động — cùng đơn vị đếm với `dispatch_summary.needs_assignee_count`/`overdue_task_count`, và khớp đúng số thẻ hiện ở `/dispatch/board?status=PENDING_ACCEPTANCE` khi 1 task có nhiều KTV cùng chờ tiếp nhận — xem Q85, giả định mặc định đã dùng). `StatTile` mới "Chưa tiếp nhận" chèn **ngay trước** "Chưa thực hiện" (thứ tự: Đang làm → Chưa tiếp nhận → Chưa thực hiện → Chờ giao việc).
  - Thẻ "Chưa tiếp nhận" chỉ có `to="/dispatch/board?status=PENDING_ACCEPTANCE"` khi người gọi có capability `task.manage` (TECH_LEAD) — **MANAGER không có `task.manage` nên không vào được `/dispatch/board`** (giữ nguyên `permissions.yaml`, không mở thêm quyền ở item này); với MANAGER, thẻ vẫn hiện số nhưng là `<div>` thường (không link), giống cách `needs_assignee_count`/`overdue_task_count` đã xử lý ở `M10-03`.
  - Đổi nhãn tĩnh "Chưa có đầu việc" → "Chờ giao việc" (chỉ đổi copy, không đổi trường `IDLE`/tông màu).
- `TaskBoardPage`/`TaskBoardFilters`: đọc `status` từ URL 1 lần lúc mount để khởi tạo `filters.status` (giống `OrdersListPage`), không đồng bộ ngược — tái dùng đúng cơ chế lọc theo cột/`ChipGroup` đã có, không đổi hành vi lọc hiện tại.
- Ngoài phạm vi (không làm ở item này):
  - Mở thêm quyền cho MANAGER vào `/dispatch/board`/`/dispatch/queue` (giữ nguyên `permissions.yaml`).
  - M10-07c (Kỹ thuật viên) — spec riêng.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-037 | Toàn công ty có 3 đơn `IN_PROGRESS`, còn lại trạng thái khác | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | `dispatch_summary.in_progress_order_count == 3` | integration |
| ~~AC-DASH-038~~ (→ M18-01a: thẻ mở popup) | Tuấn (TECH_LEAD) ở Tổng quan | Bấm thẻ "Đang thực hiện" | Điều hướng `/orders?status=IN_PROGRESS` (không `mine`); danh sách khớp số đã đếm | component + e2e |
| AC-DASH-039 | 4 task ở `PENDING_ACCEPTANCE` (3 task 1 KTV mỗi task, 1 task 2 KTV cùng `PENDING`, tổng 5 assignment `PENDING`), còn lại trạng thái khác | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | `staff_summary.pending_acceptance_count == 4` (đếm theo task, không theo assignment — Q85) | integration |
| ~~AC-DASH-040~~ (→ M18-01b: thẻ mở popup) | Tuấn (TECH_LEAD, có `task.manage`) ở Tổng quan | Bấm thẻ "Chưa tiếp nhận" (khối Nhân sự kỹ thuật) | Điều hướng `/dispatch/board?status=PENDING_ACCEPTANCE`; bảng đầu việc hiện đúng cột/lọc "Chờ tiếp nhận" | component + e2e |
| ~~AC-DASH-041~~ (→ M18-01b: thẻ mở popup) | An (MANAGER, không có `task.manage`) ở Tổng quan, `staff_summary.pending_acceptance_count=4` | render | Thẻ "Chưa tiếp nhận" hiện số 4 nhưng là `<div>` thường — không `href`, bấm vào không điều hướng (giống `needs_assignee_count` ở `M10-03`) | component |
| AC-DASH-042 | Bất kỳ vai trò thấy `staff_summary` | render | Thứ tự 4 thẻ: "Đang làm", "Chưa tiếp nhận", "Chưa thực hiện", "Chờ giao việc" (nhãn mới thay "Chưa có đầu việc") | component |
| AC-DASH-051 | Bất kỳ vai trò thấy `dispatch_summary`/`staff_summary`, 1 trong 2 trường mới = 0 | render thẻ tương ứng | Thẻ số 0 vẫn hiện, vẫn bấm được khi có `to` (không vô hiệu hoá) — nhất quán ~~AC-DASH-026~~ (→ M18-01a) | component |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/dashboard | dashboard.read (không đổi) | — | `DashboardOut.dispatch_summary` thêm `in_progress_order_count: int`; `.staff_summary` thêm `pending_acceptance_count: int` | không đổi |
| GET | /api/v1/tasks | task.manage (không đổi, đã có từ M4-03a) | không đổi API | không đổi | không đổi |

## 5. Dữ liệu / Migration
Không có bảng/cột mới. Tính trực tiếp từ `orders.status` và `tasks.status` (derived) hiện có.

## 6. UI
- `DispatchSummarySection`: thêm `StatTile` "Đang thực hiện" (tông `in_progress`, có `to`) — chèn trước "Cần giao lại"/"Quá hạn" (giữ 2 thẻ đó không link như cũ).
- `StaffSummarySection`: đổi nhãn "Chưa có đầu việc" → "Chờ giao việc"; chèn `StatTile` "Chưa tiếp nhận" giữa "Đang làm" và "Chưa thực hiện"; `to` chỉ gắn khi `"task.manage" in me.data.capabilities` (đọc qua `useMe()`, cùng cách `TaskBoardPage` tự kiểm tra).
- `TaskBoardFilters`/`TaskBoardPage`: đọc `status` từ `useSearchParams()` 1 lần lúc mount để khởi tạo `filters.status`.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Tuấn (TECH_LEAD) → mở "Tổng quan" → thấy "Đang thực hiện" (khối Đơn) và "Chưa tiếp nhận" (khối Nhân sự kỹ thuật, ngay trước "Chưa thực hiện") → bấm cả 2, kiểm tra đích đến đúng.
2. Đăng nhập An (MANAGER) → mở "Tổng quan" → thấy thẻ "Chưa tiếp nhận" có số nhưng bấm không có phản ứng (không có `task.manage`).

## 8. Giả định & câu hỏi
- Giả định: thẻ "Chưa tiếp nhận" chỉ link được cho người có `task.manage` (TECH_LEAD) — không mở thêm quyền cho MANAGER vào `/dispatch/board` ở item này.
- Câu hỏi mới: Q85 (xem `OPEN_QUESTIONS.md`) — "Đầu việc chưa tiếp nhận" đếm theo **task** (`Task.status == PENDING_ACCEPTANCE`) hay theo **assignment** (`Assignment.status == PENDING`)? Spec này đã dùng giả định mặc định (đếm theo task, nhất quán với `needs_assignee_count`/`overdue_task_count` và khớp số thẻ ở `/dispatch/board`) cho tới khi chủ dự án quyết định khác.
