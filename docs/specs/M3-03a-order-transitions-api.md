# M3-03a — Gửi/thu hồi/huỷ đơn + danh sách/lịch sử: API

- **Status:** Approved
- **Backlog:** M3-03a (tách từ M3-03) · **Milestone:** M3
- **Liên quan:** `spec/state_machines.yaml#order` (transitions `submit`, `recall`, `cancel`, guards `customer_present`/`has_lines_or_description`/`service_address_present`/`order_has_no_tasks`/`reason_present`); `spec/permissions.yaml` (`order.submit`: MANAGER all/SALE own — dùng chung cho cả `submit` **và** `recall`; `order.cancel`: MANAGER all/SALE own; `order.read`: MANAGER/SALE/TECH_LEAD all, TECHNICIAN assigned); `docs/product/WORKFLOWS.md` §2 (sơ đồ trạng thái đơn) + §6 (khoá `FOR UPDATE` + `version`); `docs/product/DOMAIN_MODEL.md` §5 (cột `submitted_at/cancelled_at/cancel_reason` đã có sẵn từ migration M3-02a) + §12 (AuditEvent); `docs/architecture/ARCHITECTURE.md` §4 (lệnh POST có tên, lỗi problem+json); `M3-02a-draft-orders-api.md` (OrderDetail hiện có, guard nghiệp vụ `ORDER_NOT_DRAFT`); `backend/app/modules/workflow/guards.py` (5 guard của mục này đang ở `PENDING_GUARDS` ghi sẵn `"M3-03"`); M1-05 audit framework (`audit.service.record`/`list_events` tái dùng cho lịch sử)

## 1. Mục tiêu
Là Sale/Manager, tôi muốn gửi đơn nháp cho Quản lý kỹ thuật, thu hồi lại nếu gửi nhầm, hoặc huỷ đơn chưa triển khai — và mọi vai trò liên quan xem được danh sách đơn + lịch sử thay đổi của từng đơn.

## 2. Phạm vi
Tách theo mẫu M3-02a/b: item này là **M3-03a — API**; giao diện (danh sách + trang chi tiết có tab + nút hành động) ở `M3-03b-order-list-detail-ui.md`. Gộp cả backend + UI ước lượng vượt ~400 dòng non-test (3 lệnh chuyển trạng thái mới + 2 route đọc mới + trang danh sách + trang chi tiết 3 tab), nên tách để giữ mỗi phiên là 1 lát cắt nhỏ.

- **Trong phạm vi:**
  - Cài đặt 5 guard đang chờ ở `workflow/guards.py` (`customer_present`, `has_lines_or_description`, `service_address_present`, `order_has_no_tasks`, `reason_present`) và đăng ký vào `GUARDS`.
  - `POST /orders/{id}/submit` (DRAFT → PENDING_DISPATCH), `POST /orders/{id}/recall` (PENDING_DISPATCH → DRAFT), `POST /orders/{id}/cancel` (DRAFT|PENDING_DISPATCH → CANCELLED, có lý do).
  - `GET /orders` — danh sách đơn (tìm theo mã/tên khách/SĐT, lọc theo trạng thái, phân trang).
  - `GET /orders/{id}` (đã có) bổ sung trường `allowed_commands` — danh sách lệnh chuyển trạng thái mà actor hiện tại được phép gọi trên đơn này (tính theo `spec/state_machines.yaml`: `from` khớp trạng thái hiện tại **và** actor có capability đúng scope cho đơn đó; **không** đánh giá trước guard nghiệp vụ — bấm vẫn có thể trả 409 `GUARD_FAILED`, đúng tinh thần ARCHITECTURE §4 "FE không tự tính luật").
  - `GET /orders/{id}/history` — lịch sử đơn (đọc `audit_events` lọc theo đơn này), dùng cho tab "Lịch sử" ở M3-03b.
  - Effect `audit` cho cả 3 lệnh (tái dùng `audit.service.record`).
- **Ngoài phạm vi (để lại milestone sau):** `cancel_active` (Manager huỷ đơn đang chạy — cần bảng `tasks`, để M4-02); `complete`/`request_revision` (M6); sửa liên hệ/dòng sau khi gửi (M3-04); tạo `notifications` thật cho effect `notify_tech_leads` của lệnh `submit` — xem Q54 bên dưới; trang danh sách/chi tiết giao diện (M3-03b).

## 3. Acceptance Criteria
> Đơn dùng chung fixture với M3-02a: Hoa (SALE, `order.create/edit_draft/submit/cancel` scope `own`), Hà (SALE khác), An (MANAGER, mọi capability scope `all`), Tuấn (TECH_LEAD, chỉ `order.read` — không có `order.submit`/`order.cancel`), Khoa (TECHNICIAN, chưa có assignment nào). Khách `KH00001`. Sản phẩm `LCD-DELL22` (2.500.000đ, giá cố định).

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-ORD-040 | Đơn DRAFT "Đơn A" của Hoa: `customer_id=KH00001.id`, `service_address="12 Lê Lợi, Q1"`, 1 dòng `LCD-DELL22` (`line_total=5400000`), `version=N` | Hoa `POST /orders/{id}/submit {version:N}` | 200 `OrderDetail`; `status="PENDING_DISPATCH"`, `version=N+1`, `submitted_at` = giờ hiện tại (UTC); 1 dòng `audit_events` mới `action="submit", from_status="DRAFT", to_status="PENDING_DISPATCH", actor_id=Hoa.id`; `allowed_commands=["recall","cancel"]` | integration |
| AC-ORD-041 | Đơn A ở PENDING_DISPATCH (từ AC-ORD-040), `version=N+1` | Hoa `POST /orders/{id}/recall {version:N+1}` | 200; `status="DRAFT"`, `version=N+2`; 1 dòng `audit_events` `action="recall", from_status="PENDING_DISPATCH", to_status="DRAFT"`; `allowed_commands=["submit","cancel"]` | integration |
| AC-ORD-042 | Đơn A ở DRAFT (sau AC-ORD-041), `version=N+2` | Hoa `POST /orders/{id}/cancel {version:N+2, reason:"Khách đổi ý không mua nữa"}` | 200; `status="CANCELLED"`, `version=N+3`, `cancelled_at` = giờ hiện tại, `cancel_reason="Khách đổi ý không mua nữa"`; `audit_events` `action="cancel", from_status="DRAFT", to_status="CANCELLED", data.reason="Khách đổi ý không mua nữa"`; `allowed_commands=[]` | integration |
| AC-ORD-043 | Đơn DRAFT "Đơn B" của Hoa, đủ điều kiện submit, đã gửi (PENDING_DISPATCH) | Hoa `POST /orders/{id}/cancel {version, reason:"Lắp sai địa chỉ, tạo lại đơn mới"}` (huỷ khi đang PENDING_DISPATCH, không phải DRAFT) | 200; `status="CANCELLED"`; `audit_events` `from_status="PENDING_DISPATCH"` | integration |
| AC-ORD-044 | Đơn DRAFT `POST /orders {service_address:"12 Lê Lợi, Q1", work_description:"Lắp đặt máy in"}` (không khách, không `customer_name/phone`) | Hoa `submit` | 409 `GUARD_FAILED` guard=`customer_present`; đơn không đổi (`status`/`version` giữ nguyên) | integration |
| AC-ORD-045 | Đơn DRAFT `POST /orders {customer_id:KH00001.id, service_address:"12 Lê Lợi, Q1"}` (có khách + địa chỉ, không dòng hàng, `work_description` rỗng) | Hoa `submit` | 409 `GUARD_FAILED` guard=`has_lines_or_description` | integration |
| AC-ORD-046 | Đơn DRAFT `POST /orders {customer_id:KH00001.id, work_description:"Lắp đặt máy in"}` (có khách + mô tả, `service_address` rỗng) | Hoa `submit` | 409 `GUARD_FAILED` guard=`service_address_present` | integration |
| AC-ORD-047 | Đơn DRAFT của Hoa, đủ điều kiện huỷ | Hoa `cancel {version}` (không gửi `reason`) rồi `cancel {version, reason:"abc"}` (dưới 5 ký tự sau khi trim khoảng trắng) | cả hai: 409 `GUARD_FAILED` guard=`reason_present`; đơn không đổi | integration |
| AC-ORD-048 | Đơn A ở PENDING_DISPATCH (từ AC-ORD-040) | Hoa gọi lại `submit {version}` | 409 `INVALID_TRANSITION` (`submit` chỉ từ `DRAFT`); đơn không đổi | integration |
| AC-ORD-049 | Đơn DRAFT của Hoa, chưa từng gửi | Hoa gọi `recall {version}` | 409 `INVALID_TRANSITION` (`recall` chỉ từ `PENDING_DISPATCH`) | integration |
| AC-ORD-050 | 1 đơn seed thẳng ở DB với `status="CANCELLED"` | Hoa (chủ đơn) gọi `submit`/`recall`/`cancel` bất kỳ, đều `version` đúng | cả 3: 409 `INVALID_TRANSITION`; đơn không đổi | integration |
| AC-ORD-051 | Đơn A ở PENDING_DISPATCH, `version` hiện tại là N | Hoa `recall {version: N-1}` (cũ) | 409 `STALE_VERSION`; đơn không đổi | integration |
| AC-ORD-052 | Đơn DRAFT của Hoa, đủ điều kiện submit | Hà (SALE khác, không phải chủ) `submit {version}` → 404 (ngoài scope `own`, theo mẫu M3-02a AC-ORD-006); Khoa (TECHNICIAN, không có `order.submit`) → 403 `FORBIDDEN`; An (MANAGER, scope `all`) → 200 | integration |
| AC-ORD-053 | Đơn DRAFT của Hoa, đủ điều kiện huỷ | Hà `cancel {version, reason:"Huỷ thử"}` → 404; Khoa → 403 `FORBIDDEN`; An → 200 | integration |
| AC-ORD-054 | 3 đơn: "Đơn A" (DRAFT, khách `KH00001`, Hoa tạo), "Đơn B" (PENDING_DISPATCH, khách tự do `customer_name="Anh Long", customer_phone:"0977888999"`, Hoa tạo), "Đơn C" (CANCELLED, khách `customer_name="Chị Lan", customer_phone:"0933111222"`, An tạo) | Hoa `GET /orders?limit=20&offset=0` | 200 `{items,total:3,limit:20,offset:0}`; `items` sắp mới nhất trước (`created_at desc`); mỗi item `{id, code, status, customer_name, customer_phone, division, priority, total, requested_date, created_by, created_at}` (không có `lines`) | integration |
| AC-ORD-055 | 3 đơn như AC-ORD-054 | Hoa `GET /orders?status=PENDING_DISPATCH` → chỉ "Đơn B"; `GET /orders?q=0977888999` → chỉ "Đơn B" (tìm theo SĐT); `GET /orders?q=chị lan` → chỉ "Đơn C" (không phân biệt hoa/thường/dấu); `GET /orders?limit=101` → 422 | integration |
| AC-ORD-056 | 3 đơn như AC-ORD-054 | Hoa, An, Tuấn (`order.read=all` cả 3) `GET /orders` | cả 3: 200, `total=3`; Khoa (TECHNICIAN, scope `assigned`, chưa có task nào) `GET /orders` → 200, `items=[], total=0` (**không** 403 — có capability, chỉ scope rỗng) | integration |
| AC-ORD-057 | "Đơn A" DRAFT của Hoa | Hoa, An `GET /orders/{id}` | cả hai: `allowed_commands=["submit","cancel"]`; Hà (SALE khác) `GET /orders/{id}` → 200 nhưng `allowed_commands=[]` (đọc được, không có quyền chuyển trạng thái); Tuấn (TECH_LEAD, không có `order.submit`/`order.cancel`) → 200, `allowed_commands=[]` | integration |
| AC-ORD-058 | "Đơn B" PENDING_DISPATCH của Hoa; "Đơn C" CANCELLED | Hoa `GET` từng đơn | "Đơn B": `allowed_commands=["recall","cancel"]`; "Đơn C" (trạng thái cuối, không có transition nào từ `CANCELLED`): `allowed_commands=[]` | integration |
| AC-ORD-059 | "Đơn A" đã `submit` rồi `recall` (2 sự kiện, từ AC-ORD-040/041) | Hoa `GET /orders/{id}/history` | 200 `{items,total:2,limit,offset}`; mới nhất trước: `[0]` `action="recall", from_status="PENDING_DISPATCH", to_status="DRAFT", actor.full_name` của Hoa; `[1]` `action="submit", from_status="DRAFT", to_status="PENDING_DISPATCH"`; Hà (`order.read=all`) gọi cùng đơn → 200 cùng dữ liệu; Khoa (chưa có assignment, ngoài scope `assigned`) → 404 | integration |
| AC-ORD-060 | — | mọi route mới trong mục này (`submit`,`recall`,`cancel`,`GET /orders`,`GET /orders/{id}/history`) | khai đúng 1 capability (`order.submit`/`order.cancel`/`order.read`); nằm trong ma trận RBAC route thật | generated |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{id}/submit | order.submit | `{version}` | 200 `OrderDetail` | 404, 409 |
| POST | /api/v1/orders/{id}/recall | order.submit | `{version}` | 200 `OrderDetail` | 404, 409 |
| POST | /api/v1/orders/{id}/cancel | order.cancel | `{version, reason}` | 200 `OrderDetail` | 404, 409 |
| GET | /api/v1/orders | order.read | `q, status, limit≤100, offset` | `{items, total, limit, offset}` (item = `OrderSummary`, không có `lines`) | 422 |
| GET | /api/v1/orders/{id}/history | order.read | `limit≤100, offset` | `{items, total, limit, offset}` (giống `AuditEventOut` của M1-05) | 404 |
| GET | /api/v1/orders/{id} | order.read | — | `OrderDetail` **+ trường mới** `allowed_commands: string[]` | 404 |

Ghi chú:
- `recall` dùng chung capability `order.submit` với `submit` — đúng theo `spec/permissions.yaml` (không có `order.recall` riêng).
- `q` của `GET /orders` tìm không phân biệt hoa/thường/dấu trong `code`, `customer_name`, `customer_phone` (khớp mẫu `GET /customers?q=`, `GET /products?q=`).
- `GET /orders/{id}/history` **không** dùng capability `audit.read` (Manager-only, trang Nhật ký hệ thống M1-05) — dùng `order.read` để mọi vai trò xem được đơn cũng xem được lịch sử của chính đơn đó (xem Q55).

## 5. Dữ liệu / Migration
Không có. Các cột `submitted_at`, `cancelled_at`, `cancel_reason`, `version` đã tồn tại từ migration `20260929_0023_add_orders.py` (M3-02a) nhưng chưa được ghi bởi lệnh nào — item này là nơi đầu tiên ghi vào chúng.

## 6. UI
Không có ở item này (API-only) — xem `M3-03b-order-list-detail-ui.md`.

## 7. Kịch bản UAT thủ công (API — giao diện ở M3-03b)
1. `make up`; đăng nhập Sale; tạo 1 đơn nháp đủ điều kiện (khách + địa chỉ + 1 dòng) qua `/smyoutask/api/docs`.
2. `POST /orders/{id}/submit` → 200, `status=PENDING_DISPATCH`; `GET /orders/{id}/history` thấy sự kiện `submit`.
3. `POST /orders/{id}/recall` → 200, `status=DRAFT`; `POST /orders/{id}/cancel {reason:"Huỷ thử"}` → 200, `status=CANCELLED`.
4. `GET /orders?status=CANCELLED` thấy đơn vừa huỷ.

## 8. Giả định & câu hỏi
- Guard `order_has_no_tasks` (dùng ở `recall`/`cancel`) luôn trả `True` ở milestone này — bảng `tasks` chưa tồn tại (M4-01 mới tạo), nên không có AC âm cho "đơn có task". Khi M4-01 thêm bảng `tasks`, guard này cần cập nhật lại cách tính (đếm task chưa huỷ) — không đổi hành vi/API đã chốt ở item này.
- `submitted_at` bị ghi đè mỗi lần `submit` (kể cả sau khi đã `recall` rồi gửi lại) — không có cột "lần gửi đầu tiên" riêng; lịch sử đầy đủ nằm ở `audit_events`/tab Lịch sử.
- `OrderSummary` (item của `GET /orders`) không có `payment_status`/`payment_method`/`work_description` — chỉ đủ để hiển thị danh sách; muốn xem đầy đủ thì mở `GET /orders/{id}`.
- **Câu hỏi mới — Q54 (đề xuất: bỏ qua effect `notify_tech_leads` ở M3-03)**: lệnh `submit` trong `spec/state_machines.yaml` khai `effects: [notify_tech_leads, audit]`, nhưng bảng `notifications` và module Thông báo chưa tồn tại (backlog M7-01 "Thông báo in-app" chưa làm — hiện chỉ có `notification.read` capability khai sẵn, chưa có bảng/route). *Đề xuất:* M3-03 chỉ cài effect `audit`; `notify_tech_leads` để M7-01 làm (xây cả module Thông báo — chuông, badge, đánh dấu đã đọc, polling — mới có giá trị, làm nửa vời bây giờ chỉ tạo dòng không ai đọc được).
- **Câu hỏi mới — Q55 (đề xuất: endpoint riêng, không dùng `audit.read`)**: tab "Lịch sử" của trang chi tiết đơn cần hiện cho "tất cả" vai trò xem được đơn (`docs/design/UI_GUIDELINES.md` §5, dòng "Chi tiết đơn"), nhưng capability `audit.read` hiện chỉ cấp cho MANAGER (trang Nhật ký hệ thống, M1-05) — SALE/TECH_LEAD xem đơn của mình sẽ không gọi được `GET /audit-events`. *Đề xuất:* thêm route riêng `GET /orders/{id}/history` dùng capability `order.read` (đã có), đọc cùng bảng `audit_events` lọc `entity_type=ORDER, entity_id={id}` — không sửa `audit.read` trong `spec/permissions.yaml`, không ảnh hưởng trang Nhật ký hệ thống.
