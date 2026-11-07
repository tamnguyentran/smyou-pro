# UAT-01 — Sửa lỗi từ lượt AI tự test UAT (06/11/2026)

- **Status:** Approved
- **Backlog:** UAT-01 · **Milestone:** UAT
- **Liên quan:** spec/state_machines.yaml#order (`start_dispatch`/`undispatch`, Q90), spec/state_machines.yaml#task.commands[add_assignee], spec/permissions.yaml#catalog.read_cost (Q125), `docs/uat/AI_tu_test.xlsx` sheet "Theo dõi lỗi" (BUG-01, BUG-02)

## 1. Mục tiêu
- BUG-01: Là Quản lý kỹ thuật, khi tôi "+ Thêm người" cho đầu việc "Cần giao lại", tôi muốn đơn quay lại "Đang thực hiện" (như khi tạo đầu việc) để KTV mới làm tiếp được và đơn không kẹt ở "Chờ điều phối".
- BUG-02: Là chủ doanh nghiệp, tôi muốn KTV không nhận được giá vốn qua API chi tiết đơn (không chỉ ẩn ở giao diện).

## 2. Phạm vi
- Trong phạm vi: `add_assignee` thêm effect `fire_order_reevaluate` (đúng quy tắc Q90 đã chốt: đơn "Đang thực hiện" ngay khi có ≥1 phân công chưa bị từ chối/gỡ); `GET/POST … /orders/{id}` trả `lines[].cost_price_snapshot = null` cho vai trò không có `catalog.read_cost`.
- Ngoài phạm vi: các mục KB-01…07 (kịch bản UAT lỗi thời — sửa ở workbook/tài liệu) và QS-01…08 (quan sát, chờ chủ dự án quyết).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DSP-131 | Đơn đã về `PENDING_DISPATCH` vì người duy nhất của đầu việc bị gỡ (hoặc từ chối); đầu việc `NEEDS_ASSIGNEE` | QLKT `POST /orders/{id}/tasks/{task_id}/assignees` thêm KTV khác | API 200; đơn → `IN_PROGRESS`; thêm 1 audit `start_dispatch` (actor = QLKT); đầu việc `PENDING_ACCEPTANCE` | integration |
| AC-DSP-132 | Như AC-DSP-131, sau đó KTV mới tiếp nhận → bắt đầu → báo hoàn thành | KTV `complete` | Đơn → `AWAITING_CONFIRMATION` | integration |
| AC-DSP-133 | Đơn `IN_PROGRESS`, đầu việc còn người active | QLKT thêm người | Đơn giữ `IN_PROGRESS`, không có audit `start_dispatch` mới | integration |
| AC-ORD-265 | Đơn có dòng hàng `cost_price_snapshot` khác null; KTV được giao đơn | KTV `GET /orders/{id}` (và phản hồi thêm dòng tại hiện trường) | Mọi `lines[].cost_price_snapshot` = `null` | integration |
| AC-ORD-266 | Cùng đơn | Sale chủ đơn / Manager `GET /orders/{id}` | `cost_price_snapshot` giữ nguyên giá trị | integration |
| AC-ORD-267 | BUG-03: Manager mở đơn `IN_PROGRESS`, `allowed_commands` có `cancel_active` (không có `cancel`) | bấm "Huỷ đơn" → nhập lý do → "Xác nhận huỷ" | Gọi `POST /orders/{id}/cancel-active` với `{version, reason}`; toast "Đã huỷ đơn {code}." | component |
| AC-ORD-268 | Sale chủ đơn mở đơn `IN_PROGRESS` (`allowed_commands` không có `cancel`/`cancel_active`) | xem thanh hành động | Không có nút "Huỷ đơn" | component |

BUG-03 (phát hiện ở lượt UAT 2): backend đã nối `cancel_active` (spec M-order-dispatched-state-a, AC-ORD-177/178/180) nhưng UI bị hoãn (M3-03b/M4-01c "ngoài phạm vi") và chưa từng làm → Manager không huỷ được đơn đang thực hiện (kịch bản CS5-11).

## 4. API
Không thêm endpoint. Hành vi `POST /api/v1/orders/{id}/tasks/{task_id}/assignees` và trường `cost_price_snapshot` của `OrderDetail` thay đổi như AC.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Không đổi (UI đã ẩn giá vốn với KTV; nút thao tác đơn tự hiện lại vì `allowed_commands` đúng trạng thái).

## 7. Kịch bản UAT thủ công
1. Tạo đầu việc giao 1 KTV → KTV Từ chối → đơn "Chờ điều phối".
2. QLKT "+ Thêm người" KTV khác → đơn "Đang thực hiện".
3. KTV mới Tiếp nhận → Bắt đầu → Báo hoàn thành → đơn "Chờ KH xác nhận".
4. Đăng nhập KTV, mở DevTools › GET /api/v1/orders/{id} → `cost_price_snapshot: null`.

## 8. Giả định & câu hỏi
- Giả định: áp dụng đúng Q90 và Q125 đã chốt, không có quy tắc nghiệp vụ mới.
