# M21-05a — API: KTV ghi "Tiềm năng sử dụng dịch vụ" của khách hàng + 2 cột mới ở báo cáo Doanh thu theo khách hàng

- **Status:** Approved (2026-11-01, chủ dự án chốt Q146–Q156)
- **Backlog:** M21-05a · **Milestone:** M21
- **Phụ thuộc:** M5-03 (phân công), M16-06 (báo cáo doanh thu theo khách hàng)
- **Liên quan:** spec/permissions.yaml#customer.potential.record (mới), #report.revenue.read, spec/state_machines.yaml#assignment

## 1. Mục tiêu
Là kỹ thuật viên đang làm việc tại khách, tôi muốn ghi lại nhu cầu/tiềm năng mua thêm dịch vụ của khách (vd "KH muốn lắp thêm 4 camera kho, hỏi giá máy in màu"), để Sale/CSKH/Manager thấy trong báo cáo doanh thu theo khách hàng, cùng ngày mua hàng gần nhất của khách.

## 2. Phạm vi
- Trong phạm vi:
  - Bảng mới `customer_potential_notes` (append-only, có lịch sử): mỗi lần ghi là 1 bản ghi gắn **khách hàng chủ đơn** + **đơn** + **người ghi**. Bản ghi mới nhất là "tiềm năng hiện tại" của khách.
  - `POST /orders/{order_id}/customer-potential` `{ note }` — KTV ghi được khi có phân công của chính mình trên 1 đầu việc của đơn này ở trạng thái `ACCEPTED`, `IN_PROGRESS` hoặc `DONE`, và đơn **không** ở `COMPLETED`/`CANCELLED`. Ghi `audit_events` (`entity_type=CUSTOMER`, `action=potential_note`, `data.order_id`).
  - `GET /orders/{order_id}/customer-potential` — lịch sử ghi của **khách hàng chủ đơn** (mới nhất trước): `note`, người ghi, mã đơn, thời điểm. Ai đọc được đơn thì đọc được (cùng scope `order.read`, KTV theo `assigned`).
  - Báo cáo "Doanh thu theo khách hàng" (`GET /reports/revenue-by-customer` + `/export`): mỗi dòng thêm `potential_note` (ghi chú mới nhất của khách, `null` nếu chưa có), `potential_noted_at`, và `last_purchase_date` = ngày tạo (giờ VN) của đơn **gần nhất** của khách ở trạng thái khác `DRAFT`/`CANCELLED`, **không** phụ thuộc khoảng ngày lọc của báo cáo.
  - Capability mới `customer.potential.record: { TECHNICIAN: assigned }`.
- Ngoài phạm vi: UI (M21-05b); sửa/xoá ghi chú đã ghi; Sale/CSKH ghi tiềm năng.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CUS-040 | Đơn DH2611-0005 (IN_PROGRESS) của KH "Công ty TNHH Minh Phát"; Khang (KTV) có phân công `IN_PROGRESS` trên đầu việc của đơn | Khang `POST /orders/{id}/customer-potential { note:"Muốn lắp thêm 4 camera kho" }` | 201; bản ghi `customer_id=Minh Phát`, `order_id`, `author=Khang`; audit `potential_note` trên CUSTOMER | integration |
| AC-CUS-041 | Phân công của Khang ở `ACCEPTED` / `DONE` (đơn còn IN_PROGRESS) | Khang POST | 201 | integration |
| AC-CUS-042 | Phân công của Khang `PENDING` hoặc `REJECTED`; hoặc Khang không có phân công trên đơn | Khang POST | 404 (ngoài scope, không lộ đơn) | integration |
| AC-CUS-043 | Đơn `COMPLETED` hoặc `CANCELLED`, Khang có phân công `DONE` | Khang POST | 409 `GUARD_FAILED` guard=`order_open_for_potential_note` | integration |
| AC-CUS-044 | — | `note` rỗng / toàn khoảng trắng / > 1000 ký tự | 422 | integration |
| AC-CUS-045 | Hoa (SALE), Mai (CSKH), Bình (TECH_LEAD), An (MANAGER) | POST | 403 | integration |
| AC-CUS-046 | Minh Phát có 2 ghi chú từ đơn DH2610-0002 (01/10) và DH2611-0005 (05/11) | Khang (có phân công DH2611-0005) `GET /orders/{DH2611-0005}/customer-potential` | 2 bản ghi, mới nhất trước, mỗi bản có `order_code`, `author_name`, `created_at` | integration |
| AC-CUS-047 | Như AC-046 | An `GET /reports/revenue-by-customer` | Dòng Minh Phát có `potential_note="<ghi chú 05/11>"`, `potential_noted_at` = 05/11 | integration |
| AC-CUS-048 | Minh Phát: đơn COMPLETED tạo 10/09/2026, đơn IN_PROGRESS tạo 03/11/2026, đơn DRAFT tạo 06/11, đơn CANCELLED tạo 07/11 | An xem báo cáo với khoảng ngày 01/09–30/09 | `last_purchase_date="2026-11-03"` (không phụ thuộc khoảng lọc, bỏ DRAFT/CANCELLED) | integration |
| AC-CUS-049 | KH chưa có ghi chú tiềm năng | báo cáo | `potential_note=null`, `potential_noted_at=null` | integration |
| AC-CUS-050 | Như AC-047/048 | `/reports/revenue-by-customer/export` | CSV có thêm cột "Tiềm năng sử dụng dịch vụ" và "Ngày mua hàng cuối" (`dd/MM/yyyy`); ghi chú bắt đầu bằng `=`/`+`/`-`/`@` được thoát | integration |
| AC-CUS-051 | Hoa (SALE, scope `own` M16-06) | Hoa xem báo cáo | Các dòng Hoa thấy được cũng có 2 trường mới (không đổi scope) | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{order_id}/customer-potential | customer.potential.record | `{ note: str (1–1000, trim) }` | `CustomerPotentialNoteOut { id, customer_id, order_id, order_code, note, author_id, author_name, created_at }` | 403, 404, 409, 422 |
| GET | /api/v1/orders/{order_id}/customer-potential | order.read (scope như đọc đơn) | — | `list[CustomerPotentialNoteOut]` | 404 |
| GET | /api/v1/reports/revenue-by-customer (+ /export) | report.revenue.read | không đổi | `RevenueRowOut` thêm `potential_note: str\|null`, `potential_noted_at: datetime\|null`, `last_purchase_date: date\|null` | — |

## 5. Dữ liệu / Migration
- `customer_potential_notes`: `id uuid PK`, `customer_id FK customers NOT NULL`, `order_id FK orders NOT NULL`, `author_id FK employees NOT NULL`, `note text NOT NULL CHECK (length(note) BETWEEN 1 AND 1000)`, `created_at timestamptz NOT NULL default now()`. Index `(customer_id, created_at DESC)`. Không UPDATE/DELETE.
- `customer_id` lấy từ `orders.customer_id` lúc ghi (khách lẻ cũ không có `customer_id` → 409 `GUARD_FAILED` guard=`order_has_customer`).
- `spec/permissions.yaml`: thêm `customer.potential.record: { TECHNICIAN: assigned }` (diff §8).

## 6. UI
Không có (M21-05b).

## 7. Kịch bản UAT thủ công
Kiểm qua UI ở M21-05b.

## 8. Giả định & câu hỏi
- Chốt 2026-11-01: dạng **ghi chú tự do**.
- Giả định (Q154): KTV ghi được khi phân công `ACCEPTED`/`IN_PROGRESS`/`DONE` và đơn chưa `COMPLETED`/`CANCELLED`; không sửa/xoá — ghi lại bản mới thay thế, lịch sử giữ đầy đủ.
- Giả định (Q155): "Ngày mua hàng cuối" = ngày **tạo** đơn gần nhất (trừ Nháp/Huỷ), tính trên toàn bộ lịch sử của khách, không theo khoảng lọc.
- Giả định (Q156): tiềm năng gắn với **khách hàng** (không chỉ đơn): báo cáo hiện ghi chú mới nhất dù ghi ở đơn nào.
- Diff YAML đề xuất:
  ```yaml
  customer.potential.record: { TECHNICIAN: assigned }   # M21-05a
  ```
