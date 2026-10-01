# M4-01a — Hàng đợi điều phối + tạo task + giao nhiều KTV: API

- **Status:** Approved
- **Backlog:** M4-01 (tách thành M4-01a API / M4-01b giao diện — Q59) · **Milestone:** M4
- **Liên quan:** `spec/state_machines.yaml#task` (lệnh `create`, guard `order_in_dispatchable_state`/`at_least_one_assignee`/`assignees_are_active_technicians`/`estimated_hours_positive`/`due_at_not_in_past`, effect `create_pending_assignments`/`fire_order_start_dispatch_if_first_task`/`notify_assignees`/`audit`); `spec/state_machines.yaml#order` (transition hệ thống `start_dispatch`, guard `order_has_no_tasks` của `recall`/`cancel`); `spec/permissions.yaml` (`task.manage`: TECH_LEAD all; `order.read`: MANAGER/SALE/TECH_LEAD all, TECHNICIAN assigned; badge `pending_dispatch_count`); `docs/product/DOMAIN_MODEL.md` §8 (Task) §9 (Assignment); `docs/product/WORKFLOWS.md` §2 (sơ đồ đơn, chuyển "system") §3 (trạng thái task suy ra) §6 (khoá `FOR UPDATE` theo đơn gốc); `backend/app/modules/workflow/guards.py` (5 guard đang ở `PENDING_GUARDS` ghi `"M4-01"`); `backend/app/modules/orders/service.py` `RULES["assigned"]` (hiện fail-closed, ghi chú "Task/Assignment don't exist until M4/M5"); `M3-03a-order-transitions-api.md` §8 (ghi chú guard `order_has_no_tasks` tạm trả `True`)

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi muốn xem hàng đợi đơn chờ điều phối (sắp theo ưu tiên + ngày hẹn), tạo đầu việc và giao cho một hoặc nhiều kỹ thuật viên — đơn tự chuyển sang "Đang thực hiện" ngay khi có task đầu tiên.

## 2. Phạm vi
Tách theo mẫu M3-02/M3-03: item này là **M4-01a — API** (bảng `tasks`/`assignments`, 5 guard đang treo, lệnh tạo task, danh sách hàng đợi, bộ đếm badge). Giao diện (trang hàng đợi, panel tạo task, tab "Đầu việc" trên trang chi tiết đơn) ở `M4-01b-dispatch-task-create-ui.md`. Gộp chung ước lượng vượt ~400 dòng non-test (2 bảng DB mới + state machine task/assignment + 5 guard + 3 route + trang hàng đợi + form tạo task nhiều người + tab đầu việc), nên tách (Q59).

- **Trong phạm vi:**
  - Migration tạo bảng `tasks`, `assignments` (DOMAIN_MODEL §8/§9).
  - Cài 5 guard đang ở `PENDING_GUARDS` ghi `"M4-01"`: `order_in_dispatchable_state`, `at_least_one_assignee`, `assignees_are_active_technicians`, `estimated_hours_positive`, `due_at_not_in_past`; đăng ký vào `GUARDS`.
  - Nối lại guard `order_has_no_tasks` (đã cài ở M3-03a nhưng luôn trả `True` vì chưa có bảng `tasks`) theo số task thật (kể cả đã huỷ) của đơn.
  - Nối `RULES["assigned"]` của `orders/service.py` theo bảng `assignments` thật (hiện fail-closed) — ảnh hưởng `GET /orders`, `GET /orders/{id}`, `GET /orders/{id}/history` cho TECHNICIAN.
  - `POST /orders/{id}/tasks` — lệnh `create` của task: tạo task + N assignment `PENDING`; nếu là task đầu tiên của đơn và đơn đang `PENDING_DISPATCH` → chuyển hệ thống `start_dispatch` (đơn → `IN_PROGRESS`) trong cùng transaction.
  - `GET /orders/{id}/tasks` — danh sách task tối giản của 1 đơn (để xác nhận đã tạo; bảng/Kanban đầy đủ là M4-03).
  - `GET /orders` mở rộng: thêm `sort=dispatch` (ưu tiên giảm dần, rồi ngày hẹn tăng dần, `null` cuối) cho hàng đợi — không đổi hành vi mặc định hiện có.
  - Badge `pending_dispatch_count` (đã khai trong `spec/permissions.yaml`, chưa có provider) — đăng ký đếm số đơn `PENDING_DISPATCH`.
  - Effect `audit` cho lệnh `create` (task) và chuyển hệ thống `start_dispatch`.
- **Ngoài phạm vi (để lại milestone sau):** sửa/huỷ task, thêm/gỡ người, `NEEDS_ASSIGNEE` (M4-02); Kanban/bảng đầu việc đầy đủ, lọc theo KTV/hạn/ưu tiên (M4-03); accept/reject/start/complete assignment (M5); effect `notify_assignees` — xem Q60 (đề xuất bỏ qua như Q54); trang hàng đợi + form tạo task (M4-01b).

## 3. Acceptance Criteria
> Fixture: Hoa (SALE, chủ đơn), An (MANAGER), Tuấn (TECH_LEAD — có `task.manage`/`order.read` scope `all`, **không** có `order.submit`/`order.cancel`). Kỹ thuật viên: Khoa và Minh (TECHNICIAN, đang hoạt động), Lan (TECHNICIAN, `is_active=false`). "Đơn D": `PENDING_DISPATCH` (Hoa submit), khách `KH00001`, `service_address` hợp lệ, chưa có task, `version=N`.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DSP-001 | "Đơn D" `PENDING_DISPATCH`, 0 task, `version=N` | Tuấn `POST /orders/{id}/tasks {version:N, title:"Lắp đặt 4 camera tầng 1", estimated_hours:4, due_at:"2026-10-05T09:00:00+07:00", priority:"HIGH", assignee_ids:[Khoa.id, Minh.id]}` | 200 `TaskDetail`: `code="{Đơn D.code}-T1"`, `origin="INITIAL"`, `cycle=1`, `status="PENDING_ACCEPTANCE"`, `assignees` 2 phần tử đều `status="PENDING"`; `order_status="IN_PROGRESS"`, `order_version=N+1`; đúng 2 `audit_events` mới: `entity_type=TASK,action=create,to_status=PENDING_ACCEPTANCE,actor_id=Tuấn.id` và `entity_type=ORDER,action=start_dispatch,from_status=PENDING_DISPATCH,to_status=IN_PROGRESS,actor_id=null` | integration |
| AC-DSP-002 | Tiếp AC-DSP-001: "Đơn D" nay `IN_PROGRESS`, 1 task, `version=N+1` | Tuấn tạo task thứ 2: `{version:N+1, title:"Kiểm tra đầu ghi", estimated_hours:2, due_at:"2026-10-06T09:00:00+07:00", priority:"NORMAL", assignee_ids:[Khoa.id]}` | 200; `code="{Đơn D.code}-T2"`; `order_status` vẫn `"IN_PROGRESS"` (không bắn `start_dispatch` lần 2); `order_version=N+2` (mọi lệnh thuộc aggregate đơn đều tăng version — Q62); chỉ 1 `audit_events` mới (`TASK create`) | integration |
| AC-DSP-003 | "Đơn E" còn `DRAFT` (chưa gửi) | Tuấn tạo task trên Đơn E | 409 `GUARD_FAILED` guard=`order_in_dispatchable_state`; không có task/assignment nào được tạo | integration |
| AC-DSP-004 | "Đơn F" seed thẳng DB `status="CANCELLED"` | Tuấn tạo task trên Đơn F | 409 `GUARD_FAILED` guard=`order_in_dispatchable_state` | integration |
| AC-DSP-005 | "Đơn G" `PENDING_DISPATCH`, 0 task | Tuấn tạo task với `assignee_ids: []` | 409 `GUARD_FAILED` guard=`at_least_one_assignee` | integration |
| AC-DSP-006 | "Đơn G" như trên | Tuấn tạo task với `assignee_ids:[Lan.id]` (TECHNICIAN nhưng đã khoá) → 409 guard=`assignees_are_active_technicians`; thử lại với `assignee_ids:[An.id]` (MANAGER, không phải TECHNICIAN) → cùng guard | integration |
| AC-DSP-007 | "Đơn G" như trên | Tuấn tạo task với `estimated_hours:0` → 409 guard=`estimated_hours_positive`; `estimated_hours:201` → cùng guard; `estimated_hours:1.3` (không chia hết 0.25) → cùng guard | integration |
| AC-DSP-008 | "Đơn G" như trên | Tuấn tạo task với `due_at` là ngày giờ hôm qua | 409 `GUARD_FAILED` guard=`due_at_not_in_past` | integration |
| AC-DSP-009 | "Đơn G" như trên, dữ liệu hợp lệ | Hoa (SALE) / An (MANAGER, theo Q05 không có `task.manage`) / Khoa (TECHNICIAN) gọi `POST /orders/{id}/tasks` | cả 3: 403 `FORBIDDEN`; Tuấn gọi cùng request → 200 | integration |
| AC-DSP-010 | "Đơn G" `version` hiện tại là `M` | Tuấn `POST /orders/{id}/tasks {version: M-1, ...hợp lệ}` | 409 `STALE_VERSION`; không có task/assignment nào được tạo | integration |
| AC-DSP-011 | 4 đơn `PENDING_DISPATCH`: "Đơn H" (`priority=NORMAL, requested_date=2026-10-10`), "Đơn I" (`URGENT, 2026-10-12`), "Đơn K" (`HIGH, 2026-10-08`), "Đơn L" (`LOW, requested_date=null`) | Tuấn `GET /orders?status=PENDING_DISPATCH&sort=dispatch` | 200; thứ tự `items`: Đơn I (URGENT) → Đơn K (HIGH) → Đơn H (NORMAL) → Đơn L (LOW, `requested_date=null` luôn ở cuối); `GET /orders?status=PENDING_DISPATCH` (không có `sort`) vẫn sắp theo `created_at desc` như cũ (không đổi hành vi mặc định) | integration |
| AC-DSP-012 | 4 đơn `PENDING_DISPATCH` như AC-DSP-011 | Tuấn `GET /me` | `counters.pending_dispatch_count == 4`; Hoa (SALE, không có `task.manage` nên không thấy mục menu "Đơn chờ điều phối") `GET /me` → `counters` không có khoá `pending_dispatch_count` | integration |
| AC-DSP-013 | "Đơn D" sau AC-DSP-001/002 có 2 task (T1: Khoa+Minh, T2: Khoa) | Tuấn/An/Hoa (chủ đơn, `order.read`) `GET /orders/{Đơn D.id}/tasks` | cả 3: 200 `{items}` 2 phần tử, sắp `created_at asc` (T1 trước T2), mỗi item `{id, code, title, status, estimated_hours, due_at, priority, assignees:[{employee_id, full_name}]}`; Khoa (TECHNICIAN, được giao cả 2 task) → 200 cùng dữ liệu; Lan (TECHNICIAN, không liên quan đơn D) → 404 | integration |
| AC-DSP-014 | — | mọi route mới (`POST /orders/{id}/tasks`, `GET /orders/{id}/tasks`) | khai đúng 1 capability (`task.manage`/`order.read`); nằm trong ma trận RBAC route thật | generated |
| AC-ORD-115 | "Đơn L" `PENDING_DISPATCH`, 0 task, `version=P` | Hoa `recall {version:P}` → 200 `DRAFT` (như M3-03a, không bị guard `order_has_no_tasks` chặn vì chưa có task); đơn mới "Đơn M" `PENDING_DISPATCH`, 0 task | Hoa `cancel {version, reason:"Khách đổi ý"}` → 200 `CANCELLED` | integration |
| AC-ORD-116 | "Đơn D" đã `IN_PROGRESS` (có task, từ AC-DSP-001), `version` hiện tại | Hoa `recall {version}` | 409 `INVALID_TRANSITION` (`recall` chỉ từ `PENDING_DISPATCH`, đơn đã `IN_PROGRESS` ngay khi có task đầu tiên — xem ghi chú §8 về guard `order_has_no_tasks`); Hoa `cancel` cùng đơn → cũng 409 `INVALID_TRANSITION` | integration |
| AC-ORD-117 | Khoa được giao 1 trong 2 task của "Đơn D" (từ AC-DSP-001) | Khoa `GET /orders` | 200, `items` gồm "Đơn D" (scope `assigned` nay trả dữ liệu thật — trước M4-01a luôn rỗng); Khoa `GET /orders/{Đơn D.id}` → 200; Khoa `GET /orders/{id}` của đơn Khoa không liên quan → 404 | integration |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{id}/tasks | task.manage | `{version, title, description?, estimated_hours, due_at, priority?, order_line_ids?, assignee_ids}` | 200 `TaskDetail` (gồm `order_status`, `order_version`) | 403, 404, 409, 422 |
| GET | /api/v1/orders/{id}/tasks | order.read | — | `{items}` (item = `TaskSummary`) | 404 |
| GET | /api/v1/orders | order.read | **mới** `sort=created_at_desc\|dispatch` (mặc định `created_at_desc`, giữ nguyên hành vi cũ); các tham số khác như M3-03a | `{items, total, limit, offset}` | 422 |

Ghi chú:
- `priority` bỏ trống → mặc định lấy `priority` hiện tại của đơn (Q63). `due_at` là ngày-giờ đầy đủ (không chỉ ngày).
- `order_line_ids` (tuỳ chọn) không kiểm tra có thuộc đơn này hay không ở item này — chỉ lưu nguyên vào cột (DOMAIN_MODEL §8 ghi "tuỳ chọn").
- `TaskDetail`: `{id, code, order_id, title, description, origin, created_in_revision, status, estimated_hours, due_at, priority, cycle, order_line_ids, assignees:[{employee_id, full_name, status}], created_by, created_at, order_status, order_version}`.
- `TaskSummary` (item của `GET /orders/{id}/tasks`): `{id, code, title, status, estimated_hours, due_at, priority, assignees:[{employee_id, full_name}]}`.
- `sort=dispatch`: `ORDER BY CASE priority WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'NORMAL' THEN 2 ELSE 1 END DESC, requested_date ASC NULLS LAST, created_at ASC`.

## 5. Dữ liệu / Migration
Migration mới `<timestamp>_add_tasks_and_assignments.py`:
- `tasks(id uuid pk, order_id uuid fk orders, code varchar(24) unique, title varchar(200), description text null, origin varchar check (INITIAL,ADDITIONAL), created_in_revision int, status varchar check (6 trạng thái task), estimated_hours numeric(5,2), due_at timestamptz, priority varchar check (LOW,NORMAL,HIGH,URGENT), cycle int default 1, order_line_ids uuid[] null, cancelled_at timestamptz null, cancel_reason text null, created_by uuid fk employees, created_at/updated_at timestamptz default now())`. Index `(order_id)`.
- `assignments(id uuid pk, task_id uuid fk tasks, employee_id uuid fk employees, cycle int, status varchar check (6 trạng thái assignment), reject_reason_code varchar null check, reject_reason_text text null, accepted_at/started_at/done_at/rejected_at/removed_at timestamptz null, actual_hours numeric(5,2) null, completion_note text null, assigned_by uuid fk employees, created_at timestamptz default now())`. Index `(task_id)`, `(employee_id)`. Unique partial index `(task_id, employee_id, cycle) WHERE status IN ('PENDING','ACCEPTED','IN_PROGRESS','DONE')` (DOMAIN_MODEL §9 — có hiệu lực từ M4-02 khi có lệnh thêm người, nhưng tạo index ngay ở migration này).
- `task.code` sinh bằng `COUNT(*) FROM tasks WHERE order_id=:id` (kể cả đã huỷ) `+ 1`, tính trong cùng transaction đã khoá `orders` `FOR UPDATE` — không cần bảng `code_sequences` riêng.

## 6. UI
Không có ở item này (API-only) — xem `M4-01b-dispatch-task-create-ui.md`.

## 7. Kịch bản UAT thủ công (API — giao diện ở M4-01b)
1. `make up`; đăng nhập Sale, tạo + gửi 1 đơn đủ điều kiện → `PENDING_DISPATCH`.
2. Đăng nhập TECH_LEAD; `GET /orders?status=PENDING_DISPATCH&sort=dispatch` thấy đơn vừa gửi qua `/smyoutask/api/docs`.
3. `POST /orders/{id}/tasks` với 2 `assignee_ids` (2 KTV đang hoạt động) → 200; `GET /orders/{id}` thấy `status=IN_PROGRESS`.
4. `GET /orders/{id}/tasks` thấy task vừa tạo với đúng 2 người được giao.
5. `GET /me` thấy `counters.pending_dispatch_count` giảm 1 so với bước 2.

## 8. Giả định & câu hỏi
- Guard `order_has_no_tasks` (nối lại ở item này) **không còn 409 nào quan sát được qua `recall`/`cancel`** sau khi có task: ngay khi đơn có task đầu tiên, `start_dispatch` đã chuyển đơn khỏi `PENDING_DISPATCH` trong cùng transaction, nên `recall`/`cancel` gặp `INVALID_TRANSITION` (sai `from`) trước khi guard được xét tới (AC-ORD-116). Vẫn nối guard theo đúng ngữ nghĩa YAML (đếm task thật, kể cả đã huỷ) để đúng tinh thần cài đặt — không phải lỗi, chỉ là guard trở nên "phòng thủ" không bao giờ là lý do chặn chính trong luồng hiện có.
- **Câu hỏi mới — Q59 (đề xuất: tách M4-01a/M4-01b)**: M4-01 gộp đủ backend (2 bảng mới + state machine task/assignment + 5 guard) và giao diện (trang hàng đợi + form tạo task nhiều người + tab Đầu việc) sẽ vượt ~400 dòng non-test. *Đề xuất:* tách như M3-02/M3-03 — M4-01a (item này, API) và `M4-01b-dispatch-task-create-ui.md` (giao diện), cập nhật `BACKLOG.md`.
- **Câu hỏi mới — Q60 (đề xuất: bỏ qua `notify_assignees`, giống Q54)**: lệnh `create` của task khai `effects: [..., notify_assignees, audit]`, nhưng module Thông báo chưa xây (M7-01). *Đề xuất:* chỉ cài effect `audit`; `notify_assignees` để M7-01 bắn thật.
- **Câu hỏi mới — Q61 (đề xuất: dùng `order.read`, giống Q55)**: `GET /orders/{id}/tasks` cần hiện cho mọi vai trò xem được đơn (Sale/Manager xem đơn mình tạo), nhưng `task.read` trong `spec/permissions.yaml` không cấp cho SALE. *Đề xuất:* route dùng capability `order.read` (không phải `task.read`) — nhất quán với `GET /orders/{id}/history` (Q55); `task.read` để dành cho các route hành động trên task ở M4-02+ (sửa/xem chi tiết dành cho TECH_LEAD/TECHNICIAN).
- **Câu hỏi mới — Q62 (đề xuất: `orders.version` tăng ở mọi lệnh thuộc aggregate đơn)**: `WORKFLOWS.md` §6 ghi "khoá đơn gốc, kể cả khi lệnh nhắm vào assignment" nhưng không nói rõ `version` có tăng khi lệnh không đổi cột nào của `orders` (ví dụ tạo task thứ 2, đơn đã `IN_PROGRESS` từ trước). *Đề xuất:* coi Order là aggregate root (DDD) — **mọi** lệnh `task.*`/`assignment.*` tăng `orders.version` dù không đổi cột hiển thị nào, để một bộ đếm `version` duy nhất chống ghi đè cho toàn bộ task/assignment của đơn đó (áp dụng từ M4-01 tới M6).
- **Câu hỏi mới — Q63 (đề xuất: `priority` của task mặc định lấy theo đơn)**: DOMAIN_MODEL §8 chỉ ghi "priority enum như order", không nói rõ mặc định khi tạo task nếu bỏ trống. *Đề xuất:* nếu request không gửi `priority`, lấy `priority` hiện tại của đơn tại thời điểm tạo task (gợi ý hợp lý, QLKT vẫn đổi được).
