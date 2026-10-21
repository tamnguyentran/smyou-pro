# M15-02a — Ghi nhận phản hồi khách hàng (CSKH) — API

- **Status:** Draft
- **Backlog:** M15-02a · **Milestone:** M15
- **Liên quan:** M15-01 (role `CUSTOMER_CARE`, `order.read: all`); `docs/product/DOMAIN_MODEL.md` §5 (Order — phân biệt với `customer_feedback`/`result_note` sẵn có, xem §8); `spec/state_machines.yaml#order` (trạng thái `COMPLETED`); `spec/permissions.yaml`

## 1. Mục tiêu
Là CSKH, tôi muốn tra cứu danh sách đơn đã hoàn tất, xem chi tiết và ghi lại đánh giá (1–5 sao) + nội dung phản hồi sau khi gọi điện hỏi khách, để công ty có dữ liệu chất lượng dịch vụ theo từng đơn.

## 2. Phạm vi
- Trong phạm vi:
  - `GET /api/v1/orders` thêm tham số lọc theo khoảng ngày tạo/hoàn tất mặc định (frontend tự truyền mặc định — xem §8), vẫn dùng route đã có (M3-03a), không đổi API — chỉ CSKH giờ gọi được nhờ `order.read: all` (M15-01).
  - 2 trường mới trên `orders`: `csat_rating` (smallint null, 1–5), `csat_comment` (text null, bắt buộc khi set rating), `csat_recorded_by` (uuid null → employees), `csat_recorded_at` (timestamptz null). **Tách riêng** khỏi `customer_feedback`/`result_note` hiện có (2 cột đó giữ nguyên, không đụng — Q73 vẫn mở).
  - `PUT /api/v1/orders/{id}/csat` — tạo/ghi đè phản hồi (1 bản ghi hiện hành/đơn, sửa lại thì đè số liệu cũ, không giữ lịch sử).
  - `GET /api/v1/orders/csat-summary?from=&to=&...` — đếm số đơn theo từng mức sao (1..5) + số đơn chưa đánh giá, cùng bộ filter với danh sách, dùng cho widget thống kê (M15-02b).
- Ngoài phạm vi: tô màu danh sách, widget UI (M15-02b); yêu cầu chỉnh sửa gửi QLKT (M15-03).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CSK-001 | Lan (CUSTOMER_CARE); đơn `DH2609-0010` ở `COMPLETED` | `PUT /orders/{id}/csat {version, csat_rating:5, csat_comment:"Khách rất hài lòng"}` | 200; `csat_rating=5`, `csat_recorded_by=Lan`, `csat_recorded_at` = thời điểm gọi; 1 audit event `csat_recorded` | integration |
| AC-CSK-002 | Như trên | `PUT /orders/{id}/csat {version, csat_rating:5, csat_comment:""}` | 422 `VALIDATION_ERROR`, field `csat_comment` bắt buộc khi có `csat_rating` | integration |
| AC-CSK-003 | Đơn `DH2609-0011` ở `PENDING_DISPATCH` (chưa hoàn tất) | Lan `PUT /orders/{id}/csat {...}` | 409 `GUARD_FAILED` guard=`order_completed` — chỉ ghi phản hồi khi đơn đã Hoàn tất | integration |
| AC-CSK-004 | Đơn đã có `csat_rating=3` | Lan `PUT /orders/{id}/csat {version, csat_rating:5, csat_comment:"Gọi lại, khách đổi ý đánh giá cao hơn"}` | 200; đè số liệu cũ (không giữ lịch sử); `version` tăng | integration |
| AC-CSK-005 | Hoa (SALE, không có `customer_care.manage_feedback`) | `PUT /orders/{id}/csat {...}` | 403 | integration |
| AC-CSK-006 | 10 đơn `COMPLETED` trong tháng: 3 đơn 5★, 2 đơn 4★, 1 đơn 3★, 1 đơn 2★, 1 đơn 1★, 2 đơn chưa đánh giá | Lan `GET /orders/csat-summary?from=<đầu tháng>&to=<hôm nay>` | 200 `{"5":3,"4":2,"3":1,"2":1,"1":1,"none":2}` | integration |
| AC-CSK-007 | Lan không truyền `from`/`to` | `GET /orders/csat-summary` | 200; server tự áp mặc định = từ ngày đầu tháng hiện tại đến hôm nay (theo giờ `Asia/Ho_Chi_Minh`) | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| PUT | /api/v1/orders/{id}/csat | customer_care.manage_feedback | `{version, csat_rating, csat_comment}` | `OrderDetail` | 404, 409 (`STALE_VERSION`, `GUARD_FAILED`), 422, 403 |
| GET | /api/v1/orders/csat-summary | customer_care.manage_feedback | `?from=&to=&customer_id=&created_by=` (cùng filter với `GET /orders`) | `{"5":n,"4":n,"3":n,"2":n,"1":n,"none":n}` | 422 |

`customer_care.manage_feedback` gán cho `CUSTOMER_CARE: all` và `MANAGER: all` trong `spec/permissions.yaml`.

## 5. Dữ liệu / Migration
Migration thêm 4 cột vào `orders`: `csat_rating smallint null CHECK (csat_rating BETWEEN 1 AND 5)`, `csat_comment text null`, `csat_recorded_by uuid null REFERENCES employees(id)`, `csat_recorded_at timestamptz null`. Index `(csat_recorded_at)` cho báo cáo lọc theo ngày ghi nhận.

## 6. UI
Không có ở item này — xem M15-02b.

## 7. Kịch bản UAT thủ công
1. Gọi `PUT /orders/{id}/csat` cho 1 đơn đã Hoàn tất với rating 5 + nội dung → 200, kiểm `GET /orders/{id}` thấy đúng.
2. Gọi lại với đơn chưa Hoàn tất → 409.
3. Gọi `GET /orders/csat-summary` không truyền ngày → thấy mặc định đầu tháng tới hôm nay, số đếm khớp dữ liệu seed.

## 8. Giả định & câu hỏi
- Giả định: chỉ ghi được phản hồi khi đơn ở `COMPLETED` (đơn đã `REVISION` quay lại `AWAITING_CONFIRMATION`/`COMPLETED` vẫn ghi được, vì guard chỉ kiểm trạng thái hiện tại). → ghi vào `OPEN_QUESTIONS.md` để chủ dự án xác nhận (có cho ghi phản hồi khi đơn đang `AWAITING_CONFIRMATION` không, vì thực tế gọi khách có thể xảy ra ngay sau khi khách ký, trước khi nhấn "Hoàn tất"?).
- Giả định: 1 đơn chỉ có 1 bản ghi phản hồi hiện hành (ghi đè), không lưu lịch sử các lần gọi lại — khác với yêu cầu lịch sử giá ở M15-08/09 (đó là nghiệp vụ khác, không áp dụng ở đây) vì mục đích là trạng thái đánh giá hiện tại của đơn, không phải nhật ký thao tác (đã có `audit_events`).
- Giả định MANAGER cũng có `customer_care.manage_feedback` (nhất quán với các capability khác, Manager luôn `all`).
