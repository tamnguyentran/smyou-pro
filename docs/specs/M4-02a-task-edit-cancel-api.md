# M4-02a — Sửa task, thêm/gỡ người, huỷ task: API

- **Status:** Done
- **Backlog:** M4-02 (tách thành M4-02a API / M4-02b giao diện, theo mẫu M4-01) · **Milestone:** M4
- **Liên quan:** `spec/state_machines.yaml#task` (lệnh `update`/`add_assignee`/`cancel`), `#assignment` (chuyển `remove`), guard `order_in_dispatchable_state`/`assignees_are_active_technicians`/`estimated_hours_positive`/`due_at_not_in_past`/`reason_present` (đã cài), `not_already_active_assignee`/`task_not_cancelled` (đang ở `PENDING_GUARDS` ghi `"M4-02"`); `spec/permissions.yaml` (`task.manage`: TECH_LEAD all — **không** có MANAGER; `task.read`: MANAGER/TECH_LEAD all, TECHNICIAN assigned); `docs/product/DOMAIN_MODEL.md` §8/§9; `docs/product/WORKFLOWS.md` §3 (trạng thái task suy ra) §4 (phân công) §6 (khoá `FOR UPDATE`); `backend/app/modules/dispatch/service.py` (`create_task` chưa kiểm `order_line_ids` thuộc đơn — BACKLOG.md mục M4-02, **không sửa ở item này**, xem Q68); `M4-01a-dispatch-task-create-api.md`; Q61 (task.read dành cho route hành động M4-02+), Q62 (Order là aggregate root), Q69 (mới, xem §8); Q67/Q68 đã hỏi chủ dự án và **không áp dụng** ở item này (xem §8) — không sửa `spec/state_machines.yaml`.

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi muốn sửa thông tin một đầu việc, thêm hoặc gỡ kỹ thuật viên được giao, và huỷ đầu việc khi không cần làm nữa — để điều chỉnh khi lịch/nhân sự thay đổi mà không phải tạo lại từ đầu.

## 2. Phạm vi
Tách theo mẫu M4-01: item này là **API**. Giao diện (sheet sửa task, nút trên tab "Đầu việc", xác nhận huỷ) ở `M4-02b-task-edit-cancel-ui.md`.

- **Trong phạm vi:**
  - `PATCH /orders/{order_id}/tasks/{task_id}` — lệnh `update` (title/description/estimated_hours/due_at/priority, mỗi trường tuỳ chọn — không gửi giữ giá trị cũ).
  - `POST /orders/{order_id}/tasks/{task_id}/assignees` — lệnh `add_assignee`.
  - `POST /orders/{order_id}/tasks/{task_id}/assignees/{assignment_id}/remove` — chuyển `assignment.remove`.
  - `POST /orders/{order_id}/tasks/{task_id}/cancel` — lệnh `cancel` (có lý do).
  - `GET /orders/{order_id}/tasks/{task_id}` — chi tiết 1 task (capability `task.read`, Q61) để màn sửa có đủ dữ liệu (mỗi người được giao kèm `id` phân công — `GET /orders/{id}/tasks` hiện tại không có, chỉ có tên).
  - Cài 2 guard đang ở `PENDING_GUARDS` ghi `"M4-02"`: `not_already_active_assignee`, `task_not_cancelled` (pure function, thêm vào `GUARDS`; `task_not_cancelled` chưa có lệnh nào trong M4-02 dùng tới — các lệnh dùng nó (`assignment.accept`/`start`/`complete`) là M5 — chỉ cần hàm tồn tại + unit test theo đúng quy tắc "chuyển từ `PENDING_GUARDS` sang `GUARDS` ở item cài nó").
  - Thêm trường `id` (id phân công) vào `TaskAssigneeOut` để màn sửa gỡ đúng người.
- **Ngoài phạm vi (để milestone sau, hoặc không duyệt):** mở lại task (`reopen`, M6-03); accept/reject/start/complete của KTV (M5); Kanban/bảng đầu việc đầy đủ (M4-03); `notify_assignees` bắn thật (M7-01, giữ nguyên quyết định bỏ qua như Q60); giao diện (M4-02b); **guard `estimated_hours_positive`/`due_at_not_in_past` cho lệnh `update`** (Q67 — chủ dự án không duyệt, giữ nguyên `guards: [order_in_dispatchable_state]` của `spec/state_machines.yaml#task.commands[update]`); **guard `order_line_ids_belong_to_order` cho lệnh `create`** (Q68 — chủ dự án không duyệt, giữ nguyên hành vi M4-01a: `order_line_ids` không kiểm thuộc đơn).

## 3. Acceptance Criteria
> Fixture (tiếp nối M4-01a): Tuấn (TECH_LEAD, `task.manage`+`task.read` scope `all`). Hoa (SALE, chủ đơn). An (MANAGER — có `task.read` nhưng **không** có `task.manage`, Q05/permissions.yaml). Khoa, Minh, Dũng (TECHNICIAN đang hoạt động). Lan (TECHNICIAN, `is_active=false`). "Đơn D": `IN_PROGRESS`, có task T1 (`version` đơn hiện tại = `N`) giao Khoa+Minh, cả hai còn `PENDING` (chưa tiếp nhận — accept là M5 nên mọi assignment trong fixture này dừng ở `PENDING`). "Đơn E": `AWAITING_CONFIRMATION` (không thể điều phối), có task T2 đã `CANCELLED` sẵn (seed thẳng DB để test `allowed_task_status`). "Đơn F": `IN_PROGRESS`, có task T3 giao Khoa.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DSP-038 | T1 (Đơn D, `version=N`), Khoa+Minh `PENDING` | Tuấn `PATCH /orders/{D}/tasks/{T1} {version:N, title:"Lắp 4 camera + đầu ghi", estimated_hours:6, due_at:"2026-10-07T09:00:00+07:00"}` (không gửi `description`/`priority`) | 200 `TaskDetail`: `title`/`estimated_hours`/`due_at` đổi đúng; `priority`/`description` giữ nguyên giá trị cũ; `order_version=N+1`; đúng 1 `audit_events` mới `entity_type=TASK,action=update,actor_id=Tuấn.id` | integration |
| ~~AC-DSP-039~~ | — bỏ: Q67 không được duyệt, `update` giữ nguyên chỉ guard `order_in_dispatchable_state` — sửa đầu việc chấp nhận số giờ/hạn hoàn thành bất kỳ (trách nhiệm người sửa, không bị server chặn) | — | — | — |
| AC-DSP-040 | T2 (Đơn E) đã `CANCELLED` sẵn | Tuấn `PATCH .../T2 {version, title:"x"}` → 409 `INVALID_TRANSITION` (task không nằm trong `allowed_task_status` của `update`); `POST .../T2/assignees {version, employee_id:Dũng.id}` → cùng 409 `INVALID_TRANSITION`; `POST .../T2/cancel {version, reason:"Thử lại"}` → cùng 409 `INVALID_TRANSITION` | integration |
| AC-DSP-041 | T1 (Đơn D), Đơn E đang `AWAITING_CONFIRMATION` có task T2' khác (seed mới, chưa huỷ, để tách khỏi AC-040) | Tuấn `PATCH`/`POST .../assignees`/`POST .../cancel` trên T2' (đơn không ở `PENDING_DISPATCH`/`IN_PROGRESS`/`REVISION`) → cả 3: 409 `GUARD_FAILED` guard=`order_in_dispatchable_state` | integration |
| AC-DSP-042 | T1 (Đơn D), Khoa+Minh đã `PENDING` | Tuấn `POST /orders/{D}/tasks/{T1}/assignees {version, employee_id:Dũng.id}` | 200 `TaskDetail`: `assignees` có 3 phần tử (Dũng mới, `status="PENDING"`); `status` task vẫn `PENDING_ACCEPTANCE`; `order_version=N+1`; đúng 1 `audit_events` mới `entity_type=TASK,action=add_assignee` | integration |
| AC-DSP-043 | Tiếp AC-042: Khoa đã có assignment active trên T1 | Tuấn `POST .../T1/assignees {version, employee_id:Khoa.id}` (thêm lại người đã có) | 409 `GUARD_FAILED` guard=`not_already_active_assignee` | integration |
| AC-DSP-044 | T1 (Đơn D) | Tuấn thêm `employee_id:Lan.id` (TECHNICIAN đã khoá) → 409 guard=`assignees_are_active_technicians`; thêm `employee_id:An.id` (MANAGER, không phải TECHNICIAN) → cùng guard | integration |
| AC-DSP-045 | Tiếp AC-042: T1 có 3 assignment active (Khoa, Minh, Dũng), lấy `assignment_id` của Dũng | Tuấn `POST /orders/{D}/tasks/{T1}/assignees/{Dũng.assignment_id}/remove {version}` | 200 `TaskDetail`: `assignees` còn 2 (Khoa, Minh); task vẫn `PENDING_ACCEPTANCE`; `order_version` tăng 1; đúng 1 `audit_events` mới `entity_type=ASSIGNMENT,action=remove,from_status=PENDING,to_status=REMOVED` | integration |
| AC-DSP-046 | T3 (Đơn F) chỉ có 1 assignment active (Khoa) | Tuấn gỡ assignment của Khoa trên T3 | 200; `assignees` rỗng; `status` task → `"NEEDS_ASSIGNEE"`; Đơn F vẫn `IN_PROGRESS` (không có chuyển hệ thống nào — `all_active_tasks_done` cần `has_active_tasks`, nay T3 không còn task nào khác nên false) | integration |
| AC-DSP-047 | Tiếp AC-046: assignment của Khoa trên T3 đã `REMOVED` | Tuấn gọi `remove` lại đúng `assignment_id` đó | 409 `INVALID_TRANSITION` (không còn ở `PENDING`/`ACCEPTED`/`IN_PROGRESS`) | integration |
| AC-DSP-048 | T1 (Đơn D) còn 2 assignment active (Khoa, Minh) | Tuấn `POST /orders/{D}/tasks/{T1}/cancel {version, reason:"Khách đổi lịch, không cần lắp nữa"}` | 200 `TaskDetail`: `status="CANCELLED"`; `assignees` rỗng (2 assignment cũ chuyển `REMOVED`, `removed_at` được set); Đơn D vẫn `IN_PROGRESS`; `order_version` tăng 1; đúng 1 `audit_events` mới `entity_type=TASK,action=cancel,from_status=PENDING_ACCEPTANCE,to_status=CANCELLED` (không có audit riêng cho từng assignment bị gỡ theo hiệu ứng) | integration |
| AC-DSP-049 | T3 (Đơn F) | Tuấn `POST .../T3/cancel {version, reason:"ok"}` (4 ký tự sau trim) → 409 `GUARD_FAILED` guard=`reason_present`; `{reason:"   "}` → cùng guard | integration |
| AC-DSP-050 | T1 (Đơn D) | Hoa (SALE)/An (MANAGER, không có `task.manage`)/Khoa (TECHNICIAN, chính người được giao) gọi `PATCH .../T1`, `POST .../T1/assignees`, `POST .../T1/cancel` | cả 3 vai trò × cả 3 route: 403 `FORBIDDEN`; Tuấn gọi cùng request hợp lệ → 200 | integration |
| AC-DSP-051 | T1 (Đơn D), `version` hiện tại `M` | Tuấn gọi 1 trong 4 lệnh (`update`/`add_assignee`/`remove`/`cancel`) với `version: M-1` | 409 `STALE_VERSION`; không có thay đổi nào được ghi (lặp cho cả 4 route) | integration |
| AC-DSP-052 | T1 thuộc Đơn D | Tuấn gọi `PATCH /orders/{F.id}/tasks/{T1.id}` (task thật nhưng sai `order_id`) | 404 `NOT_FOUND`; tương tự cho `add_assignee`/`cancel`/`GET` với `order_id` sai hoặc `task_id` ngẫu nhiên | integration |
| AC-DSP-053 | T1 (Đơn D), Khoa+Minh+Dũng đều `PENDING` | Tuấn `GET /orders/{D}/tasks/{T1}` | 200 `TaskDetail`: `assignees` 3 phần tử, mỗi phần tử có `id` (assignment id) khác nhau + `employee_id`+`full_name`+`status`; An (MANAGER) gọi cùng route → 200 giống vậy | integration |
| AC-DSP-054 | Khoa được giao T1 (Đơn D); Lan (TECHNICIAN) không liên quan T1 | Khoa `GET /orders/{D}/tasks/{T1}` → 200; Lan gọi cùng route → 404 `NOT_FOUND` (scope `assigned` của `task.read`) | integration |
| ~~AC-DSP-055~~ | — bỏ: Q68 không được duyệt — không thêm guard mới cho `create`, hành vi `order_line_ids` giữ nguyên như M4-01a (không kiểm thuộc đơn), nên không có gì mới để kiểm | — | — | — |
| ~~AC-DSP-056~~ | — bỏ: cùng lý do Q68 ở trên | — | — | — |
| AC-DSP-057 | — | mọi route mới (`PATCH .../tasks/{id}`, `POST .../assignees`, `POST .../assignees/{id}/remove`, `POST .../tasks/{id}/cancel`, `GET .../tasks/{id}`) | khai đúng 1 capability (`task.manage` hoặc `task.read`); nằm trong ma trận RBAC route thật; `not_already_active_assignee`/`task_not_cancelled` đã chuyển từ `PENDING_GUARDS` sang `GUARDS` | generated |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| PATCH | /api/v1/orders/{order_id}/tasks/{task_id} | task.manage | `{version, title?, description?, estimated_hours?, due_at?, priority?}` | 200 `TaskDetail` | 403, 404, 409, 422 |
| POST | /api/v1/orders/{order_id}/tasks/{task_id}/assignees | task.manage | `{version, employee_id}` | 200 `TaskDetail` | 403, 404, 409, 422 |
| POST | /api/v1/orders/{order_id}/tasks/{task_id}/assignees/{assignment_id}/remove | task.manage | `{version}` | 200 `TaskDetail` | 403, 404, 409 |
| POST | /api/v1/orders/{order_id}/tasks/{task_id}/cancel | task.manage | `{version, reason}` | 200 `TaskDetail` | 403, 404, 409, 422 |
| GET | /api/v1/orders/{order_id}/tasks/{task_id} | task.read | — | 200 `TaskDetail` | 404 |

Ghi chú:
- `TaskAssigneeOut` thêm trường `id` (id phân công): `{id, employee_id, full_name, status}` — dùng để gỡ đúng người (không đổi `TaskSummaryAssigneeOut` của `GET /orders/{id}/tasks`, vẫn `{employee_id, full_name}`).
- `update`: trường không gửi (`None`) giữ giá trị cũ; **không** thêm guard kiểm giá trị `estimated_hours`/`due_at` khi sửa (Q67 không được duyệt) — chỉ còn `order_in_dispatchable_state`, đúng nguyên văn `spec/state_machines.yaml#task.commands[update]`.
- `add_assignee`: guard `not_already_active_assignee` kiểm trong đúng `cycle` hiện tại của task (một người từng bị gỡ/từ chối ở cùng cycle vẫn thêm lại được — tạo assignment mới).
- `cancel`: hiệu ứng `remove_open_assignments` tự chuyển mọi assignment `PENDING`/`ACCEPTED`/`IN_PROGRESS` của task đó sang `REMOVED` (`removed_at=now`), không cần gọi `remove` riêng cho từng người.
- Mọi lệnh mutate đều khoá đơn gốc `FOR UPDATE` qua `version` (giống `create`, Q62) — kể cả khi không đổi cột nào của `orders`.
- `order_line_ids` của lệnh `create` **không đổi** ở item này (Q68 không được duyệt) — vẫn lưu nguyên không kiểm thuộc đơn, như M4-01a.

## 5. Dữ liệu / Migration
Không có migration mới. Chỉ đổi schema Pydantic (`TaskAssigneeOut` thêm `id`).

## 6. UI
Không có ở item này (API-only) — xem `M4-02b-task-edit-cancel-ui.md`.

## 7. Kịch bản UAT thủ công (API — giao diện ở M4-02b)
1. `make up`; chạy lại luồng M4-01a tới khi có "Đơn D" `IN_PROGRESS` với task T1 giao Khoa+Minh.
2. Đăng nhập TECH_LEAD; `GET /orders/{D}/tasks/{T1}` qua `/smyoutask/api/docs` → thấy `assignees` kèm `id`.
3. `PATCH .../T1` đổi `estimated_hours` → 200; `POST .../T1/assignees` thêm 1 người → 200, 3 người.
4. `POST .../T1/assignees/{id}/remove` gỡ 1 người → 200, còn 2 người.
5. `POST .../T1/cancel {reason:"Không cần nữa"}` → 200 `status=CANCELLED`, `assignees` rỗng; `GET /orders/{D}` vẫn `IN_PROGRESS`.

## 8. Giả định & câu hỏi
- **Q67 — đã hỏi, không áp dụng (quyết định 2026-10-03)**: đề xuất thêm guard `estimated_hours_positive`/`due_at_not_in_past` vào lệnh `update` của task. Chủ dự án chọn **giữ nguyên** `spec/state_machines.yaml` (không sửa YAML) — bỏ AC-DSP-039; sửa đầu việc cho phép đặt số giờ/hạn hoàn thành bất kỳ, không bị server chặn bởi guard này (vẫn qua `order_in_dispatchable_state` và `allowed_task_status`). Đã cập nhật `OPEN_QUESTIONS.md`.
- **Q68 — đã hỏi, không áp dụng (quyết định 2026-10-03)**: đề xuất guard `order_line_ids_belong_to_order` cho lệnh `create`. Chủ dự án chọn **không** thêm guard này ở M4-02a — bỏ AC-DSP-055/056; `order_line_ids` tiếp tục không được kiểm thuộc đơn (như M4-01a). Lỗi an ninh ghi ở `BACKLOG.md` mục M4-02 coi như **chưa vá**, để lại cho item sau khi thực sự cần dereference trường này ở giao diện. Đã cập nhật `OPEN_QUESTIONS.md`.
- **Q69 (đề xuất: không tự gỡ phân công khi khoá nhân viên)**: xem bảng Q69 ở `OPEN_QUESTIONS.md`, vẫn ⏳ chờ chủ dự án xác nhận — không cần đổi YAML, không có AC riêng ở item này (KTV bị khoá không đăng nhập được nên không tự thao tác; QLKT dùng chính tính năng này để gỡ/thêm lại người nếu cần).
- Giả định: `task_not_cancelled` được cài vào `GUARDS` ở item này (đúng yêu cầu "chuyển từ `PENDING_GUARDS`") nhưng **không** có lệnh nào trong M4-02 dùng tới guard này trong `_check_*_guards` — chỉ unit-test hàm thuần. Nếu test sinh tự động (`test_guards_implemented`) yêu cầu guard phải được *dùng* (không chỉ tồn tại), báo lại để điều chỉnh cách tính "đã cài".
- Giả định: `assignment.remove` không yêu cầu lý do (đúng `spec/state_machines.yaml#assignment.transitions[remove].guards`, không có `reason_present`) — khác với `task.cancel` (có lý do). Giữ đúng như YAML, không hỏi thêm.
