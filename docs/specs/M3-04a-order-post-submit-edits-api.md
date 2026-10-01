# M3-04a — Sửa liên hệ & dòng hàng sau khi gửi: API

- **Status:** Done
- **Backlog:** M3-04a (tách từ M3-04) · **Milestone:** M3
- **Liên quan:** `spec/permissions.yaml` (`order.edit_contact`: MANAGER all/SALE own — "phone/address/notes after submit, until COMPLETED"; `order.edit_lines_after_submit`: MANAGER all/SALE own — Q09 "until COMPLETED/CANCELLED, audited"; `order.read`: MANAGER/SALE/TECH_LEAD all); `spec/state_machines.yaml#order` (7 trạng thái; **không** có transition nào cho sửa liên hệ/dòng — đây là guard nghiệp vụ cấp domain, không đổi `status`, giống `ORDER_NOT_DRAFT` ở M3-02a/Q52); `docs/product/DOMAIN_MODEL.md` §5 (Order — cột `customer_name/phone/email/tax_code` "sửa được theo quyền `order.edit_contact`"), §6 (OrderLine); `docs/product/OPEN_QUESTIONS.md` Q09 (ai được sửa dòng hàng/giá sau khi gửi), Q52/Q53 (guard `ORDER_NOT_DRAFT`, snapshot không đồng bộ theo khách); `M3-02a-draft-orders-api.md` (pricing engine, `OrderLineCreate/Update/Remove`, khoá `version`); `M3-03a-order-transitions-api.md` (7 trạng thái đơn đã cài transition, `GET /orders/{id}/history` đọc `audit_events`); M1-05 audit framework (`audit.service.record`)

## 1. Mục tiêu
Là Nhân viên kinh doanh (đơn của mình) hoặc Quản lý chung (mọi đơn), sau khi đơn đã được gửi đi, tôi muốn sửa lại thông tin liên hệ (nếu khách đổi SĐT/địa chỉ) hoặc sửa/thêm/xoá dòng hàng (nếu phát sinh/điều chỉnh khi triển khai) mà không phải thu hồi đơn về Nháp, và mọi thay đổi được ghi lại đầy đủ giá trị trước/sau để tra soát và phục vụ KPI.

## 2. Phạm vi
Tách theo mẫu M3-02a/b, M3-03a/b: item này là **M3-04a — API**; giao diện ở `M3-04b` (spec chưa viết). Gộp cả backend (4 route mới + đổi `GET /orders/{id}`) + UI (form sửa liên hệ, sửa dòng hàng trên trang chi tiết đơn) ước lượng vượt ~400 dòng non-test, nên tách để giữ mỗi phiên là 1 lát cắt nhỏ.

- **Trong phạm vi:**
  - `PATCH /orders/{id}/contact` — sửa 6 trường liên hệ/mô tả (xem Q57) khi đơn **không còn** `DRAFT` và **chưa** `COMPLETED`/`CANCELLED`.
  - `POST /orders/{id}/lines-after-submit`, `PATCH /orders/{id}/lines-after-submit/{line_id}`, `POST /orders/{id}/lines-after-submit/{line_id}/remove` — thêm/sửa/xoá dòng hàng với cùng điều kiện trạng thái, tái dùng nguyên hàm tính tiền (`pricing.py`) của M3-02a.
  - `GET /orders/{id}` (đã có) bổ sung 2 trường `can_edit_contact`, `can_edit_lines_after_submit` — để FE không tự suy luận quyền/trạng thái (CLAUDE.md quy tắc 4), giống tinh thần `allowed_commands` của M3-03a.
  - Audit: mỗi lệnh ghi 1 dòng `audit_events` (`entity_type="ORDER"`) chứa **diff đầy đủ giá trị trước/sau** của từng trường đổi (`data.changes`) — khác với quy ước "chỉ ghi tên trường" của M1-05 (nhân sự), vì đây là dữ liệu tiền/liên hệ khách hàng cần tra soát khi có tranh chấp (xem §8).
- **Ngoài phạm vi (để lại milestone sau):**
  - Guard liên quan `tasks` (ví dụ chặn sửa dòng khi task đã gắn số lượng cụ thể) — bảng `tasks` chưa tồn tại tới M4-01; mọi trạng thái sau `PENDING_DISPATCH` (`IN_PROGRESS`, `AWAITING_CONFIRMATION`, `REVISION`) hiện chỉ tới được bằng seed thẳng DB trong test, chưa tới được qua API thật cho tới khi M4/M6 xây xong — giống giả định của M3-03a.
  - Hiển thị tab Lịch sử (`GET /orders/{id}/history`, đã có từ M3-03a) đọc được các action mới (`edit_contact`, `add/update/remove_line_after_submit`) **mà không cần sửa gì ở route đó** — chỉ cần `record()` đúng `entity_type=ORDER`.
  - Giao diện (form sửa liên hệ, sửa dòng hàng trên trang chi tiết đơn) → **M3-04b**.

## 3. Acceptance Criteria
Dữ liệu mẫu — nhân sự (giống M3-02a/M3-03a): **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]; **Hà** NV007 [SALE khác]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN, không có capability nào ở item này].
Khách hàng: `KH00001` "Cty Sáng Tạo Mới", SĐT `0909123456`.
Danh mục: `LCD-DELL22` "Màn hình Dell 22 inch", giá **2.500.000**, `vat_rate=8`, `price_fixed=true`; `PC-I5-12400` "PC SMYOU CORE I5-12400", giá **11.980.000**, `vat_rate=0`, `price_fixed=false`.
"**Đơn A**": tạo bởi Hoa, đã `submit` (như AC-ORD-040 của M3-03a) → `status="PENDING_DISPATCH"`, `customer_id=KH00001.id`, `customer_phone="0909123456"`, `service_address="12 Lê Lợi, Q1"`, 1 dòng `LCD-DELL22` quantity=2 (`line_gross=5000000, line_vat=400000, line_total=5400000`), `version=V` (giá trị cụ thể lấy theo số lần thao tác trước đó trong test).

### Sửa liên hệ (`PATCH /orders/{id}/contact`)

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-072 | Đơn A, `version=V` | Hoa (chủ đơn) `PATCH /orders/{id}/contact {version:V, customer_phone:"0988777666", service_address:"20 Nguyễn Huệ, Q1"}` | 200 `OrderDetail`; `customer_phone`/`service_address` đổi đúng giá trị mới, các trường khác giữ nguyên; `version=V+1`; 1 dòng `audit_events` mới: `entity_type="ORDER"`, `action="edit_contact"`, `actor_id=Hoa.id`, `data.changes={"customer_phone":{"before":"0909123456","after":"0988777666"},"service_address":{"before":"12 Lê Lợi, Q1","after":"20 Nguyễn Huệ, Q1"}}` | integration |
| AC-ORD-073 | Đơn A, `version=V` | Hà (SALE khác, không phải chủ) gọi cùng request → 404 (ngoài scope `own`, theo mẫu M3-02a/M3-03a); An (MANAGER, scope `all`) gọi cùng request → 200 | integration |
| AC-ORD-074 | Đơn A | Khoa (TECHNICIAN, không có `order.edit_contact`) `PATCH /orders/{id}/contact {version:V, customer_phone:"..."}` | 403 `FORBIDDEN` | integration |
| AC-ORD-075 | 1 đơn DRAFT của Hoa (chưa `submit`), `version=V` | Hoa `PATCH /orders/{id}/contact {version:V, customer_phone:"0988777666"}` | 409 `ORDER_NOT_SUBMITTED` (đơn chưa gửi — dùng `PATCH /orders/{id}` của M3-02a); đơn không đổi | integration |
| AC-ORD-076 | 1 đơn seed thẳng DB `status="COMPLETED"`; 1 đơn khác seed `status="CANCELLED"`, cả hai `version=V` | Hoa (chủ đơn) `PATCH /orders/{id}/contact {version:V, customer_phone:"..."}` trên từng đơn | cả hai → 409 `ORDER_LOCKED`; đơn không đổi | integration |
| AC-ORD-077 | Đơn A, `version` hiện tại là V | Hoa `PATCH /orders/{id}/contact {version:V-1, customer_phone:"..."}` (cũ) | 409 `STALE_VERSION`; đơn không đổi | integration |
| AC-ORD-078 | Đơn A, `version=V` | Hoa `PATCH /orders/{id}/contact {version:V}` (không kèm trường nào khác) | 200; `version=V+1` (hành vi kế thừa M1-04a/Q40); `audit_events` `action="edit_contact", data.changes={}` | integration |
| AC-ORD-079 | — | `PATCH /orders/{id}/contact` | khai đúng 1 capability `order.edit_contact`; nằm trong ma trận RBAC route thật | generated |

### Sửa/thêm/xoá dòng sau khi gửi (`.../lines-after-submit`)

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-080 | Đơn A, `version=V` | An (MANAGER) `POST /orders/{id}/lines-after-submit {version:V, item_type:"PRODUCT", product_id:PC-I5-12400.id, quantity:1, unit_price:11980000, vat_rate:0}` | 201 `OrderDetail`; dòng mới `line_gross=line_total=11980000`; `subtotal`/`total` đơn cộng thêm 11980000; `version=V+1`; `audit_events`: `action="add_line_after_submit"`, `data={"line_id":<id>, "item":"PC SMYOU CORE I5-12400", "line_total":11980000}` | integration |
| AC-ORD-081 | Đơn A, `version=V` | Hoa (SALE, chủ đơn) gọi y hệt AC-ORD-080 | 201 — Sale cũng được thêm dòng ở đơn của mình sau khi gửi (Q09: Manager mọi đơn **và** Sale đơn của mình) | integration |
| AC-ORD-082 | Đơn A | Hà (SALE khác) `POST /orders/{id}/lines-after-submit {...}` → 404 (ngoài scope `own`); Khoa (TECHNICIAN) → 403 `FORBIDDEN` | integration |
| AC-ORD-083 | Đơn A có dòng `LCD-DELL22` quantity=2 (`line_total=5400000`), `version=V` | An `PATCH /orders/{id}/lines-after-submit/{line_id} {version:V, quantity:3}` | 200; `line_gross=7500000, line_vat=600000, line_total=8100000`; tổng đơn cập nhật theo; `audit_events`: `action="update_line_after_submit"`, `data={"line_id":<id>, "item":"Màn hình Dell 22 inch", "changes":{"quantity":{"before":"2","after":"3"}}}` | integration |
| AC-ORD-084 | Tiếp AC-ORD-083 (dòng `LCD-DELL22` nay `line_total=8100000`), `version=V+1` | An `POST /orders/{id}/lines-after-submit/{line_id}/remove {version:V+1}` | 200; dòng biến mất khỏi `lines[]`; tổng đơn giảm đúng `8100000`; `audit_events`: `action="remove_line_after_submit"`, `data={"line_id":<id>, "item":"Màn hình Dell 22 inch", "line_total":8100000}` (ghi lại giá trị tại thời điểm xoá, vì dòng không còn truy vấn được nữa) | integration |
| AC-ORD-085 | 1 đơn DRAFT của Hoa (chưa `submit`), `version=V`, có 1 dòng | Hoa gọi lần lượt cả 3 lệnh ở `.../lines-after-submit*` (thêm/sửa/xoá) | cả 3 → 409 `ORDER_NOT_SUBMITTED` (đơn chưa gửi — dùng `POST/PATCH /orders/{id}/lines...` của M3-02a); không có gì đổi | integration |
| AC-ORD-086 | 1 đơn seed `status="COMPLETED"`, có 1 dòng, `version=V` | An gọi lần lượt cả 3 lệnh ở `.../lines-after-submit*` | cả 3 → 409 `ORDER_LOCKED`; không có gì đổi | integration |
| AC-ORD-087 | Đơn A, `version` hiện tại là V | An thêm/sửa/xoá dòng với `version:V-1` (cũ) | cả 3 lệnh → 409 `STALE_VERSION`; không có gì đổi | integration |
| AC-ORD-088 | Đơn A | An `POST /orders/{id}/lines-after-submit {version:V, item_type:"PRODUCT", product_id:LCD-DELL22.id, quantity:1, unit_price:9999999, vat_rate:8}` (giá cố định, `unit_price` khác giá danh mục) | 422 `PRICE_FIXED` field `unit_price` (tái dùng guard tính tiền của M3-02a) | integration |
| AC-ORD-089 | — | 3 route `.../lines-after-submit*` | mỗi route khai đúng 1 capability `order.edit_lines_after_submit`; nằm trong ma trận RBAC route thật | generated |
| AC-ORD-106 | Đơn A có dòng `LCD-DELL22` chưa tặng kèm, `unit_price=2500000`, `version=V` | An `PATCH /orders/{id}/lines-after-submit/{line_id} {version:V, is_gift:true}` (không kèm `unit_price`) | 200; dòng `is_gift=true`, `unit_price=0`, `line_gross=line_vat=line_total=0`; `audit_events`: `action="update_line_after_submit"`, `data.changes={"is_gift":{"before":false,"after":true},"unit_price":{"before":2500000,"after":0}}` — `unit_price` vẫn phải xuất hiện dù client không gửi, vì là thay đổi tiền thực tế do side-effect tính giá (xem §4) | integration |

### Cờ quyền trên `GET /orders/{id}`

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-090 | Đơn A (PENDING_DISPATCH) | Hoa (chủ), An `GET /orders/{id}` | `can_edit_contact=true, can_edit_lines_after_submit=true` cho cả hai; Hà (SALE khác, `order.read=all` nên đọc được nhưng scope `own` của 2 capability mới không khớp) `GET /orders/{id}` → 200, `can_edit_contact=false, can_edit_lines_after_submit=false`; Tuấn (TECH_LEAD, không có 2 capability này) → 200, cả 2 `false` | integration |
| AC-ORD-091 | 1 đơn DRAFT của Hoa | Hoa `GET /orders/{id}` | `can_edit_contact=false, can_edit_lines_after_submit=false` (đơn chưa gửi — dùng form sửa nháp hiện có của M3-02b, ngoài phạm vi 2 cờ này) | integration |
| AC-ORD-092 | 1 đơn seed `status="COMPLETED"` | An `GET /orders/{id}` | `can_edit_contact=false, can_edit_lines_after_submit=false` | integration |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| PATCH | /api/v1/orders/{id}/contact | order.edit_contact | `{version, customer_name?, customer_phone?, customer_email?, customer_tax_code?, service_address?, work_description?}` | 200 `OrderDetail` | 404, 409, 422 |
| POST | /api/v1/orders/{id}/lines-after-submit | order.edit_lines_after_submit | `OrderLineCreate` (giống M3-02a) | 201 `OrderDetail` | 404, 409, 422 |
| PATCH | /api/v1/orders/{id}/lines-after-submit/{line_id} | order.edit_lines_after_submit | `OrderLineUpdate` (giống M3-02a) | 200 `OrderDetail` | 404, 409, 422 |
| POST | /api/v1/orders/{id}/lines-after-submit/{line_id}/remove | order.edit_lines_after_submit | `OrderLineRemove` (giống M3-02a) | 200 `OrderDetail` | 404, 409 |
| GET | /api/v1/orders/{id} | order.read | — | `OrderDetail` **+ 2 trường mới** `can_edit_contact: bool`, `can_edit_lines_after_submit: bool` | 404 (đã có) |

Ghi chú:
- Route dòng hàng dùng tiền tố `lines-after-submit` (khác `lines` của M3-02a) vì framework yêu cầu **mỗi route khai đúng đúng 1 capability tĩnh** (`backend/app/core/authz.py: undeclared_routes`) — không thể cùng 1 path vừa `order.edit_draft` (khi DRAFT) vừa `order.edit_lines_after_submit` (khi không DRAFT) tuỳ trạng thái runtime. Cùng lý do, `PATCH /orders/{id}/contact` là route mới, tách khỏi `PATCH /orders/{id}` (vẫn giữ nguyên hành vi DRAFT-only của M3-02a, không sửa).
- Cả 4 route mới dùng chung guard trạng thái: `status == "DRAFT"` → 409 `ORDER_NOT_SUBMITTED`; `status ∈ {"COMPLETED","CANCELLED"}` → 409 `ORDER_LOCKED`; còn lại (`PENDING_DISPATCH`, `IN_PROGRESS`, `AWAITING_CONFIRMATION`, `REVISION`) → cho phép. Đây là guard nghiệp vụ cấp domain (như `ORDER_NOT_DRAFT`/Q52), **không** thêm vào `spec/state_machines.yaml` vì không đổi `status`.
- Khoá đồng thời giống M3-02a: mọi lệnh cần `version` của **đơn**, `SELECT ... FOR UPDATE`, tăng `orders.version` thêm 1 mỗi lệnh thành công — kể cả khi chỉ đổi `order_lines`.
- 3 route `.../lines-after-submit*` tái dùng **nguyên** logic tính tiền/validate của M3-02a (`pricing.py`, `PRICE_FIXED`, `ITEM_INACTIVE`, `DISCOUNT_EXCEEDS_GROSS`, `VAT_REQUIRED_FOR_CUSTOM`) — chỉ khác capability + guard trạng thái; không viết lại domain logic.
- `data.changes` của `audit_events`: với mỗi trường (trong tập theo dõi của route đó) mà giá trị **thực sự đổi** so với trước — sau khi áp dụng mọi side-effect tính giá, không chỉ giới hạn ở trường client gửi lên trong request — ghi `{"<field>": {"before": <giá trị cũ>, "after": <giá trị mới>}}`; trường không đổi thì bỏ qua (không xuất hiện trong `changes`). Ví dụ: `PATCH .../lines-after-submit/{line_id} {is_gift:true}` không gửi `unit_price`, nhưng pricing engine (`_resolve_pricing`) zero hoá `unit_price` như hệ quả của `is_gift=true` → `unit_price` vẫn phải xuất hiện trong `changes` (xem AC-ORD-106), vì đây là dữ liệu tiền cần tra soát khi có tranh chấp (§2). Đây là lựa chọn có chủ đích khác M1-05 (chỉ ghi tên trường cho nhân sự) — xem §8.
- `can_edit_contact`/`can_edit_lines_after_submit` tính theo đúng công thức `allowed_commands` của M3-03a: actor có capability tương ứng (đúng scope `own`/`all` cho đơn này) **và** `status` đơn nằm trong tập cho phép ở trên — không đánh giá guard tính tiền (sửa dòng vẫn có thể trả 422 khi bấm thật, như `PRICE_FIXED`).

## 5. Dữ liệu / Migration
Không có. Toàn bộ cột cần dùng (`customer_name/phone/email/tax_code`, `service_address`, `work_description`, `version`) đã tồn tại từ migration M3-02a; không có trạng thái/cột mới.

## 6. UI
Không có ở item này (API-only) — xem `M3-04b` (spec chưa viết).

## 7. Kịch bản UAT thủ công (API — giao diện ở M3-04b)
1. `make up`; đăng nhập Sale; tạo + gửi 1 đơn (`POST /orders`, `POST /orders/{id}/lines`, `POST /orders/{id}/submit`) qua `/smyoutask/api/docs`.
2. `PATCH /orders/{id}/contact` đổi `customer_phone` → 200; `GET /orders/{id}/history` (route M3-03a) thấy dòng `edit_contact` với `data.changes` đúng.
3. `POST /orders/{id}/lines-after-submit` thêm 1 dòng mới → 200/201, tổng tiền cập nhật; `PATCH .../lines-after-submit/{line_id}` sửa số lượng dòng đó → tổng tiền cập nhật lại; `POST .../lines-after-submit/{line_id}/remove` xoá đi.
4. Thử gọi `PATCH /orders/{id}/contact` trên 1 đơn còn DRAFT → nhận 409 `ORDER_NOT_SUBMITTED`.

## 8. Giả định & câu hỏi
- Q09 (✅ đã chốt: Manager mọi đơn + Sale đơn của mình được sửa dòng hàng/giá sau khi gửi, có audit, tới trước khi Hoàn tất/Huỷ) là nền tảng của toàn bộ item này; Q52 (✅ guard nghiệp vụ không phải transition, trả mã 409 riêng) là tiền lệ cho `ORDER_NOT_SUBMITTED`/`ORDER_LOCKED`.
- **Câu hỏi mới — Q57 (đề xuất: như §3/§4 trên)**: `spec/permissions.yaml` chỉ ghi chú ngắn "phone/address/notes after submit, until COMPLETED" cho `order.edit_contact`, còn `DOMAIN_MODEL.md` §5 lại nêu đích danh 4 trường `customer_name/phone/email/tax_code` — hai nguồn không khớp hoàn toàn, và chưa nguồn nào nói rõ `work_description`/trạng thái `REVISION` có tính không. *Đề xuất:* gộp **6 trường** (`customer_name`, `customer_phone`, `customer_email`, `customer_tax_code`, `service_address`, `work_description`), **không gồm** `customer_id` (không cho đổi liên kết sang khách khác sau khi gửi — chỉ sửa chữ, giống tinh thần Q53 "muốn khác hẳn thì tạo đơn mới/dùng Khách lẻ ngay từ đầu"); `division`/`priority`/`requested_date`/`payment_status`/`payment_method` **không** sửa được sau khi gửi ở item này (đã ảnh hưởng điều phối/kế toán). Cho phép sửa liên hệ **và** dòng hàng khi `status ∈ {PENDING_DISPATCH, IN_PROGRESS, AWAITING_CONFIRMATION, REVISION}` — tính cả `REVISION` dù đơn đã từng `COMPLETED`, vì đây đúng là lúc cần sửa lại dòng hàng/liên hệ do lỗi; chặn khi còn `DRAFT` (chưa cần, dùng form nháp) hoặc đã `COMPLETED`/`CANCELLED` hẳn.
- Giả định kỹ thuật: `IN_PROGRESS`/`AWAITING_CONFIRMATION`/`REVISION`/`COMPLETED` chưa tới được qua API thật ở milestone này (cần M4/M6) — AC seed thẳng DB để kiểm guard, giống M3-03a §8 (`order_has_no_tasks` luôn `True`). Khi M4-M6 xây xong, hành vi/API của item này không cần đổi.
- Giả định: `data.changes` chỉ chứa giá trị **sau khi chuẩn hoá** (ví dụ `customer_phone` lưu nguyên chuỗi client gửi, không áp quy tắc chuẩn hoá SĐT của `customers.phone`/Q51 — đây là snapshot tự do như M3-02a đã định, không tham chiếu bảng `customers`).
- Không có đề xuất thay đổi `spec/*.yaml` nào khác ở item này — 2 capability `order.edit_contact`/`order.edit_lines_after_submit` đã có sẵn trong `spec/permissions.yaml`.
