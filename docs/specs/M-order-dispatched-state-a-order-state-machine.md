# M-order-dispatched-state-a — Thêm trạng thái "Đã điều phối" vào máy trạng thái đơn hàng

- **Status:** Approved
- **Backlog:** `M-order-dispatched-state-a` · **Milestone:** M13
- **Liên quan:** `spec/state_machines.yaml#order` (+ guard `order_in_dispatchable_state` dùng chung ở `task`/`assignment`), `spec/permissions.yaml#order.cancel_active`, `docs/product/OPEN_QUESTIONS.md#Q90` (đảo `Q81`, archive 2026-10-15)

## 1. Mục tiêu
Là Quản lý kỹ thuật (TECH_LEAD), tôi muốn đơn hàng hiện rõ "Đã điều phối" ngay khi tôi tạo đầu việc và giao người — tách biệt với "Chờ điều phối" (chưa giao ai) — để biết đơn nào tôi đã xử lý xong phần giao việc, không cần chờ kỹ thuật viên bấm "Bắt đầu" mới thấy đổi trạng thái.

## 2. Phạm vi
- Trong phạm vi: thêm state `DISPATCHED` vào `order` trong `spec/state_machines.yaml`; 2 transition hệ thống mới `dispatch`/`undispatch`; cập nhật `start_dispatch` và `cancel_active` để nhận `DISPATCHED`; cập nhật guard dùng chung `order_in_dispatchable_state`; migration đổi CHECK constraint `orders.status`; service layer (`dispatch/service.py`, `assignments/service.py`) bắn 2 transition mới; audit.
- Ngoài phạm vi (item `-b`): nhãn/màu UI, hàng đợi "Chờ điều phối" (`/dispatch/queue`), bộ lọc danh sách đơn, lịch sử đơn hiển thị tên lệnh `dispatch`/`undispatch`.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-170 | Đơn DH2610-0012 ở `PENDING_DISPATCH`, chưa có task nào; QLKT Nguyễn Văn Long đăng nhập | Long tạo đầu việc "Lắp 4 camera an ninh" giao KTV Trần Văn Hùng | 200; `order.status` → `DISPATCHED`; 1 `audit_event` (entity=ORDER, action=`dispatch`, from=`PENDING_DISPATCH`, to=`DISPATCHED`, actor_id=Long — không phải NULL) | integration |
| AC-ORD-171 | Đơn đã `DISPATCHED` (1 task, 1 assignment `PENDING`) | Long tạo thêm đầu việc thứ 2 "Cấu hình đầu ghi" giao KTV khác | 200; `order.status` vẫn `DISPATCHED`; **không** sinh thêm `audit_event` action=`dispatch` (idempotent, chỉ bắn khi đang ở `PENDING_DISPATCH`) | integration |
| AC-ORD-172 | Đơn `DISPATCHED`, đúng 1 task, đúng 1 assignment `PENDING` cho KTV Hùng (không còn assignment active nào khác trong đơn) | Hùng từ chối (`reason_code=BUSY`, lý do "Đang kẹt lắp đặt đơn khác, không đủ thời gian") | 200; task → `NEEDS_ASSIGNEE`; đơn không còn assignment nào ở `PENDING`/`ACCEPTED`/`IN_PROGRESS`/`DONE` → `order.status` → `PENDING_DISPATCH`; `audit_event` action=`undispatch` actor_id=Hùng | integration + stateful |
| AC-ORD-173 | Đơn `DISPATCHED` có 2 task độc lập, mỗi task 1 assignment `PENDING` cho 2 KTV khác nhau | KTV A từ chối task A | 200; task A → `NEEDS_ASSIGNEE`; `order.status` **vẫn** `DISPATCHED` (task B còn assignment `PENDING` active) | integration |
| AC-ORD-174 | Đơn `DISPATCHED`, đúng 1 task, 1 assignment `ACCEPTED` duy nhất của đơn | Long (QLKT) gỡ người đó khỏi task (`remove_assignee`) | 200; task → `NEEDS_ASSIGNEE`; `order.status` → `PENDING_DISPATCH`; `audit_event` action=`undispatch` actor_id=Long | integration |
| AC-ORD-175 | Đơn `DISPATCHED`, KTV Hùng đã `ACCEPTED` 1 assignment | Hùng bấm "Bắt đầu" | 200; assignment → `IN_PROGRESS`; `order.status` → `IN_PROGRESS` (không còn `DISPATCHED`); `audit_event` action=`start_dispatch` from=`DISPATCHED` to=`IN_PROGRESS` actor_id=Hùng | integration + e2e |
| AC-ORD-176 | Đơn ở `COMPLETED` | Long gọi `POST /orders/{id}/tasks` để tạo task mới | 409 `GUARD_FAILED` guard=`order_in_dispatchable_state` (không đổi hành vi cũ — chỉ thêm `DISPATCHED` vào danh sách được phép, không mở rộng thêm trạng thái khác) | integration |
| AC-ORD-177 | Đơn `DISPATCHED`, 1 task, 1 assignment `PENDING`, chưa ai bắt đầu | Manager huỷ đơn (`cancel_active`, lý do "Khách đổi ý, chưa triển khai lắp đặt") | 200; `order.status` → `CANCELLED`; assignment `PENDING` → `REMOVED` (effect `cancel_open_tasks`); KTV được giao nhận thông báo; `audit_event` action=`cancel_active` | integration |
| AC-ORD-178 | Đơn `DISPATCHED` như trên | SALE (không phải Manager) gọi `POST /orders/{id}/cancel-active` | 403 (ngoài capability `order.cancel_active`) | integration |
| AC-ORD-179 | DB đã chạy migration mới | Insert trực tiếp `orders.status = 'DISPATCHED'` | Thành công (CHECK constraint `status` chấp nhận giá trị mới); insert `status = 'FOO'` → vi phạm CHECK constraint | migration |

## 4. API
Không có endpoint mới — `dispatch`/`undispatch` là transition hệ thống (`actor: system`), bắn bên trong transaction của lệnh gây ra nó, giống `start_dispatch`/`all_tasks_done`:

| Lệnh gây hiệu ứng | Method | Path | Capability |
|---|---|---|---|
| Tạo đầu việc đầu tiên khi đơn `PENDING_DISPATCH` → bắn `dispatch` | POST | /api/v1/orders/{id}/tasks | task.manage |
| Từ chối/gỡ người làm đơn hết assignment active khi `DISPATCHED` → bắn `undispatch` | POST | /api/v1/assignments/{id}/reject | (actor: assignee) |
| | POST | /api/v1/orders/{id}/tasks/{task_id}/assignees/{assignee_id} (remove) | task.manage |
| | POST | /api/v1/orders/{id}/tasks/{task_id}/cancel | task.manage |
| Huỷ đơn đã điều phối chưa ai bắt đầu | POST | /api/v1/orders/{id}/cancel-active | order.cancel_active |

## 5. Dữ liệu / Migration
- `make migration name=add_order_status_dispatched`.
- Đổi `CheckConstraint` tên `status` trên bảng `orders`: thêm `'DISPATCHED'` vào danh sách giá trị hợp lệ (`backend/app/modules/orders/models.py#STATUSES`).
- Không thêm cột mới; không cần backfill (đơn cũ đang `PENDING_DISPATCH` có task vẫn hợp lệ, chỉ đơn **mới** tạo task từ sau khi deploy mới nhảy `DISPATCHED`; không cần chạy job đồng bộ dữ liệu cũ — chấp nhận đơn cũ "lạc" ở `PENDING_DISPATCH` dù đã có task, vì bất biến "ít nhất 1 assignment active → DISPATCHED" chỉ áp dụng kể từ lệnh tiếp theo chạm vào đơn đó, ví dụ KTV bấm "Bắt đầu" vẫn chuyển thẳng `PENDING_DISPATCH → IN_PROGRESS` như cũ, không bị kẹt).

## 6. UI
Không đổi ở item này (xem `-b`).

## 7. Kịch bản UAT thủ công
1. Tạo đơn, gửi đơn (→ "Chờ điều phối").
2. Tạo đầu việc, giao 1 KTV → đơn chuyển "Đã điều phối" (chưa chạy UI label ở item này, kiểm bằng API `GET /orders/{id}` thấy `status: "DISPATCHED"`).
3. KTV từ chối → đơn về lại "Chờ điều phối" (`status: "PENDING_DISPATCH"`).
4. Giao lại người khác, người đó bấm "Bắt đầu" → đơn → "Đang thực hiện".

## 8. Giả định & câu hỏi
- Giả định: điều kiện `dispatch`/`undispatch` tính trên **toàn bộ assignment của đơn** (mọi task), không riêng từng task — khớp quyết định Q90 ("có ít nhất 1 task được điều phối... nếu bị từ chối hết thì về lại chờ điều phối").
- Giả định: guard mới `has_active_assignment`/`no_active_assignment` định nghĩa "active" = status `PENDING`/`ACCEPTED`/`IN_PROGRESS`/`DONE` (loại `REJECTED`/`REMOVED`) — khớp định nghĩa "active" đã dùng cho `derived_status` của task.
- Giả định: đơn cũ đã `PENDING_DISPATCH` kèm task từ trước khi deploy không bị ép hồi tố sang `DISPATCHED` — chỉ áp dụng cho thao tác mới.
- YAML diff đề xuất (chưa sửa, chờ duyệt spec):
  ```yaml
  order:
    states:
      DISPATCHED: { label: Đã điều phối, color: review }
    transitions:
      - command: dispatch
        from: [PENDING_DISPATCH]
        to: DISPATCHED
        actor: system
        guards: [has_active_assignment]
        effects: [audit]
      - command: undispatch
        from: [DISPATCHED]
        to: PENDING_DISPATCH
        actor: system
        guards: [no_active_assignment]
        effects: [audit]
      - command: start_dispatch
        from: [PENDING_DISPATCH, DISPATCHED]   # thêm DISPATCHED
      - command: cancel_active
        from: [IN_PROGRESS, AWAITING_CONFIRMATION, REVISION, DISPATCHED]   # thêm DISPATCHED
  guards:
    order_in_dispatchable_state: order status in [PENDING_DISPATCH, DISPATCHED, IN_PROGRESS, REVISION]   # thêm DISPATCHED
    has_active_assignment: order has ≥1 assignment with status in [PENDING, ACCEPTED, IN_PROGRESS, DONE]
    no_active_assignment: not has_active_assignment
  ```
