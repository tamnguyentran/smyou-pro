# M10-07 — Mở rộng thống kê & drill-down Tổng quan theo vai trò

- **Status:** Approved
- **Backlog:** M10-07 (3 lát cắt: M10-07a Sale, M10-07b Quản lý/Điều phối, M10-07c Kỹ thuật viên) · **Milestone:** M10
- **Liên quan:** `docs/specs/M7-02-role-dashboard.md` (nguồn `order_summary`/`dispatch_summary`/`staff_summary`/`my_task_summary`, component `StatTile`/`*Section`); `docs/specs/M10-03-dashboard-drilldown.md` (cơ chế drill-down `StatTile.to`, `mine` filter, đọc URL 1 lần lúc mount); `spec/permissions.yaml#order.read` (TECHNICIAN scope `assigned`), `#task.manage` (TECH_LEAD only — MANAGER **không** có), `#dashboard.read`; `spec/state_machines.yaml#order.states` (7 trạng thái), `#task.states` (6 trạng thái, `PENDING_ACCEPTANCE` suy ra "có assignment PENDING"); `backend/app/modules/dashboard/service.py` (toàn bộ hàm `_order_summary`/`_dispatch_summary`/`_staff_summary`/`_my_task_summary`, `_OPEN_ASSIGNMENT_STATUSES`, `_OPEN_TASK_STATUSES_EXCLUDE`); `frontend/src/features/orders/pages/OrdersListPage.tsx` (mẫu đọc URL 1 lần); `frontend/src/features/myTasks/pages/MyTasksPage.tsx` (3 tab Chờ nhận/Đang làm/Đã xong, local state); `frontend/src/features/dispatch/pages/TaskBoardPage.tsx`/`TaskBoardFilters.tsx` (lọc theo `status`, hiện là local state, chưa đọc URL).

## 1. Mục tiêu
Là Sale/Quản lý/Quản lý kỹ thuật (QLKT)/Kỹ thuật viên (KTV), tôi muốn trang "Tổng quan" cho tôi thêm vài số liệu quan trọng theo đúng việc của vai trò mình (đơn quá hạn, đơn đang thực hiện, đầu việc chưa tiếp nhận, việc của tôi chưa làm/quá hạn/chờ khách xác nhận) và bấm được vào mỗi số liệu để đi thẳng tới danh sách đã lọc đúng, để không phải tự lọc lại.

## 2. Phạm vi

### M10-07a — Sale: đơn quá hạn chưa hoàn tất
- `order_summary` (đã có, SALE scope `own` / MANAGER scope `all`) thêm 1 trường mới `overdue_count`: đếm đơn **chưa hoàn tất** (status ∉ {COMPLETED, CANCELLED}) và có **ít nhất 1 đầu việc đang mở** (status ∉ {DONE, CANCELLED}, tái dùng `_OPEN_TASK_STATUSES_EXCLUDE`) với `due_at` đã qua — cùng khái niệm "quá hạn" đã dùng ở `dispatch_summary.overdue_task_count`, chỉ khác là đếm theo **đơn** (distinct order) thay vì theo **đầu việc**.
- `GET /api/v1/orders` thêm query param tuỳ chọn `overdue: bool = false` (độc lập với `status`, kết hợp được với `mine`/`q`): lọc đúng điều kiện trên.
- `OrdersListPage`: thêm 1 chip "Quá hạn" vào cuối `ChipGroup` "Trạng thái" hiện có (cùng hàng với 7 trạng thái + "Tất cả") — chọn "Quá hạn" đặt `overdue=true` và bỏ chọn `status`; chọn 1 trạng thái thật hoặc "Tất cả" sẽ bỏ `overdue`. Đọc thêm `overdue` từ URL lúc mount (giống `status`/`mine`, M10-03).
- `StatTile` mới "Quá hạn" trong `OrderSummarySection`, tông `urgent`, nối vào sau 7 thẻ trạng thái; `to` = `/orders?overdue=true${scope === "own" ? "&mine=1" : ""}`.

### M10-07b — Quản lý/Điều phối: đơn đang thực hiện + đầu việc chưa tiếp nhận
- `dispatch_summary` (TECH_LEAD/MANAGER, toàn công ty) thêm 1 trường mới `in_progress_order_count`: đếm `Order.status == IN_PROGRESS`. `StatTile` mới "Đang thực hiện" tông `in_progress`, `to="/orders?status=IN_PROGRESS"` (đích này không cần `mine` — `order.read` của cả MANAGER lẫn TECH_LEAD đều scope `all`).
- `staff_summary` thêm 1 trường mới `pending_acceptance_count`: đếm `Assignment.status == PENDING` (toàn công ty, không lọc theo KTV đang hoạt động — cùng tinh thần `dispatch_summary.needs_assignee_count` đếm theo đầu việc, không theo người). `StatTile` mới "Chưa tiếp nhận" chèn **ngay trước** "Chưa thực hiện" (thứ tự: Đang làm → Chưa tiếp nhận → Chưa thực hiện → Chờ giao việc).
  - Thẻ "Chưa tiếp nhận" chỉ có `to="/dispatch/board?status=PENDING_ACCEPTANCE"` khi người gọi có capability `task.manage` (TECH_LEAD) — **MANAGER không có `task.manage` nên không vào được `/dispatch/board`** (giữ nguyên `permissions.yaml`, không mở thêm quyền ở item này); với MANAGER, thẻ vẫn hiện số nhưng là `<div>` thường (không link), giống cách `needs_assignee_count`/`overdue_task_count` đã xử lý ở `M10-03`.
  - Đổi nhãn tĩnh "Chưa có đầu việc" → "Chờ giao việc" (chỉ đổi copy, không đổi trường `IDLE`/tông màu).
- `TaskBoardPage`/`TaskBoardFilters`: đọc `status` từ URL 1 lần lúc mount để khởi tạo `filters.status` (giống `OrdersListPage`), không đồng bộ ngược — tái dùng đúng cơ chế lọc theo cột/`ChipGroup` đã có, không đổi hành vi lọc hiện tại.

### M10-07c — Kỹ thuật viên: đầu việc chưa thực hiện/quá hạn + đơn chờ KH xác nhận
- `my_task_summary` thêm 3 trường mới (giữ nguyên `pending_count`/`active_count`/`done_today_count` đã có):
  - `not_started_count`: đầu việc đang mở của chính KTV ở trạng thái `ACCEPTED` (đã nhận, chưa bấm "Bắt đầu") — **không** gồm `IN_PROGRESS` (khác `active_count` hiện tại gồm cả 2).
  - `overdue_count`: đầu việc đang mở của chính KTV ở trạng thái `ACCEPTED`/`IN_PROGRESS` (không gồm `PENDING` — xem §8 giả định) với `due_at` đã qua.
  - `awaiting_confirmation_count`: số đơn (distinct) đang ở trạng thái `AWAITING_CONFIRMATION` có ít nhất 1 đầu việc mà chính KTV này có 1 phân công (bất kỳ trạng thái phân công nào, kể cả `DONE` — việc đã xong, đang chờ khách xác nhận).
- 3 `StatTile` mới trong khối "Đầu việc của tôi": "Chưa thực hiện" (tông `review`), "Quá hạn chưa hoàn thành" (tông `urgent`), "Chưa hoàn tất, cần KH xác nhận" (tông `review`) — thêm sau 3 thẻ hiện có (Chờ nhận/Đang làm/Đã xong hôm nay).
- `awaiting_confirmation_count` → `to="/orders?status=AWAITING_CONFIRMATION"` (không cần tham số lọc theo người — `order.read` của TECHNICIAN đã có scope `assigned`, tự giới hạn đúng đơn của KTV này).
- `not_started_count`/`overdue_count` → `/my-tasks`: thêm query param mới `focus` (`not_started` | `overdue`), đọc 1 lần lúc mount (như `OrdersListPage`): chọn tab "Đang làm" sẵn, và lọc thêm trong tab đó — `focus=not_started` chỉ hiện phân công `ACCEPTED`; `focus=overdue` chỉ hiện phân công có `due_at` đã qua (trong số `ACCEPTED`+`IN_PROGRESS`). Không `focus` → hành vi tab "Đang làm" y hệt hiện tại (không hồi quy).

- Ngoài phạm vi (không làm ở item này):
  - Đồng bộ URL hai chiều liên tục (giữ đúng tinh thần M10-03: chỉ đọc 1 lần lúc tải trang).
  - Mở thêm quyền cho MANAGER vào `/dispatch/board`/`/dispatch/queue` (giữ nguyên `permissions.yaml`).
  - Thêm chip/tab mới hiển thị trực quan "Quá hạn"/"Chưa thực hiện" trên `OrdersListPage`/`TaskBoardPage`/`MyTasksPage` ngoài phần tự động áp từ URL (vd không thêm nút bấm thủ công chọn `focus` ngay trên `/my-tasks` — chỉ áp khi đến từ Tổng quan).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-032 (M10-07a) | Hoa (SALE); đơn A: `IN_PROGRESS`, có task quá hạn (`due_at` hôm qua, status `ACCEPTED`); đơn B: `IN_PROGRESS`, có task **không** quá hạn; đơn C: `COMPLETED`, có task quá hạn (đã hoàn tất, không tính); đơn D: `IN_PROGRESS`, task quá hạn nhưng task đã `DONE` (không tính) | Hoa `GET /api/v1/dashboard` | `order_summary.overdue_count == 1` (chỉ đơn A) | integration |
| AC-DASH-033 (M10-07a) | Hoa (SALE) có 2 đơn quá hạn của mình; công ty có thêm 3 đơn quá hạn của An (SALE khác) | Hoa `GET /api/v1/orders?overdue=true&mine=true` | 200; chỉ trả 2 đơn của Hoa | integration |
| AC-DASH-034 (M10-07a) | Như AC-DASH-033, không truyền `mine` | Hoa `GET /api/v1/orders?overdue=true` | 200; trả cả 5 đơn (scope `order.read` của SALE là `all`, không đổi) | integration |
| AC-DASH-035 (M10-07a) | Hoa (SALE) ở Tổng quan, `order_summary.scope="own"`, `overdue_count=2` | Hoa bấm thẻ "Quá hạn" | Điều hướng `/orders?overdue=true&mine=1`; trang tải với chip "Quá hạn" đang chọn (không chip trạng thái nào khác), checkbox "Chỉ đơn của tôi" đã tick; danh sách đúng 2 đơn | component + e2e |
| AC-DASH-036 (M10-07a) | Người dùng ở `/orders`, chip "Quá hạn" đang chọn | Bấm chip "Chờ điều phối" | Bỏ chọn "Quá hạn" (bật `status=PENDING_DISPATCH`, `overdue` tắt) — 2 chip loại trừ lẫn nhau | component |
| AC-DASH-037 (M10-07b) | Toàn công ty có 3 đơn `IN_PROGRESS`, còn lại trạng thái khác | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | `dispatch_summary.in_progress_order_count == 3` | integration |
| AC-DASH-038 (M10-07b) | Tuấn (TECH_LEAD) ở Tổng quan | Bấm thẻ "Đang thực hiện" | Điều hướng `/orders?status=IN_PROGRESS` (không `mine`); danh sách khớp số đã đếm | component + e2e |
| AC-DASH-039 (M10-07b) | 4 assignment đang `PENDING` (của các KTV khác nhau), còn lại trạng thái khác | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | `staff_summary.pending_acceptance_count == 4` | integration |
| AC-DASH-040 (M10-07b) | Tuấn (TECH_LEAD, có `task.manage`) ở Tổng quan | Bấm thẻ "Chưa tiếp nhận" (khối Nhân sự kỹ thuật) | Điều hướng `/dispatch/board?status=PENDING_ACCEPTANCE`; bảng đầu việc hiện đúng cột/lọc "Chờ tiếp nhận" | component + e2e |
| AC-DASH-041 (M10-07b) | An (MANAGER, không có `task.manage`) ở Tổng quan, `staff_summary.pending_acceptance_count=4` | render | Thẻ "Chưa tiếp nhận" hiện số 4 nhưng là `<div>` thường — không `href`, bấm vào không điều hướng (giống `needs_assignee_count` ở `M10-03`) | component |
| AC-DASH-042 (M10-07b) | Bất kỳ vai trò thấy `staff_summary` | render | Thứ tự 4 thẻ: "Đang làm", "Chưa tiếp nhận", "Chưa thực hiện", "Chờ giao việc" (nhãn mới thay "Chưa có đầu việc") | component |
| AC-DASH-043 (M10-07c) | Đức (TECHNICIAN) có 3 đầu việc đang mở: 1 `ACCEPTED` chưa bắt đầu, 1 `IN_PROGRESS`, 1 `PENDING` | Đức `GET /api/v1/dashboard` | `my_task_summary.not_started_count == 1` (chỉ cái `ACCEPTED`) | integration |
| AC-DASH-044 (M10-07c) | Đức có: A1 `ACCEPTED` quá hạn (`due_at` hôm qua), A2 `IN_PROGRESS` quá hạn, A3 `PENDING` quá hạn (không tính — xem §8), A4 `ACCEPTED` chưa quá hạn | Đức `GET /api/v1/dashboard` | `my_task_summary.overdue_count == 2` (A1, A2) | integration |
| AC-DASH-045 (M10-07c) | Đức có đầu việc trong đơn X (`AWAITING_CONFIRMATION`, assignment của Đức đã `DONE`) và đơn Y (`AWAITING_CONFIRMATION`, không có assignment nào của Đức) | Đức `GET /api/v1/dashboard` | `my_task_summary.awaiting_confirmation_count == 1` (chỉ đơn X) | integration |
| AC-DASH-046 (M10-07c) | Đức ở Tổng quan, `awaiting_confirmation_count=1` | Bấm thẻ "Chưa hoàn tất, cần KH xác nhận" | Điều hướng `/orders?status=AWAITING_CONFIRMATION`; danh sách chỉ gồm đơn Đức có liên quan (scope `assigned` của `order.read`) | component + e2e |
| AC-DASH-047 (M10-07c) | Đức ở Tổng quan, `not_started_count=1` | Bấm thẻ "Chưa thực hiện" | Điều hướng `/my-tasks?focus=not_started`; trang tải với tab "Đang làm" đã chọn, chỉ hiện đúng 1 phân công `ACCEPTED` (ẩn `IN_PROGRESS` cùng tab) | component + e2e |
| AC-DASH-048 (M10-07c) | Đức mở `/my-tasks?focus=overdue` | render | Tab "Đang làm" đã chọn, chỉ hiện phân công có `due_at` đã qua trong số `ACCEPTED`/`IN_PROGRESS` | component |
| AC-DASH-049 (M10-07c) | Đức mở `/my-tasks` trực tiếp (không `focus`) | render | Tab "Đang làm" hiện đầy đủ `ACCEPTED`+`IN_PROGRESS` như hiện tại — không hồi quy | component |
| AC-DASH-050 | Bất kỳ vai trò, 1 trong các trường mới = 0 | render thẻ tương ứng | Thẻ số 0 vẫn hiện, vẫn bấm được (không vô hiệu hoá) — nhất quán `AC-DASH-026` | component |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/dashboard | dashboard.read (không đổi) | — | `DashboardOut` + trường mới (xem dưới) | không đổi |
| GET | /api/v1/orders | order.read (không đổi) | thêm query param tuỳ chọn `overdue?: boolean` (mặc định `false`), độc lập với `status`/`mine` hiện có | `OrderPage` (không đổi schema) | không đổi |

`DashboardOut` — trường mới (tất cả thêm vào các object đã có, không đổi tên/shape cũ):
```jsonc
{
  "order_summary": { "scope": "...", "counts_by_status": {...}, "overdue_count": 0 },
  "dispatch_summary": { "pending_dispatch_count": 0, "needs_assignee_count": 0, "overdue_task_count": 0, "in_progress_order_count": 0 },
  "staff_summary": { "active_technician_count": 0, "counts_by_status": {...}, "pending_acceptance_count": 0 },
  "my_task_summary": {
    "pending_count": 0, "active_count": 0, "done_today_count": 0,
    "not_started_count": 0, "overdue_count": 0, "awaiting_confirmation_count": 0
  }
}
```

`overdue=true` ở `GET /orders`: `Order.status NOT IN (COMPLETED, CANCELLED)` AND tồn tại `Task` của đơn với `status NOT IN (DONE, CANCELLED)` AND `due_at < now()`.

`GET /api/v1/tasks` (board, đã có từ M4-03a) — không đổi API, chỉ `TaskBoardPage` đọc thêm `status` từ URL lúc mount.

## 5. Dữ liệu / Migration
Không có bảng/cột mới. Toàn bộ tính trực tiếp từ `orders.status`, `tasks.status`/`due_at`, `assignments.status`/`employee_id` hiện có.

## 6. UI
- `OrderSummarySection`: thêm `StatTile` "Quá hạn" (tông `urgent`) sau 7 thẻ trạng thái.
- `OrdersListPage`: thêm chip "Quá hạn" vào cuối danh sách chip trạng thái hiện có; chọn chip này ẩn/bỏ `status`, đặt `overdue=true`; chọn chip khác tắt `overdue`.
- `DispatchSummarySection`: thêm `StatTile` "Đang thực hiện" (tông `in_progress`, có `to`) — chèn trước "Cần giao lại"/"Quá hạn" (giữ 2 thẻ đó không link như cũ).
- `StaffSummarySection`: đổi nhãn "Chưa có đầu việc" → "Chờ giao việc"; chèn `StatTile` "Chưa tiếp nhận" giữa "Đang làm" và "Chưa thực hiện"; `to` chỉ gắn khi `"task.manage" in me.data.capabilities` (đọc qua `useMe()`, cùng cách `TaskBoardPage` tự kiểm tra).
- `TaskBoardFilters`/`TaskBoardPage`: đọc `status` từ `useSearchParams()` 1 lần lúc mount để khởi tạo `filters.status` (giống `OrdersListPage`).
- `MyTaskSummarySection`: thêm 3 `StatTile` mới sau 3 thẻ hiện có.
- `MyTasksPage`: đọc thêm `focus` (`not_started` | `overdue`) từ URL lúc mount; nếu có, chọn tab `active` mặc định và áp thêm điều kiện lọc trong `tabItems` (không đổi nội dung 2 tab còn lại).
- Toàn bộ `StatTile` mới tuân thủ UI_GUIDELINES hiện có (vùng chạm ≥44px, tông màu chỉ tô khi `value>0`, mobile 2 cột/desktop 3-4 cột) — không tạo biến thể mới.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Hoa (SALE), có đơn quá hạn → mở "Tổng quan" → thấy thẻ "Quá hạn" → bấm vào → đúng danh sách đơn quá hạn của Hoa.
2. Đăng nhập Tuấn (TECH_LEAD) → mở "Tổng quan" → thấy "Đang thực hiện" (khối Đơn) và "Chưa tiếp nhận" (khối Nhân sự kỹ thuật, ngay trước "Chưa thực hiện") → bấm cả 2, kiểm tra đích đến đúng.
3. Đăng nhập An (MANAGER) → mở "Tổng quan" → thấy thẻ "Chưa tiếp nhận" có số nhưng bấm không có phản ứng (không có `task.manage`).
4. Đăng nhập Đức (TECHNICIAN), có việc chưa bắt đầu + quá hạn + đơn chờ KH xác nhận → mở "Tổng quan" → bấm từng thẻ mới, kiểm tra đích đến + nội dung lọc đúng.

## 8. Giả định & câu hỏi
- Giả định (đã hỏi & chốt lúc viết spec): "Quá hạn chưa hoàn tất" (đơn, Sale) = chưa `COMPLETED`/`CANCELLED` và có đầu việc con đang mở quá hạn — dùng lại đúng khái niệm `overdue_task_count`.
- Giả định (đã hỏi & chốt lúc viết spec): "Chưa hoàn tất, cần KH xác nhận" (KTV) chỉ đếm đơn có liên quan tới chính KTV đó (không phải toàn công ty).
- Giả định (đã hỏi & chốt lúc viết spec): "Đầu việc chưa tiếp nhận" đếm theo đơn vị **assignment** (status `PENDING`); thẻ chỉ link được cho người có `task.manage` (TECH_LEAD) — không mở thêm quyền cho MANAGER vào `/dispatch/board` ở item này.
- Giả định (đã hỏi & chốt lúc viết spec): "Chưa thực hiện" (KTV) = `ACCEPTED` only, tách khỏi "Đang làm" (`active_count` giữ nguyên gồm cả `ACCEPTED`+`IN_PROGRESS` — 2 số liệu overlap có chủ đích, giống cách `dispatch_summary`/`task_summary` đã overlap).
- **Câu hỏi mới (Q83):** `my_task_summary.overdue_count` (KTV) có nên tính cả đầu việc đang `PENDING` (chưa tiếp nhận) mà đã quá hạn không, hay chỉ tính từ lúc đã `ACCEPTED` trở đi (đề xuất mặc định trong spec này)? Đề xuất: chỉ tính `ACCEPTED`/`IN_PROGRESS` quá hạn — vì đầu việc `PENDING` quá hạn thuộc trách nhiệm xử lý của QLKT (gần giống `needs_assignee`/điều phối lại), không phải lỗi của riêng KTV chưa làm; đã thêm dòng vào `OPEN_QUESTIONS.md`.
- **Câu hỏi mới (Q84):** `/my-tasks?focus=not_started|overdue` thêm 1 tham số URL mới, chỉ áp dụng khi đến từ Tổng quan (không có control thủ công chọn `focus` ngay trên trang `/my-tasks`) — nếu sau này chủ dự án muốn người dùng tự lọc thủ công luôn (không chỉ qua Tổng quan), cần thêm UI riêng (ngoài phạm vi item này). Đề xuất mặc định: chưa cần, chờ phản hồi thực tế sau khi dùng.
