# M6-03a — Chuyển Chỉnh sửa + Mở lại task (API)

- **Status:** Done
- **Backlog:** M6-03 (tách `a`-API / `b`-UI theo mẫu M4-01/Q59 — 2 bảng mới + 1 cột mới + 2 guard đang treo + 2 route + badge, vượt ~400 dòng non-test nếu gộp UI) · **Milestone:** M6
- **Liên quan:** `spec/state_machines.yaml#order` (lệnh `request_revision`, `AWAITING_CONFIRMATION|COMPLETED → REVISION`, capability `order.revise`, guard `reason_present`, effect `increment_revision_no`/`notify_order_owner`/`audit`); `spec/state_machines.yaml#task` (lệnh `reopen`, `allowed_task_status: [DONE]`, capability `task.reopen`, guard `order_in_revision`/`reason_present`, effect `increment_task_cycle`/`record_defect_for_previous_cycle_assignees`/`create_pending_assignments`/`fire_order_reevaluate`/`notify_assignees`/`audit`); `spec/state_machines.yaml#order` (lệnh hệ thống `all_tasks_done`, guard `revision_has_work_if_revision` — 2 guard này đang ở `PENDING_GUARDS` ghi `"M6-03"` trong `backend/app/modules/workflow/guards.py`); `spec/permissions.yaml` (`order.revise: {TECH_LEAD: all}`, `task.reopen: {TECH_LEAD: all}`); `docs/product/DOMAIN_MODEL.md` §7 (`order_revisions`) §8 (Task, cột `cycle`/`reopen_count`/`created_in_revision`) §10 (`defect_records`); `docs/product/WORKFLOWS.md` §2/§3/§5; `backend/app/modules/orders/service.py` (`_apply_transition`/`_check_guards` — mẫu `complete_order`); `backend/app/modules/dispatch/` (module task, mẫu lệnh `update`/`cancel` của `M4-02a`); M6-02 (mẫu sheet lý do, đã dùng `reason_present`).

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi muốn chuyển một đơn đã "Chờ khách xác nhận"/"Hoàn tất" sang "Chỉnh sửa" kèm lý do, rồi mở lại một đầu việc đã xong để làm lại — hệ thống tự ghi nhận ai đã làm lỗi ở chu kỳ trước (ghi nhận lỗi) để tính KPI sau này.

## 2. Phạm vi
Tách theo mẫu M4-01 (Q59): item này là **M6-03a — API** (2 bảng mới `order_revisions`/`defect_records`, 1 cột mới trên `tasks`, 2 guard đang treo, 2 route lệnh, 1 route hệ thống nối guard, badge `revision_count`). Giao diện (nút "Chuyển Chỉnh sửa" trên trang đơn, "Mở lại" trên đầu việc, trang `/dispatch/revisions`) ở `M6-03b-revision-reopen-ui.md`.

- **Trong phạm vi:**
  - Migration: bảng `order_revisions` (DOMAIN_MODEL §7: `order_id, revision_no, reason, requested_by, requested_at`); bảng `defect_records` (DOMAIN_MODEL §10: `task_id, cycle, assignment_id, employee_id, reason, severity (MINOR|MAJOR), reported_by, created_at`, mặc định `excluded_from_kpi=false` — cột này tồn tại sẵn trong migration để M8 dùng, **không** có API đọc/sửa nó ở item này); thêm cột `tasks.last_reopened_in_revision int null` (ghi `order.revision_no` tại thời điểm `reopen`; dùng cùng `created_in_revision` để tính guard `revision_has_work_if_revision` — xem §8 "Ghi chú kỹ thuật").
  - Cài guard `order_in_revision` (đăng ký `GUARDS`, bỏ khỏi `PENDING_GUARDS`).
  - Cài guard `revision_has_work_if_revision`: `order.revision_no ∈ {task.created_in_revision, task.last_reopened_in_revision}` của ≥1 task không bị huỷ thuộc đơn.
  - `POST /api/v1/orders/{id}/revise` — lệnh `request_revision`: `AWAITING_CONFIRMATION|COMPLETED → REVISION`; `revision_no += 1`; tạo 1 dòng `order_revisions`; tái dùng khung `_apply_transition`/`_check_guards` (như `complete`/`cancel_active`).
  - `can_revise: bool` trên `OrderDetail` (mẫu `can_complete`) — `status ∈ {AWAITING_CONFIRMATION, COMPLETED} && order.revise ∈ scope`.
  - `POST /api/v1/orders/{order_id}/tasks/{task_id}/reopen` — lệnh `reopen`: chỉ khi `task.status == DONE`; `cycle += 1`, `reopen_count += 1`, `last_reopened_in_revision = order.revision_no`; với **mỗi** assignment `DONE` của chu kỳ trước (không đổi, giữ nguyên lịch sử): tạo 1 dòng `defect_records` (`reason`, `severity` theo body, `reported_by` = actor) **và** 1 assignment `PENDING` mới cùng chu kỳ mới cho **đúng người đó** (tự động — không cho chọn người khác ở item này, xem §8); sau đó `fire_order_reevaluate` (trạng thái task tính lại → `PENDING_ACCEPTANCE`; đơn vẫn `REVISION` vì còn task chưa `DONE`).
  - Nối lại `all_tasks_done` (đã có từ M4/M5) thêm guard `revision_has_work_if_revision` khi đơn đang `REVISION` — nếu chưa có task nào tạo/mở lại trong `revision_no` hiện tại, **không** tự chuyển `AWAITING_CONFIRMATION` dù mọi task `DONE`.
  - Badge `revision_count` (đã khai trong `spec/permissions.yaml`, mục `dispatch-revise`, chưa có provider) — đếm số đơn `status = REVISION`, trả cho actor có `task.manage`.
  - Effect `audit` cho `request_revision` và `reopen` (tái dùng `audit.service.record`).
- **Ngoài phạm vi (để lại milestone sau):**
  - UI (`M6-03b`).
  - Đánh dấu `excluded_from_kpi` trên `defect_records` — để `M8-01` (báo cáo KPI).
  - Chọn người khác (không phải người cũ) khi mở lại task — xem §8.
  - `customer_feedback`/`result_note` — vẫn chưa gán vào luồng nào (Q73 vẫn mở).

## 3. Acceptance Criteria
Dữ liệu mẫu (tiếp theo M6-02): **Nguyễn Văn An** `NV001` [MANAGER]; **Vũ Thị Hoa** `NV005` [SALE, tạo đơn]; **Phạm Quang Tuấn** `NV010` [TECH_LEAD]; **Trần Minh Khoa** `NV014` [TECHNICIAN]; **Lê Văn Minh** `NV012` [TECHNICIAN]; **Đặng Văn Long** `NV016` [TECHNICIAN, không liên quan]. Đơn **DH2610-0020**: sau M6-02 đang `COMPLETED`, `revision_no=0`, `version=6`, có task T1 (`DONE`, cycle=1) do Khoa làm (1 assignment `DONE`).

### `request_revision` (đơn)

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-144 | DH2610-0020 `COMPLETED`, `version=6`, `revision_no=0` | Tuấn (TECH_LEAD) `POST /api/v1/orders/{id}/revise {version:6, reason:"Camera tầng 2 lắp sai vị trí, khách yêu cầu chỉnh lại"}` | 200 `OrderDetail`: `status="REVISION"`, `revision_no=1`, `version=7`; 1 dòng `order_revisions {revision_no:1, reason, requested_by:Tuấn.id}`; 1 `audit_events` (`entity_type=ORDER, action=request_revision, from_status=COMPLETED, to_status=REVISION, data.reason`); `allowed_commands` không còn `request_revision`, có `complete` KHÔNG còn (vì không ở `AWAITING_CONFIRMATION`) | integration |
| AC-ORD-145 | Đơn khác "DH2610-0021" `AWAITING_CONFIRMATION`, `version=M`, `revision_no=0` | Tuấn `revise {version:M, reason:"Thiếu 1 đầu ghi theo hợp đồng"}` | 200; hoạt động như AC-ORD-144 (`from_status=AWAITING_CONFIRMATION`) | integration |
| AC-ORD-146 | DH2610-0021 như trên | Khoa (TECHNICIAN, được giao), Long (TECHNICIAN, không liên quan), Hoa (SALE, chủ đơn), An (MANAGER) đều gọi `revise` | cả 4: 403 `FORBIDDEN` (`order.revise` chỉ `TECH_LEAD`, không có `assigned`/`own`) | integration |
| AC-ORD-147 | DH2610-0021 | Tuấn `revise {version, reason:""}` và `{reason:"   "}` và `{reason:"lỗi"}` (4 ký tự, trim < 5) | cả 3: 409 `GUARD_FAILED` guard=`reason_present`; đơn không đổi | integration |
| AC-ORD-148 | Đơn "DH2610-0022" đang `IN_PROGRESS`/`PENDING_DISPATCH`/`DRAFT`/`REVISION` (seed 4 đơn) | Tuấn `revise` trên từng đơn | cả 4: 409 `INVALID_TRANSITION` (`request_revision` chỉ từ `AWAITING_CONFIRMATION`/`COMPLETED`); đơn không đổi | integration |
| AC-ORD-149 | DH2610-0021, `version` thật = `M` | Tuấn `revise {version: M-1, reason hợp lệ}` | 409 `STALE_VERSION`; đơn không đổi | integration |
| AC-ORD-150 | — | route `POST /orders/{id}/revise` | khai đúng 1 capability `order.revise`; nằm trong ma trận RBAC route thật | generated |
| AC-ORD-151 | DH2610-0021 `AWAITING_CONFIRMATION` | `GET /orders/{id}` bởi Tuấn → `can_revise=true`; bởi Hoa/An (không có `order.revise`) → `can_revise=false`; đơn "DH2610-0022" `IN_PROGRESS` bởi Tuấn → `can_revise=false` | integration |

### `reopen` (task) + `defect_records`

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DSP-108 | DH2610-0020 nay `REVISION` (`revision_no=1`, tiếp AC-ORD-144), task T1 `DONE` (cycle=1), 1 assignment `DONE` của Khoa, `order.version=7` | Tuấn `POST /api/v1/orders/{order_id}/tasks/{T1.id}/reopen {version:7, reason:"Camera lắp sai vị trí, cần lắp lại đúng chỗ theo bản vẽ", severity:"MAJOR"}` | 200 `TaskDetail`: `cycle=2`, `reopen_count=1`, `status="PENDING_ACCEPTANCE"` (1 assignment `PENDING` mới của Khoa, cycle=2); assignment `DONE` cycle=1 của Khoa **giữ nguyên** không đổi; 1 dòng `defect_records {task_id:T1.id, cycle:1, assignment_id:(assignment DONE cũ).id, employee_id:Khoa.id, reason, severity:"MAJOR", reported_by:Tuấn.id}`; 1 `audit_events` (`entity_type=TASK, action=reopen, from_status=DONE, to_status=PENDING_ACCEPTANCE`); `order.version=8`; đơn vẫn `REVISION` (còn task chưa `DONE`) | integration |
| AC-DSP-109 | Task T4 (đơn khác đang `REVISION`) `DONE` với 2 assignment `DONE` (Khoa + Minh, cả hai hoàn thành) | Tuấn `reopen {version, reason:"Cả 2 camera lắp lệch góc", severity:"MINOR"}` | 200; `cycle += 1`; **2** dòng `defect_records` mới (1/người); **2** assignment `PENDING` mới cùng cycle mới, đúng Khoa + Minh (không thêm/bớt người) | integration |
| AC-DSP-110 | DH2610-0021 (từ AC-ORD-145) vẫn `AWAITING_CONFIRMATION` (chưa gọi `revise`), có task `DONE` | Tuấn `reopen` trên task đó | 409 `GUARD_FAILED` guard=`order_in_revision`; không tạo `defect_records`/assignment mới | integration |
| AC-DSP-111 | Task đang `ACCEPTED`/`IN_PROGRESS`/`PENDING_ACCEPTANCE`/`CANCELLED` (seed 4 task, đơn `REVISION`) | Tuấn `reopen` từng task | cả 4: 409 `INVALID_TRANSITION` (ngoài `allowed_task_status: [DONE]`) | integration |
| AC-DSP-112 | Task T1 `DONE`, đơn `REVISION` | Tuấn `reopen {version, reason:""}` và `{reason:"lỗi"}` (< 5 ký tự trim) | cả 2: 409 `GUARD_FAILED` guard=`reason_present`; task không đổi | integration |
| AC-DSP-113 | Task T1 `DONE`, đơn `REVISION` | Khoa (TECHNICIAN, chính người làm T1), Long, Hoa, An gọi `reopen` | cả 4: 403 `FORBIDDEN` (`task.reopen` chỉ `TECH_LEAD`) | integration |
| AC-DSP-114 | `task_id` thuộc đơn khác với `order_id` trong URL | Tuấn `reopen` | 404 `NOT_FOUND` | integration |
| AC-DSP-115 | Task T1 `DONE`, đơn `REVISION`, `version` thật = `M` | Tuấn `reopen {version: M-1, ...}` | 409 `STALE_VERSION` | integration |
| AC-DSP-116 | — | route `POST /orders/{order_id}/tasks/{task_id}/reopen` | khai đúng 1 capability `task.reopen` | generated |
| AC-DSP-117 | Đơn `REVISION` (`revision_no=2`), task T1 vừa `reopen` ở revision này (`last_reopened_in_revision=2`), là task duy nhất chưa `DONE`; Khoa `accept`→`start`→`complete` assignment mới | sau `complete` (hệ thống `fire_order_reevaluate`) | mọi task không-huỷ đều `DONE`; guard `revision_has_work_if_revision` **pass** (T1 có `last_reopened_in_revision = revision_no`); hệ thống `all_tasks_done` chạy: đơn → `AWAITING_CONFIRMATION`; 1 `audit_events` hệ thống (`actor_id=null`) | integration |
| AC-DSP-118 | Đơn `REVISION` (`revision_no=1`) có 1 task `DONE` với `created_in_revision=0`, `last_reopened_in_revision=null` (chưa từng tạo/mở lại ở `revision_no=1` — ví dụ hợp lý: `request_revision` gọi nhưng QLKT chưa làm gì) | gọi guard `revision_has_work_if_revision(order, tasks)` trực tiếp | trả `False` (không có task nào khớp `created_in_revision`/`last_reopened_in_revision = 1`) | unit |
| AC-DSP-119 | Đơn `PENDING_DISPATCH`, có task `created_in_revision=0` | `GET /me` bởi Tuấn, An, Hoa khi có N đơn `REVISION` | Tuấn (`task.manage`): `counters.revision_count == N`; An/Hoa (không có `task.manage`): không có khoá `revision_count` trong `counters` | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{id}/revise | order.revise | `{ version: int, reason: string }` | `OrderDetail` | 403, 404, 409 (`INVALID_TRANSITION`, `GUARD_FAILED`, `STALE_VERSION`) |
| POST | /api/v1/orders/{order_id}/tasks/{task_id}/reopen | task.reopen | `{ version: int, reason: string, severity: "MINOR"\|"MAJOR" }` | `TaskDetail` | 403, 404, 409, 422 |

`reason` ở cả 2 route: kiểu `str` không ép `min_length` ở schema (giống `OrderCancel.reason`) — guard `reason_present` xử lý rỗng/<5 ký tự trim bằng 409 `GUARD_FAILED`, không phải 422. `severity`: enum chặt ở schema → giá trị ngoài `MINOR`/`MAJOR` → 422 `VALIDATION_ERROR`.

**Thứ tự kiểm tra** (giống `complete`/`cancel_active`): (1) tồn tại + trong scope → 404; (2) `version` → 409 `STALE_VERSION`; (3) trạng thái hiện tại ∈ `from`/`allowed_task_status` → 409 `INVALID_TRANSITION`; (4) guard theo thứ tự khai trong `state_machines.yaml` (`reopen`: `order_in_revision` rồi `reason_present`) → 409 `GUARD_FAILED`.

`OrderDetail` thêm `can_revise: bool`.

## 5. Dữ liệu / Migration
- `order_revisions(id uuid pk, order_id uuid fk orders, revision_no int, reason text, requested_by uuid fk employees, requested_at timestamptz default now())`. Index `(order_id)`.
- `defect_records(id uuid pk, task_id uuid fk tasks, cycle int, assignment_id uuid fk assignments, employee_id uuid fk employees, reason text, severity varchar check (MINOR, MAJOR), reported_by uuid fk employees, excluded_from_kpi bool default false, excluded_reason text null, created_at timestamptz default now())`. Index `(employee_id)`, `(task_id)`. Cột `excluded_from_kpi`/`excluded_reason` chỉ tạo sẵn cho `M8-01`, không có route đọc/sửa ở item này.
- `tasks` thêm cột `last_reopened_in_revision int null`.

## 6. Ghi chú kỹ thuật & câu hỏi
- **Ghi chú (không phải quy tắc nghiệp vụ mới):** `spec/state_machines.yaml` đặt guard `revision_has_work_if_revision` nhưng không nêu cơ chế lưu trữ. Chọn: thêm cột `tasks.last_reopened_in_revision` (song song `created_in_revision` đã có) — guard kiểm `EXISTS task không-huỷ của đơn với created_in_revision = order.revision_no OR last_reopened_in_revision = order.revision_no`. Đây là quyết định triển khai (không đổi hành vi nghiệp vụ đã chốt trong YAML), nêu ở đây để chủ dự án biết khi đọc migration.
- **Giả định — người được giao lại khi `reopen`:** `spec/state_machines.yaml#task.reopen` chỉ khai 2 guard (`order_in_revision`, `reason_present`), **không** có `at_least_one_assignee`/`assignees_are_active_technicians` như lệnh `create`. `docs/product/WORKFLOWS.md` §3 lại viết "tạo assignment PENDING mới cho người được chọn (người cũ hoặc mới)" — gợi ý có chọn người. Vì `spec/*.yaml` là nguồn sự thật ưu tiên cao nhất (không có guard kiểm người được chọn hợp lệ), item này chọn: **tự động giao lại đúng những người đã `DONE` ở chu kỳ trước**, không cho chọn người khác — tránh phải thêm guard chưa được duyệt. Nếu chủ dự án muốn chọn người khi mở lại (đúng như WORKFLOWS.md viết), cần duyệt thêm guard `assignees_are_active_technicians` vào `reopen` trong `spec/state_machines.yaml` trước — đó sẽ là `M6-03c`.
- **Câu hỏi mới — Q75 (thêm vào `OPEN_QUESTIONS.md`):** `severity` (MINOR/MAJOR) khi `reopen` — ai chọn và có bắt buộc? Giả định mặc định: TECH_LEAD chọn khi mở lại (ô chọn bắt buộc, không có mặc định sẵn — buộc cân nhắc mỗi lần) vì không có guard nào trong YAML ép buộc hay mặc định giá trị này, và đây ảnh hưởng điểm KPI (M8) nên không nên để hệ thống tự chọn.
