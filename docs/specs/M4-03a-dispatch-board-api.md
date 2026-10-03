# M4-03a — Bảng đầu việc: API

- **Status:** Approved
- **Backlog:** M4-03a (tách thành M4-03a API / M4-03b giao diện, theo mẫu M4-01/M4-02) · **Milestone:** M4
- **Liên quan:** `spec/state_machines.yaml#task` (`derived_status`, 6 trạng thái `task.states` — thứ tự cột Kanban lấy đúng thứ tự khai báo ở đây: `NEEDS_ASSIGNEE, PENDING_ACCEPTANCE, ACCEPTED, IN_PROGRESS, DONE, CANCELLED`); `spec/permissions.yaml` (`task.read`: `MANAGER: all, TECH_LEAD: all, TECHNICIAN: assigned` — capability đã có, không sửa YAML ở item này); `docs/product/DOMAIN_MODEL.md` §8 (Task) §9 (Assignment); `backend/app/modules/dispatch/domain.py` (`_INACTIVE_ASSIGNMENT_STATUSES = ("REJECTED", "REMOVED")` — định nghĩa "phân công đang hoạt động" dùng lại cho cả danh sách `assignees` của mỗi task và bộ lọc `assignee_id`); `backend/app/modules/audit/router.py` (mẫu `occurred_from`/`occurred_to` cho bộ lọc theo ngày — dùng lại tên cho `due_from`/`due_to`); `M4-01a-dispatch-task-create-api.md` (`TaskSummary`/`TaskListOut`, ghi rõ "bảng/Kanban đầy đủ là M4-03"); `M4-02a-task-edit-cancel-api.md` (ghi rõ "Kanban/bảng đầu việc đầy đủ (M4-03)" ngoài phạm vi)

## 1. Mục tiêu
Là Quản lý kỹ thuật (hoặc Quản lý), tôi muốn một endpoint trả về toàn bộ đầu việc của công ty — lọc được theo kỹ thuật viên, hạn hoàn thành, độ ưu tiên và trạng thái — để giao diện dựng được bảng Kanban/danh sách lọc (M4-03b) mà không phải gọi `GET /orders/{id}/tasks` cho từng đơn.

## 2. Phạm vi
Tách theo mẫu M4-01/M4-02: item này là **API**. Giao diện (Kanban desktop, danh sách lọc mobile, các ô lọc) ở `M4-03b-dispatch-board-ui.md`.

- **Trong phạm vi:**
  - `GET /api/v1/tasks` (mới, không nằm dưới `/orders/{id}`): trả **toàn bộ** task (không phân trang — giống `GET /orders/{id}/tasks`, quy mô công ty nhỏ, xem giả định §8), kèm `order_id`/`order_code` để biết task thuộc đơn nào.
  - Tham số lọc (đều tuỳ chọn, kết hợp được — AND): `status` (1 trong 6 trạng thái task), `priority` (`LOW`/`NORMAL`/`HIGH`/`URGENT`), `assignee_id` (uuid — khớp task có **phân công đang hoạt động** của nhân viên này, tức `status` phân công không phải `REJECTED`/`REMOVED`), `due_from`/`due_to` (date, so theo `due_at`, biên bao gồm cả hai đầu).
  - Capability `task.read` (đã khai trong `spec/permissions.yaml`), scope dùng lại nguyên `TASK_RULES`/`_task_assigned_clause` đã có ở `backend/app/modules/dispatch/service.py` (dùng cho `GET .../tasks/{task_id}`, Q61): `TECH_LEAD`/`MANAGER` scope `all` → thấy mọi task; `TECHNICIAN` scope `assigned` → thấy mọi task mình **từng** có phân công (kể cả `REJECTED`/`REMOVED` — cùng quy tắc "không lọc theo trạng thái" của `orders/service.py:_assigned_clause`, không phải chỉ phân công đang hoạt động). Lọc `assignee_id` (xem dưới) là tham số **riêng**, luôn chỉ tính phân công đang hoạt động, và giao với scope — TECHNICIAN gửi `assignee_id` của người khác chỉ thấy phần giao nhau với scope của chính họ (không lộ task ngoài scope).
  - Mỗi item trả: `id, code, order_id, order_code, title, status, priority, estimated_hours, due_at, assignees` — `assignees` chỉ gồm phân công đang hoạt động (sửa cách tính so với `TaskSummary.assignees` hiện tại của `GET /orders/{id}/tasks`, vốn không lọc trạng thái phân công — **không sửa endpoint cũ đó ở item này**, chỉ áp dụng đúng cho endpoint mới).
- **Ngoài phạm vi:**
  - Phân trang (giả định mặc định: không cần ở quy mô hiện tại — xem §8).
  - Sửa `TaskSummary`/`GET /orders/{id}/tasks` của M4-01a (giữ nguyên hành vi cũ, kể cả nếu khác với endpoint mới).
  - Giao diện Kanban/danh sách/ô lọc (M4-03b).
  - Lọc theo nhiều `status`/`priority` cùng lúc (OR) — mỗi tham số chỉ nhận 1 giá trị.

## 3. Acceptance Criteria
> Fixture: Tuấn (TECH_LEAD, `task.manage`+`task.read` scope `all`), An (MANAGER, `task.read` scope `all`, **không** có `task.manage` — Q05), Hoa (SALE, không có `task.read`). Khoa, Minh (TECHNICIAN đang hoạt động).
> "Đơn D" `IN_PROGRESS`: T1 (`code=…-T1`, `priority=HIGH`, `due_at="2026-10-05T09:00:00+07:00"`, `status=PENDING_ACCEPTANCE`, Khoa `PENDING`), T2 (`priority=NORMAL`, `due_at="2026-10-06T09:00:00+07:00"`, `status=IN_PROGRESS`, Khoa `ACCEPTED` + Minh `IN_PROGRESS` — cả hai đang active), T5 (`priority=NORMAL`, `due_at="2026-10-07T09:00:00+07:00"`, `status=CANCELLED`, Khoa `REMOVED` — giống effect `remove_open_assignments` thật khi huỷ task).
> "Đơn N" `IN_PROGRESS`: T3 (`priority=URGENT`, `due_at="2026-10-04T09:00:00+07:00"`, `status=NEEDS_ASSIGNEE`) — Minh từng được giao rồi bị gỡ (`status=REMOVED`), Khoa **chưa bao giờ** có phân công ở T3.
> "Đơn O" `AWAITING_CONFIRMATION`: T4 (`priority=LOW`, `due_at="2026-10-01T09:00:00+07:00"`, `status=DONE`, Minh `DONE` — đang active; Khoa không liên quan T4).

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DSP-070 | Như fixture trên | Tuấn `GET /api/v1/tasks` (không lọc) | 200 `{items}` đủ 5 task (T1..T5), mỗi item có `order_id`/`order_code` đúng đơn chứa nó; T1.`assignees`=[Khoa]; T2.`assignees`=[Khoa, Minh]; T3.`assignees=[]` (Minh `REMOVED` không tính); T4.`assignees`=[Minh]; T5.`assignees=[]` (Khoa `REMOVED` không tính) | integration |
| AC-DSP-071 | Như trên | Tuấn `GET /api/v1/tasks?status=NEEDS_ASSIGNEE` | 200 chỉ gồm T3 | integration |
| AC-DSP-072 | Như trên | Tuấn `GET /api/v1/tasks?assignee_id={Khoa.id}` | 200 gồm T1, T2 (Khoa đang active ở cả hai — `PENDING`/`ACCEPTED`); **không** gồm T3 (chưa từng liên quan), T4 (chỉ Minh), T5 (phân công của Khoa ở T5 đã `REMOVED`, không tính là đang active) | integration |
| AC-DSP-073 | Như trên | Tuấn `GET /api/v1/tasks?priority=URGENT` | 200 chỉ gồm T3 | integration |
| AC-DSP-074 | Như trên | Tuấn `GET /api/v1/tasks?due_from=2026-10-05&due_to=2026-10-06` | 200 gồm T1 (`10-05`), T2 (`10-06`); không gồm T3 (`10-04`), T4 (`10-01`), T5 (`10-07`) | integration |
| AC-DSP-075 | Như trên | Tuấn `GET /api/v1/tasks?status=PENDING_ACCEPTANCE&priority=HIGH` | 200 chỉ gồm T1 (giao giữa 2 bộ lọc, AND không phải OR) | integration |
| AC-DSP-076 | Như trên | An (MANAGER) `GET /api/v1/tasks` (không lọc) | 200, cùng 5 task như Tuấn (scope `all` áp dụng cho cả MANAGER) | integration |
| AC-DSP-077 | Như trên | Khoa (TECHNICIAN) `GET /api/v1/tasks` (không lọc) | 200 gồm **T1, T2, T5** — scope `assigned` dùng lại `TASK_RULES` hiện có, tính mọi task Khoa từng có phân công **kể cả `REMOVED`** (Q61, giống `GET .../tasks/{id}`), không chỉ phân công đang hoạt động; **không** gồm T3/T4 (Khoa chưa bao giờ có phân công ở đó) | integration |
| AC-DSP-078 | Như trên | Khoa `GET /api/v1/tasks?assignee_id={Minh.id}` | 200 chỉ gồm **T2** (Minh đang active ở T2, và T2 cũng thuộc scope của Khoa); **không** gồm T4 (Minh đang active ở T4, nhưng T4 ngoài scope `assigned` của Khoa — lọc `assignee_id` giao với scope, không thay thế scope, nên không lộ task của Minh mà Khoa không liên quan) | integration |
| AC-DSP-079 | Hoa (SALE, không có `task.read`) | Hoa `GET /api/v1/tasks` | 403 `FORBIDDEN` | integration |
| AC-DSP-080 | — | route `GET /api/v1/tasks` | khai đúng 1 capability (`task.read`); nằm trong ma trận RBAC route thật (test sinh tự động) | generated |
| AC-DSP-081 | Như fixture trên | Tuấn `GET /api/v1/tasks?due_from=2026-10-10&due_to=2026-10-01` (đảo ngược) → 422; `?priority=KHAC` → 422; `?assignee_id=khong-phai-uuid` → 422; `?status=HOAN_THANH` (sai enum) → 422 | mỗi trường hợp 422 `VALIDATION_ERROR`, không có request nào trả 200/500 | integration |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/tasks | task.read | query: `status?`, `priority?`, `assignee_id?` (uuid), `due_from?`/`due_to?` (date, `due_from ≤ due_to`) | `{items}` (item = `TaskBoardItem`: `id, code, order_id, order_code, title, status, priority, estimated_hours, due_at, assignees`) | 403, 422 |

## 5. Dữ liệu / Migration
Không có. Không thêm bảng/cột; chỉ 1 route đọc mới dựa trên `tasks`/`assignments`/`orders` đã có.

## 6. UI
Không áp dụng — item này chỉ có API. Giao diện ở `M4-03b-dispatch-board-ui.md`.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
Item API không có UI để thao tác tay; UAT thật sự ở M4-03b. Có thể kiểm bằng `curl`/Swagger (`/docs`) sau khi đăng nhập Tuấn:
1. `GET /api/v1/tasks` → thấy đủ task của mọi đơn, không riêng 1 đơn.
2. Thêm `?assignee_id=<id Khoa>` → chỉ còn task Khoa đang được giao.
3. Thêm `?status=NEEDS_ASSIGNEE` → chỉ còn task "Cần giao lại".

## 8. Giả định & câu hỏi
- **Giả định (không phân trang):** `GET /api/v1/tasks` trả toàn bộ, không `limit`/`offset`, giống `GET /orders/{id}/tasks` — hợp lý ở quy mô 1 công ty (vài chục task mở cùng lúc). Nếu sau này số lượng lớn, thêm phân trang là thay đổi tương thích xuôi (field mới, không đổi field cũ) — không cần hỏi trước.
- **Giả định (định nghĩa "phân công đang hoạt động"):** dùng lại đúng `_INACTIVE_ASSIGNMENT_STATUSES = (REJECTED, REMOVED)` của `domain.py` cho cả hiển thị `assignees` và lọc `assignee_id` — nhất quán với cách tính `derived_status`. Không đổi hành vi của `GET /orders/{id}/tasks` (M4-01a) dù nó hiện không lọc theo trạng thái phân công — việc đó nằm ngoài phạm vi item này, không tự sửa.
- **Giả định (lọc 1 giá trị, không OR):** `status`/`priority` mỗi tham số 1 giá trị — khớp enum hiện có, không cần danh sách phân tách bởi dấu phẩy. Giao diện M4-03b muốn xem nhiều trạng thái cùng lúc (Kanban) thì không gửi `status` (lấy hết) và tự nhóm theo cột ở client.
