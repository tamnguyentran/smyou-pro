# M-order-dispatched-state-a — Điều phối chuyển thẳng đơn sang "Đang thực hiện"

- **Status:** Done
- **Backlog:** `M-order-dispatched-state-a` · **Milestone:** M13
- **Liên quan:** `spec/state_machines.yaml#order` (đảo Q81, chốt Q90 — 2026-10-19), `spec/permissions.yaml#order.cancel_active`, `docs/product/OPEN_QUESTIONS_ARCHIVE.md#Q90` (+ `#Q76` cho `cancel_active`)

## 1. Mục tiêu
Chủ dự án chốt lại (đảo Q81, 2026-10-19): đơn phải chuyển "Đang thực hiện" **ngay khi** Quản lý kỹ thuật tạo đầu việc và giao cho ≥1 người (chưa bị từ chối) — không cần chờ kỹ thuật viên bấm "Bắt đầu" nữa. Đây là hành vi gốc trước Q81 (2026-10-15), nay được khôi phục. Hai chiều: nếu mọi người được giao của đơn đều bị từ chối/gỡ hết, đơn lùi lại "Chờ điều phối". Bấm "Bắt đầu" (KTV) từ nay chỉ còn tác dụng ở cấp task/assignment, không đụng tới trạng thái đơn.

Nhân tiện chốt 2 quy tắc liên quan `cancel_active` (phát hiện khi làm item này — capability đã khai báo nhưng chưa có route/service gọi được, Q76):
- Nối `cancel_active` vào router/service thật (`POST /orders/{id}/cancel-active`).
- Chặn huỷ đơn nếu đơn **đã có ảnh khách hàng ký xác nhận tải lên** cho revision hiện tại.
- Loại đầu việc của đơn bị huỷ khỏi KPI: **tách sang backlog item riêng**, không làm ở đây.

## 2. Phạm vi
- Trong phạm vi: đổi điểm bắn `start_dispatch` (`PENDING_DISPATCH → IN_PROGRESS`) từ `assignment.start` sang re-đánh giá sau mỗi lần task/assignment của đơn thay đổi (tạo task, huỷ task, từ chối/gỡ người); thêm transition 2 chiều `undispatch` (`IN_PROGRESS → PENDING_DISPATCH`); gỡ hiệu ứng cấp-đơn khỏi `assignment.start`; nối `cancel_active` vào router/service + guard mới chặn huỷ khi đã có ảnh xác nhận; migration (không đổi CHECK constraint — không thêm state mới); audit.
- Ngoài phạm vi: loại trừ KPI của đơn huỷ (item riêng); không đổi UI (trạng thái đích `IN_PROGRESS` đã có đầy đủ nhãn/màu/bộ lọc sẵn, không cần thêm).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-170 | Đơn DH2610-0012 ở `PENDING_DISPATCH`, chưa có task nào; QLKT Nguyễn Văn Long đăng nhập | Long tạo đầu việc "Lắp 4 camera an ninh" giao KTV Trần Văn Hùng | 200; `order.status` → `IN_PROGRESS`; 1 `audit_event` (entity=ORDER, action=`start_dispatch`, from=`PENDING_DISPATCH`, to=`IN_PROGRESS`, actor_id=Long) | integration |
| AC-ORD-171 | Đơn đã `IN_PROGRESS` (1 task, 1 assignment `PENDING`) | Long tạo thêm đầu việc thứ 2 "Cấu hình đầu ghi" giao KTV khác | 200; `order.status` vẫn `IN_PROGRESS`; **không** sinh thêm `audit_event` action=`start_dispatch` (idempotent) | integration |
| AC-ORD-172 | Đơn `IN_PROGRESS`, đúng 1 task, đúng 1 assignment `PENDING` cho KTV Hùng (không còn assignment active nào khác trong đơn, chưa ai bấm "Bắt đầu") | Hùng từ chối (`reason_code=BUSY`, lý do "Đang kẹt lắp đặt đơn khác, không đủ thời gian") | 200; task → `NEEDS_ASSIGNEE`; đơn không còn assignment nào ở `PENDING`/`ACCEPTED`/`IN_PROGRESS`/`DONE` → `order.status` → `PENDING_DISPATCH`; `audit_event` action=`undispatch` actor_id=Hùng | integration + stateful |
| AC-ORD-173 | Đơn `IN_PROGRESS` có 2 task độc lập, mỗi task 1 assignment `PENDING` cho 2 KTV khác nhau | KTV A từ chối task A | 200; task A → `NEEDS_ASSIGNEE`; `order.status` **vẫn** `IN_PROGRESS` (task B còn assignment `PENDING` active) | integration |
| AC-ORD-174 | Đơn `IN_PROGRESS`, đúng 1 task, 1 assignment `ACCEPTED` duy nhất của đơn | Long (QLKT) gỡ người đó khỏi task (`remove_assignee`) | 200; task → `NEEDS_ASSIGNEE`; `order.status` → `PENDING_DISPATCH`; `audit_event` action=`undispatch` actor_id=Long | integration |
| AC-ORD-175 | Đơn `IN_PROGRESS`, KTV Hùng đã `ACCEPTED` 1 assignment (đơn đã `IN_PROGRESS` từ lúc tạo task) | Hùng bấm "Bắt đầu" | 200; assignment → `IN_PROGRESS`; **không** có `audit_event` nào ở cấp ORDER (status/version đơn không đổi do lệnh này — chỉ task/assignment đổi) | integration |
| AC-ORD-176 | Đơn ở `COMPLETED` | Long gọi `POST /orders/{id}/tasks` để tạo task mới | 409 `GUARD_FAILED` guard=`order_in_dispatchable_state` (không đổi so với trước) | integration |
| AC-ORD-177 | Đơn `IN_PROGRESS`, 1 task, 1 assignment `PENDING`, chưa ai bắt đầu, **chưa có ảnh KH xác nhận** | Manager huỷ đơn (`cancel_active`, lý do "Khách đổi ý, chưa triển khai lắp đặt") | 200; `order.status` → `CANCELLED`; assignment `PENDING` → `REMOVED` (effect `cancel_open_tasks`); KTV được giao nhận thông báo; `audit_event` action=`cancel_active` | integration |
| AC-ORD-178 | Đơn `IN_PROGRESS` như trên | SALE (không phải Manager) gọi `POST /orders/{id}/cancel-active` | 403 (ngoài capability `order.cancel_active`) | integration |
| AC-ORD-180 | Đơn `AWAITING_CONFIRMATION`, **đã có** 1 attachment `kind=CUSTOMER_CONFIRMATION` ở `revision_no` hiện tại (KTV đã tải ảnh KH ký, chưa bấm "Hoàn tất đơn") | Manager gọi `cancel_active` | 409 `GUARD_FAILED` guard=`confirmation_attachment_not_uploaded` — không cho huỷ đơn đã có khách ký xác nhận | integration |

## 4. API
Không có endpoint mới cho `start_dispatch`/`undispatch` — vẫn là transition hệ thống (`actor: system`), bắn bên trong transaction của lệnh gây ra nó:

| Lệnh gây hiệu ứng | Method | Path | Capability |
|---|---|---|---|
| Tạo đầu việc đầu tiên khi đơn `PENDING_DISPATCH` → bắn `start_dispatch` | POST | /api/v1/orders/{id}/tasks | task.manage |
| Huỷ task cuối cùng còn assignment active → có thể bắn `undispatch` | POST | /api/v1/orders/{id}/tasks/{task_id}/cancel | task.manage |
| Từ chối/gỡ người làm đơn hết assignment active → bắn `undispatch` | POST | /api/v1/assignments/{id}/reject | (actor: assignee) |
| | POST | /api/v1/orders/{id}/tasks/{task_id}/assignees/{assignee_id}/remove | task.manage |

Endpoint mới (nối `cancel_active`, Q76):

| Lệnh | Method | Path | Capability |
|---|---|---|---|
| Huỷ đơn đã điều phối/đang thực hiện | POST | /api/v1/orders/{id}/cancel-active | order.cancel_active |

## 5. Dữ liệu / Migration
Không cần migration — không thêm trạng thái đơn mới, không đổi CHECK constraint. Chỉ thêm 2 guard thuần (`has_active_assignment`, `no_active_assignment`, `confirmation_attachment_not_uploaded`) ở domain layer.

## 6. UI
Không đổi — trạng thái đích `IN_PROGRESS` đã có đủ nhãn ("Đang thực hiện"), màu, có trong bộ lọc `/orders` và dashboard từ trước.

## 7. Kịch bản UAT thủ công
1. Tạo đơn, gửi đơn (→ "Chờ điều phối").
2. Tạo đầu việc, giao 1 KTV → đơn chuyển thẳng "Đang thực hiện" (không cần KTV làm gì).
3. KTV từ chối → đơn về lại "Chờ điều phối".
4. Giao lại người khác, người đó bấm "Bắt đầu" → chỉ task/assignment đổi, đơn vẫn "Đang thực hiện" (không có audit event cấp đơn).
5. Thử huỷ đơn sau khi đã tải ảnh KH xác nhận (trạng thái "Chờ KH xác nhận") → bị chặn 409.

## 8. Giả định & quyết định
- Điều kiện tính trên **toàn bộ assignment của đơn** (mọi task), không riêng từng task — khớp Q90.
- "Active" = status `PENDING`/`ACCEPTED`/`IN_PROGRESS`/`DONE` (loại `REJECTED`/`REMOVED`) — vì `DONE` được coi là active, một khi có task đã hoàn thành thì đơn không thể bị `undispatch` lùi lại `PENDING_DISPATCH` nữa (an toàn — không lùi trạng thái đơn đã có người thực sự làm xong việc).
- `assignment.start` không còn effect nào ở cấp đơn — xoá hẳn khối code cũ cắm trong `start_assignment`.
- Guard `confirmation_attachment_not_uploaded` áp dụng cho `cancel_active` (không áp cho `cancel` — `cancel` chỉ chạy từ `DRAFT`/`PENDING_DISPATCH`, vốn chưa thể có ảnh xác nhận nhờ guard `order_has_no_tasks`).
