# M7-01a — Thông báo in-app (API)

- **Status:** Done
- **Backlog:** M7-01 (tách `a`-API / `b`-UI theo mẫu M4-01/M6-03, Q59: bảng mới + module mới + bắn thật 13 điểm `notify_*` đang bị bỏ qua ở 3 service hiện có (Q54/Q60) + API đọc/đánh dấu đã đọc vượt ~400 dòng non-test nếu gộp UI) · **Milestone:** M7
- **Liên quan:** `spec/state_machines.yaml` (13 điểm effect `notify_tech_leads`/`notify_order_owner`/`notify_assignees`/`notify_assignee`/`notify_tech_leads_if_task_done` ở `order.transitions[submit|all_tasks_done|complete|request_revision|cancel_active]`, `task.commands[create|update|add_assignee|reopen|cancel]`, `assignment.transitions[reject|complete|remove]`); `spec/permissions.yaml#notification.read` (`self` cho cả 4 vai trò — không đổi); `docs/product/DOMAIN_MODEL.md` §13 (`notifications: recipient_id, type, title, body, entity_type, entity_id, read_at`); `docs/product/OPEN_QUESTIONS_ARCHIVE.md` Q54/Q60 (lý do các điểm `notify_*` đang bị bỏ qua, để M7-01 xây thật); `backend/app/modules/audit/` (mẫu module đọc append-only: `router.py`/`schemas.py`/`service.py` cho `GET /audit-events`); `backend/app/modules/orders/service.py` (các điểm `# notify_*... effects skipped` cần nối thật — `submit_order`, `complete_order`, `request_revision`, `_apply_transition` nhánh `all_tasks_done`/`cancel_active`); `backend/app/modules/dispatch/service.py` (`create`/`update`/`add_assignee`/`reopen`/`cancel` của task); `backend/app/modules/assignments/service.py` (`reject`/`complete`/`remove`).

## 1. Mục tiêu
Hệ thống tự tạo thông báo trong CSDL cho đúng người liên quan mỗi khi một lệnh nghiệp vụ đổi trạng thái đơn/đầu việc/phân công (13 điểm đã khai `effects: notify_*` trong `spec/state_machines.yaml` nhưng đang bị bỏ qua), và cung cấp API để người dùng đọc danh sách, đếm số chưa đọc, đánh dấu đã đọc.

## 2. Phạm vi
- Trong phạm vi:
  - Bảng `notifications` + migration.
  - Module `backend/app/modules/notifications/` (model, schema, service tạo + đọc + đánh dấu đã đọc).
  - Nối 13 điểm `notify_*` thành lệnh tạo bản ghi `notifications` thật (xoá comment "skipped") ở 3 service: orders, dispatch (task), assignments.
  - `GET /api/v1/notifications` (phân trang, actor chỉ thấy của chính mình — scope `self`), `GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/{id}/read`, `POST /api/v1/notifications/mark-all-read`.
  - Thêm trường `unread_notifications_count: int` vào `MeResponse` (tính trực tiếp trong handler `/me`, không qua cơ chế `menu[].badge`/`counters` hiện có — "Thông báo" không phải một mục trong `menu:` của `permissions.yaml`, giống "Cá nhân").
- Ngoài phạm vi (không làm ở item này):
  - Giao diện (chuông, badge hiển thị, trang danh sách thật) — `M7-01b`.
  - Đẩy thông báo qua kênh khác (email, push, SMS).
  - Dọn/xoá thông báo cũ.
  - Nối lệnh `order.cancel_active` qua service layer thật (Q76 — route/service chưa tồn tại; effect `notify_assignees` của lệnh này giữ nguyên trạng thái "chưa gọi được" như Q76 đã ghi, không tự thêm route ở item này).

## 3. Quyết định thiết kế (không phải giả định cần hỏi — suy ra thẳng từ tài liệu đã chốt)
- **`entity_type`/`entity_id` luôn là `ORDER`/`order.id`**, bất kể lệnh gốc là trên order/task/assignment: ứng dụng không có trang chi tiết riêng cho task/assignment (đầu việc chỉ xem trong tab "Đầu việc" của trang đơn — `docs/product/WORKFLOWS.md`, `frontend/src/features/dispatch/orderTasksTab.test.tsx`), nên nơi đến duy nhất khi bấm vào thông báo là `/orders/{order_id}`.
- **`type`** (enum lưu dạng string, không cần bảng riêng) đặt theo tên effect + ngữ cảnh, dùng để UI chọn icon/màu ở `M7-01b` và để test khẳng định đúng loại:
  `ORDER_SUBMITTED`, `ORDER_AWAITING_CONFIRMATION`, `ORDER_COMPLETED`, `ORDER_REVISION_REQUESTED`, `TASK_ASSIGNED`, `TASK_UPDATED`, `TASK_REOPENED`, `TASK_CANCELLED`, `ASSIGNMENT_REJECTED`, `ASSIGNMENT_DONE`, `ASSIGNMENT_REMOVED`.
- **Người nhận mỗi effect** (suy từ tên effect + vai trò liên quan trong `DOMAIN_MODEL`/`PERMISSIONS`):
  | Effect (tại lệnh) | Người nhận |
  |---|---|
  | `notify_tech_leads` (`order.submit`) | mọi `Employee` đang active, có role `TECH_LEAD` |
  | `notify_tech_leads` + `notify_order_owner` (`order.all_tasks_done`, hệ thống) | mọi TECH_LEAD active + `order.created_by` |
  | `notify_order_owner` (`order.complete`) | `order.created_by` |
  | `notify_order_owner` (`order.request_revision`) | `order.created_by` |
  | `notify_assignees` (`task.create`) | mọi nhân viên vừa được gán ở lệnh này (`assignee_ids` vừa tạo `PENDING` assignment) |
  | `notify_assignees` (`task.update`) | mọi nhân viên có assignment đang hoạt động (không `REJECTED`/`REMOVED`) ở chu kỳ hiện tại của task |
  | `notify_assignees` (`task.add_assignee`) | chỉ (các) nhân viên vừa được thêm ở lệnh này |
  | `notify_assignees` (`task.reopen`) | mọi nhân viên vừa được gán lại ở chu kỳ mới (giống `task.create`) |
  | `notify_assignees` (`task.cancel`) | mọi nhân viên có assignment đang hoạt động bị gỡ bởi lệnh này |
  | `notify_tech_leads` (`assignment.reject`) | mọi TECH_LEAD active |
  | `notify_tech_leads_if_task_done` (`assignment.complete`) | mọi TECH_LEAD active, **chỉ khi** sau lệnh này task đạt derived status `DONE` (tất cả assignment đang hoạt động đều `DONE`) |
  | `notify_assignee` (`assignment.remove`) | đúng 1 người: nhân viên của assignment bị gỡ |
- Một effect có thể sinh **nhiều bản ghi** `notifications` (1 người nhận = 1 dòng) trong cùng transaction với lệnh gốc và cùng `audit_events` — không có bảng trung gian "nhóm gửi".
- `title`/`body` là chuỗi tiếng Việt cố định theo `type`, không cho client tuỳ biến. Nội dung tham chiếu mã đơn (`order.code`) và tên đầu việc (`task.title`) khi có.

## 4. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-NTF-001 | Đơn DH-0001 `DRAFT` do Sale A tạo; có 2 TECH_LEAD active (T1, T2) và 1 TECH_LEAD đã khoá (T3) | A gửi đơn (`submit`) | API 200; `notifications` có đúng 2 dòng mới, `recipient_id ∈ {T1,T2}`, `type=ORDER_SUBMITTED`, `entity_type=ORDER`, `entity_id=DH-0001.id`, `read_at IS NULL`; T3 không có dòng nào | integration |
| AC-NTF-002 | Đơn `IN_PROGRESS`, mọi task đã `DONE`, `created_by`=Sale B | lệnh hệ thống `all_tasks_done` chạy (qua `complete` assignment cuối) | đơn → `AWAITING_CONFIRMATION`; có thông báo `type=ORDER_AWAITING_CONFIRMATION` cho mọi TECH_LEAD active **và** 1 thông báo cùng `type` cho Sale B (`order.created_by`) | integration |
| AC-NTF-003 | Đơn `AWAITING_CONFIRMATION`, `created_by`=Sale B, QLKT hoàn tất | `complete` | 1 thông báo `type=ORDER_COMPLETED` cho Sale B; không tạo thông báo cho TECH_LEAD khác | integration |
| AC-NTF-004 | Đơn `COMPLETED`, `created_by`=Sale B | QLKT `request_revision` (lý do ≥5 ký tự) | 1 thông báo `type=ORDER_REVISION_REQUESTED` cho Sale B | integration |
| AC-NTF-005 | Task mới tạo, giao cho KTV K1, K2 | `task.create` | 2 thông báo `type=TASK_ASSIGNED`, `recipient_id ∈ {K1,K2}`, `body` chứa tên đầu việc | integration |
| AC-NTF-006 | Task đang có assignment hoạt động của K1 (chu kỳ hiện tại); K cũ ở chu kỳ trước đã `DONE` không tính | QLKT `task.update` đổi `due_at` | 1 thông báo `type=TASK_UPDATED` cho K1; không có thông báo cho người ở chu kỳ trước | integration |
| AC-NTF-007 | Task đang giao K1; QLKT thêm K2 (`task.add_assignee`) | hành động | Chỉ 1 thông báo `type=TASK_ASSIGNED` cho K2 — **không** tạo lại thông báo cho K1 (đã có từ lúc tạo) | integration |
| AC-NTF-008 | Task `DONE`, đơn `REVISION`; QLKT `reopen` giao lại K1, K3 | `task.reopen` | 2 thông báo `type=TASK_REOPENED` cho K1, K3; `body` nêu lý do mở lại | integration |
| AC-NTF-009 | Task đang giao K1, K2 (hoạt động); QLKT `task.cancel` (lý do ≥5 ký tự) | hành động | 2 thông báo `type=TASK_CANCELLED` cho K1, K2 | integration |
| AC-NTF-010 | Assignment `PENDING` của K1 | K1 `reject` (mã lý do + mô tả) | mọi TECH_LEAD active nhận thông báo `type=ASSIGNMENT_REJECTED`, `body` nêu tên K1 + lý do | integration |
| AC-NTF-011 | Task có 2 assignment hoạt động (K1 `IN_PROGRESS`, K2 `IN_PROGRESS`); K1 `complete` xong, task chưa `DONE` (còn K2) | K1 `complete` | **Không** tạo thông báo `ASSIGNMENT_DONE`/task-done nào (task chưa đạt `DONE`) | integration |
| AC-NTF-012 | Task chỉ có 1 assignment hoạt động (K1 `IN_PROGRESS`) | K1 `complete` | task → `DONE`; mọi TECH_LEAD active nhận thông báo `type=ASSIGNMENT_DONE` | integration |
| AC-NTF-013 | Assignment `ACCEPTED` của K1 trên task X | QLKT `remove` | đúng 1 thông báo `type=ASSIGNMENT_REMOVED` cho K1; không gửi cho ai khác | integration |
| AC-NTF-014 | K1 có 5 thông báo (3 chưa đọc, 2 đã đọc); K2 có 1 thông báo chưa đọc | K1 gọi `GET /api/v1/notifications?limit=20` | 200; `items` chỉ gồm 5 dòng của K1 (không có dòng của K2), sắp xếp mới nhất trước, `total=5` | integration |
| AC-NTF-015 | K1 có 3 thông báo chưa đọc | K1 gọi `GET /api/v1/notifications/unread-count` | 200 `{ "count": 3 }` | integration |
| AC-NTF-016 | Thông báo N thuộc K1, `read_at IS NULL` | K1 gọi `POST /notifications/{N}/read` | 200; `read_at` được set; gọi `unread-count` sau đó giảm 1 | integration |
| AC-NTF-017 | Thông báo N thuộc K1 | K2 gọi `POST /notifications/{N}/read` | 404 (ngoài scope `self`, giống `order.submit`/Q-pattern hiện có) | integration |
| AC-NTF-018 | K1 có 3 thông báo chưa đọc | K1 gọi `POST /notifications/mark-all-read` | 200; `unread-count` sau đó = 0; thông báo của người khác không đổi | integration |
| AC-NTF-019 | K1 đã đăng nhập, có 2 thông báo chưa đọc | K1 gọi `GET /api/v1/me` | 200; `unread_notifications_count == 2` | integration |
| AC-NTF-020 | — | mọi route `/api/v1/notifications*` | mỗi route khai đúng 1 capability `notification.read`; vai trò không thuộc 4 vai trò hệ thống (không tồn tại) → 403 theo cơ chế chung | generated |

## 5. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/notifications | notification.read (self) | query `limit` (≤100, mặc định 20), `offset` | `NotificationPage { items, total, limit, offset }` | — |
| GET | /api/v1/notifications/unread-count | notification.read (self) | — | `{ count: int }` | — |
| POST | /api/v1/notifications/{id}/read | notification.read (self) | — | `NotificationOut` | 404 (không thuộc actor) |
| POST | /api/v1/notifications/mark-all-read | notification.read (self) | — | `{ count: int }` (số dòng vừa đánh dấu) | — |

`NotificationOut`: `id, type, title, body, entity_type, entity_id, read_at, created_at`.

`GET /api/v1/me` (đã có — `backend/app/modules/identity/`): thêm `unread_notifications_count: int` vào `MeResponse`.

## 6. Dữ liệu / Migration
Bảng mới `notifications`:
- `id uuid pk`, `recipient_id uuid fk employees not null`, `type varchar not null`, `title varchar not null`, `body text not null`, `entity_type varchar not null`, `entity_id uuid not null`, `read_at timestamptz null`, `created_at timestamptz not null default now()`.
- Index `(recipient_id, read_at)` (đếm chưa đọc nhanh) và `(recipient_id, created_at desc)` (phân trang danh sách).
- Append-mostly: chỉ `UPDATE read_at`, không `DELETE`.

## 7. UI
Không có ở item này — xem `M7-01b`.

## 8. Kịch bản UAT thủ công
Không áp dụng trực tiếp (chưa có UI) — kiểm bằng Swagger `/docs` hoặc `httpie`: gửi 1 đơn, gọi `GET /api/v1/notifications` bằng tài khoản TECH_LEAD, thấy 1 dòng `ORDER_SUBMITTED`.

## 9. Giả định & câu hỏi
- Giả định: nội dung `title`/`body` cố định theo `type`, không cho client tuỳ biến ngôn ngữ — hợp lý vì toàn ứng dụng chỉ tiếng Việt.
- Giả định: `entity_type` luôn `ORDER` (xem §3) — không cần phân biệt TASK/ASSIGNMENT vì không có trang đích riêng.
- Không có câu hỏi mới cần ghi vào `OPEN_QUESTIONS.md` — mọi quyết định ở §3 suy thẳng từ tài liệu đã chốt (effect list trong `state_machines.yaml`, cấu trúc route hiện có). Nếu chủ dự án muốn người nhận khác (ví dụ: `notify_tech_leads` chỉ gửi cho TECH_LEAD đang phụ trách đơn, không phải mọi TECH_LEAD), xin sửa trực tiếp bảng ở §3 trước khi Approve.
