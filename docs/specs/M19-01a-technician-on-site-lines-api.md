# M19-01a — API: Kỹ thuật viên thêm/sửa/xoá dòng hàng tại hiện trường

- **Status:** Approved
- **Backlog:** M19-01a · **Milestone:** M19
- **Liên quan:** spec/permissions.yaml#order.edit_lines_on_site (mới), #catalog.read, #catalog.read_cost (mới); spec/state_machines.yaml#order (không đổi trạng thái); M3-04a (dòng hàng sau khi gửi), M16-04 (Ghi doanh số); Q123–Q127

## 1. Mục tiêu
Là kỹ thuật viên đang làm việc ở nhà khách, khi khách muốn mua thêm hoặc thay mới thiết bị, tôi muốn tự thêm dòng hàng vào đơn mà tôi đang làm, để đơn và hoá đơn khớp với thực tế, và doanh số của dòng đó được ghi cho tôi.

## 2. Phạm vi
- Trong phạm vi:
  - Capability mới `order.edit_lines_on_site: { TECHNICIAN: assigned }`, kèm 3 endpoint riêng `.../lines-on-site` (thêm / sửa / xoá). Phần định giá, snapshot, tính tổng và `version` dùng lại logic của M3-04a.
  - Guard `actor_has_active_work_on_order`: KTV phải có phân công `ACCEPTED`/`IN_PROGRESS` ở chu kỳ hiện tại, trên một task chưa huỷ của đơn (Q126). Đơn phải ở `IN_PROGRESS`/`REVISION` (Q123).
  - KTV chỉ được sửa/xoá **dòng do chính mình thêm tại hiện trường**. Dòng do Sale/Manager tạo và dòng của KTV khác thì không đụng được.
  - Định giá "như Sale" (Q123): `unit_price` (chỉ với hàng giá linh hoạt, hàng giá cố định vẫn bị `PRICE_FIXED`), `vat_rate`, `is_gift`, `line_discount`, `note`.
  - Ghi doanh số: server luôn đặt `credited_employee_id = KTV`. KTV gửi người khác thì bị 422 (Q124). Sale/Manager vẫn đổi được sau qua `lines-after-submit` như cũ.
  - Cột mới trên `order_lines`: `added_by_id` (ai thêm dòng, áp cho mọi dòng tạo mới từ nay) và `added_on_site` (dòng do KTV thêm tại hiện trường).
  - `OrderDetail.can_add_lines_on_site` và `OrderLineOut.can_edit_on_site` (cờ từ server; frontend không tự suy quyền). Thêm `OrderLineOut.added_by_name` và `added_on_site`.
  - Thông báo `ORDER_LINES_CHANGED_ON_SITE` gửi người tạo đơn và mọi QLKT đang hoạt động, sau mỗi lần KTV thêm/sửa/xoá (Q127).
  - KTV được `catalog.read` để chọn sản phẩm/dịch vụ. Giá vốn trong danh mục bị ẩn với người không có `catalog.read_cost` (Q125).
- Ngoài phạm vi:
  - Giao diện (M19-01b).
  - Duyệt dòng hàng (đã chốt: có hiệu lực ngay).
  - Tự tạo đầu việc khi KTV thêm dịch vụ lắp đặt (QLKT tự quyết).
  - Dòng hàng "Tự do" (đã bỏ ở M15-06).
  - Thay đổi máy trạng thái đơn.

## 3. Acceptance Criteria
Dữ liệu mẫu: đơn **DH2610-0042** của khách "Công ty TNHH An Phát", Sale chủ đơn **Hoa**. Task "Lắp đặt 4 camera" giao cho **Bình** (TECHNICIAN, phân công `IN_PROGRESS`). **Cường** (TECHNICIAN) không có phân công trên đơn. **Dũng** (TECHNICIAN) từng có phân công nhưng đã `REJECTED`. QLKT là **Lan**. Đơn `IN_PROGRESS`, `version=V`. Sản phẩm `SSD-512` "Ổ cứng SSD Kingston 512GB" giá cố định 1.250.000đ, VAT 8%. Dịch vụ `DV-CAP` "Đi dây cáp mạng" giá linh hoạt 150.000đ/m, VAT 0%.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-219 | Bình, đơn `IN_PROGRESS` | `POST /orders/{id}/lines-on-site {version:V, item_type:"PRODUCT", product_id:SSD-512.id, quantity:1, unit_price:1250000, vat_rate:8}` | 201 `OrderDetail`; dòng mới có `line_total=1350000`, `added_by_id=Bình`, `added_on_site=true`, `credited_employee_id=Bình`; `total` đơn tăng 1.350.000; `version=V+1`; `audit_events` có `action="add_line_on_site"`, `data={"line_id", "item":"Ổ cứng SSD Kingston 512GB", "line_total":1350000}`, `actor_id=Bình` | integration |
| AC-ORD-220 | Bình, đơn `REVISION`, task được mở lại, phân công chu kỳ mới `ACCEPTED` | thêm dòng `DV-CAP`, `quantity:20, unit_price:120000, line_discount:100000` | 201; `line_total = 20×120000 − 100000 = 2300000`; KTV được nhập giá linh hoạt và giảm giá (định giá như Sale) | integration |
| AC-ORD-221 | Bình | thêm `SSD-512` với `unit_price:999000` | 422 `PRICE_FIXED` field `unit_price` (giữ guard định giá của M3-02a) | integration |
| AC-ORD-222 | Bình | thêm dòng kèm `credited_employee_id` = Hoa | 422 field error `credited_employee_id`, message "Dòng hàng do kỹ thuật viên thêm chỉ ghi doanh số cho chính bạn." Nếu không gửi, hoặc gửi `null`, hoặc gửi chính Bình → 201 với `credited_employee_id=Bình` | integration |
| AC-ORD-223 | Cường (TECHNICIAN, không có phân công trên đơn) | `POST /orders/{id}/lines-on-site` | 404 (ngoài scope `assigned`) | integration |
| AC-ORD-224 | Dũng (đã `REJECTED`, vẫn thuộc scope `assigned`) và Bình khi phân công còn `PENDING` hoặc đã `DONE` | `POST /orders/{id}/lines-on-site` | 409 `GUARD_FAILED` guard=`actor_has_active_work_on_order`, message "Bạn chỉ thêm/sửa dòng hàng khi đang nhận hoặc thực hiện đầu việc của đơn này." | integration |
| AC-ORD-225 | Bình có phân công `IN_PROGRESS`; đơn ở `AWAITING_CONFIRMATION`, `COMPLETED`, `CANCELLED` (dựng trực tiếp trong DB) | `POST /orders/{id}/lines-on-site` | 409 `ORDER_LOCKED` | integration |
| AC-ORD-226 | Hoa (SALE), An (MANAGER), Lan (TECH_LEAD), CSKH | `POST /orders/{id}/lines-on-site` | 403 (thiếu capability `order.edit_lines_on_site`) | integration + generated |
| AC-ORD-227 | Bình đã thêm dòng SSD (AC-ORD-219) | `PATCH /orders/{id}/lines-on-site/{line_id} {version, quantity:2}` | 200; `line_total=2700000`; `audit_events` có `action="update_line_on_site"`, `data.changes.quantity={before:"1", after:"2"}` (cùng định dạng diff M3-04a) | integration |
| AC-ORD-228 | Bình đã thêm dòng SSD | `POST /orders/{id}/lines-on-site/{line_id}/remove {version}` | 200; dòng bị xoá, tổng đơn giảm tương ứng; `audit_events` có `action="remove_line_on_site"`, `data` gồm `item` và `line_total` | integration |
| AC-ORD-229 | Đơn có dòng "Camera Dahua 2MP" do Hoa tạo, và một dòng do KTV **Em** (cùng đơn) thêm tại hiện trường (`added_on_site=true`, `added_by_id=Em`) | Bình `PATCH`/`remove` hai dòng đó | 403 `LINE_NOT_EDITABLE`, message "Bạn chỉ sửa/xoá được dòng hàng do chính mình thêm." Dữ liệu không đổi | integration |
| AC-ORD-230 | Bình đã thêm dòng | `PATCH .../lines-on-site/{line_id}` đổi `credited_employee_id` sang Hoa | 422 field error `credited_employee_id` (như AC-ORD-222) | integration |
| AC-ORD-231 | Bình gửi `version=V-1` (đơn vừa được Hoa sửa) | add/patch/remove trên `lines-on-site` | 409 `STALE_VERSION` | integration |
| AC-ORD-232 | Hoa (SALE chủ đơn) | `PATCH /orders/{id}/lines-after-submit/{line_id}` trên dòng Bình thêm, đổi `credited_employee_id` sang Hoa | 200 (luồng M3-04a không bị giới hạn bởi `added_on_site`); audit `update_line_after_submit` có diff `credited_employee_id` | integration |
| AC-ORD-233 | Bình xem `GET /orders/{id}` khi đơn `IN_PROGRESS` và có phân công `IN_PROGRESS` | — | `can_add_lines_on_site=true`; dòng Bình thêm có `can_edit_on_site=true`, `added_on_site=true`, `added_by_name="Nguyễn Văn Bình"`; dòng Hoa tạo có `can_edit_on_site=false`; `can_edit_lines_after_submit=false` | integration |
| AC-ORD-234 | Cùng đơn khi Bình còn `PENDING`, hoặc đơn `AWAITING_CONFIRMATION`; và Hoa xem đơn | `GET /orders/{id}` | Bình: `can_add_lines_on_site=false` và mọi dòng có `can_edit_on_site=false`. Hoa: `can_add_lines_on_site=false` (không có capability), `can_edit_lines_after_submit=true` như cũ | integration |
| AC-ORD-235 | Sale Hoa tạo dòng mới ở đơn DRAFT và qua `lines-after-submit` | `POST /orders/{id}/lines` và `POST .../lines-after-submit` | Dòng mới có `added_by_id=Hoa`, `added_on_site=false`. Các dòng có từ trước migration: `added_by_id=null`, `added_on_site=false`, `added_by_name=null` | integration |
| AC-NTF-051 | Bình thêm dòng SSD (AC-ORD-219) | — | Hoa (người tạo đơn) và mọi TECH_LEAD đang hoạt động (Lan) nhận đúng 1 thông báo `type="ORDER_LINES_CHANGED_ON_SITE"`, title "KTV thay đổi dòng hàng", body "Đơn DH2610-0042: Nguyễn Văn Bình thêm Ổ cứng SSD Kingston 512GB × 1"; `entity_type="ORDER"`. Bình không tự nhận thông báo của chính mình | integration |
| AC-NTF-052 | Bình sửa rồi xoá dòng đó | — | Mỗi thao tác gửi 1 thông báo cùng type tới cùng người nhận; body lần lượt là "… sửa Ổ cứng SSD Kingston 512GB" và "… xoá Ổ cứng SSD Kingston 512GB". Nếu người tạo đơn cũng là TECH_LEAD thì chỉ nhận 1 bản | integration |
| AC-CAT-098 | Bình (chỉ có vai trò TECHNICIAN) | `GET /products`, `GET /services` (và `GET /products/{id}`) | 200; mỗi phần tử có `cost_price=null` (thiếu `catalog.read_cost`). Hoa (SALE) gọi cùng endpoint thì `cost_price` vẫn có giá trị như trước | integration |
| AC-CAT-099 | Bình | `POST /products`, `PATCH /services/{id}` | 403 (TECHNICIAN không có `catalog.manage`); menu "Danh mục" không xuất hiện trong `menu.json` của TECHNICIAN | integration + generated |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{id}/lines-on-site | order.edit_lines_on_site | `OrderLineCreate` (như M3-04a; `credited_employee_id` chỉ nhận null/bản thân) | 201 `OrderDetail` | 403, 404, 409 `ORDER_LOCKED`/`GUARD_FAILED`/`STALE_VERSION`, 422 |
| PATCH | /api/v1/orders/{id}/lines-on-site/{line_id} | order.edit_lines_on_site | `OrderLineUpdate` | `OrderDetail` | 403 `LINE_NOT_EDITABLE`, 404, 409, 422 |
| POST | /api/v1/orders/{id}/lines-on-site/{line_id}/remove | order.edit_lines_on_site | `OrderLineRemove {version}` | `OrderDetail` | 403 `LINE_NOT_EDITABLE`, 404, 409 |
| GET | /api/v1/orders/{id} | order.read | — | `OrderDetail` thêm `can_add_lines_on_site: bool`; `OrderLineOut` thêm `added_by_id`, `added_by_name`, `added_on_site`, `can_edit_on_site` | — |
| GET | /api/v1/products, /services (+ chi tiết) | catalog.read | — | `cost_price` = null khi thiếu `catalog.read_cost` | — |

Thứ tự kiểm tra cho `lines-on-site`: capability → scope (404) → `version` (`STALE_VERSION`) → trạng thái đơn ∈ {IN_PROGRESS, REVISION} (`ORDER_LOCKED`; DRAFT trả `ORDER_NOT_SUBMITTED` như M3-04a) → `actor_has_active_work_on_order` → (sửa/xoá) dòng có `added_on_site=true` và `added_by_id=actor` (`LINE_NOT_EDITABLE`) → validate định giá và ghi doanh số (422).

## 5. Dữ liệu / Migration
- `order_lines.added_by_id uuid NULL REFERENCES employees(id)` (index), `order_lines.added_on_site boolean NOT NULL DEFAULT false`. Không backfill: dòng cũ để null/false.
- Đề xuất sửa `spec/permissions.yaml` (chưa sửa, chờ duyệt spec):
```yaml
  catalog.read:          { MANAGER: all, SALE: all, CUSTOMER_CARE: all, TECH_LEAD: all, TECHNICIAN: all }  # M19-01a: KTV chọn hàng khi thêm dòng tại hiện trường
  catalog.read_cost:     { MANAGER: all, SALE: all, CUSTOMER_CARE: all, TECH_LEAD: all }  # M19-01a (Q125): giá vốn trong danh mục; giữ nguyên ai đang thấy
  order.edit_lines_on_site: { TECHNICIAN: assigned }  # M19-01a: chỉ dòng mình thêm, đơn IN_PROGRESS/REVISION, phân công ACCEPTED/IN_PROGRESS
```
- `spec/state_machines.yaml`: thêm guard mô tả `actor_has_active_work_on_order: actor has an assignment in status [ACCEPTED, IN_PROGRESS] in the current cycle on a non-cancelled task of the order`. Không thêm transition nào.
- Theo quy tắc 13 (M17-05): chạy `make contract`, thêm nhãn cho `order.edit_lines_on_site` và `catalog.read_cost` ở `permissionLabels.ts`, cập nhật `docs/product/PERMISSIONS.md`.

## 6. UI
Không có ở item này (xem M19-01b). Khi làm item này, frontend chỉ cần build qua được với type mới sinh từ `make contract`.

## 7. Kịch bản UAT thủ công (qua M19-01b)
Xem M19-01b §7.

## 8. Giả định & câu hỏi
- Đã chốt với chủ dự án (2026-10-31, Q123):
  - Dòng KTV thêm có hiệu lực ngay và có gửi thông báo.
  - Chỉ thêm được khi đơn `IN_PROGRESS`/`REVISION`.
  - KTV sửa/xoá được dòng chính mình thêm.
  - Định giá như Sale.
- Giả định (⏳, cần chủ dự án xác nhận):
  - **Q124**: KTV không chọn được người khác ở ô "Ghi doanh số". Server luôn ghi cho chính KTV; Sale/Manager đổi sau nếu cần.
  - **Q125**: Cấp `catalog.read` cho KTV, nhưng ẩn giá vốn trong danh mục bằng capability mới `catalog.read_cost` (giữ nguyên quyền của các vai trò khác). Lưu ý: `cost_price_snapshot` trên dòng hàng của đơn KTV được giao thì hiện nay KTV đã xem được (theo `order.read_prices`). Item này không đổi điều đó.
  - **Q126**: "Đang thực hiện task" nghĩa là phân công `ACCEPTED` hoặc `IN_PROGRESS` ở chu kỳ hiện tại. `PENDING` (chưa nhận) và `DONE` (đã xong phần mình) thì không thêm được.
  - **Q127**: Thông báo gửi người tạo đơn và mọi QLKT, cho cả thêm, sửa và xoá. Không gửi Manager và CSKH.
