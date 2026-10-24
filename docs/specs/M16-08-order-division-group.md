# M16-08 — Đơn hàng: "Phòng phụ trách" chọn từ "Nhóm sản phẩm/dịch vụ"

- **Status:** Approved (2026-10-24, chủ dự án chốt trực tiếp trong phiên — xem mục 8; thay thế quyết định Q08 cũ)
- **Backlog:** M16-08 · **Milestone:** M16
- **Phụ thuộc:** M16-07 (bảng `product_service_groups` + 3 nhóm seed) phải xong trước
- **Liên quan:** `docs/product/OPEN_QUESTIONS_ARCHIVE.md` Q08 (quyết định cũ: `division` là enum cố định, không bắt buộc)

## 1. Mục tiêu
Là Sale, tôi muốn chọn "Phòng phụ trách" trên đơn từ danh sách "Nhóm sản phẩm/dịch vụ" quản lý được trong Danh mục, thay vì danh sách cố định trong code, để Manager tự thêm/sửa nhóm khi cần mà không cần sửa code.

## 2. Phạm vi
- Trong phạm vi:
  - `orders.division` (enum `OFFICE_EQUIPMENT`/`SECURITY`/`GENERAL`, string) đổi thành `orders.division_id` — FK tới `product_service_groups.id`, **nullable** (giữ đúng Q08: không bắt buộc), không `ondelete` (nhóm chỉ ngừng hoạt động, không xoá cứng — giống `csat_recorded_by`/`credited_employee_id`).
  - `OrderCreate`/`OrderUpdate` nhận `division_id: uuid | null`; nếu có giá trị, nhóm phải **tồn tại** trong `product_service_groups` (không bắt buộc `is_active=true` — chọn lại nhóm đã ngừng hoạt động vẫn hợp lệ nếu đơn cũ đang dùng, cùng nguyên tắc với `credited_employee_id` ở M16-04).
  - `OrderDetail`/`OrderSummary` trả `division_id: uuid | null` **và** `division_name: str | null` (lấy tên hiện tại của nhóm qua join tại thời điểm đọc — không phải snapshot; nếu nhóm bị đổi tên sau, đơn cũ hiển thị tên mới nhất, không lưu lịch sử).
  - **Chỉ sửa được khi đơn còn DRAFT** (`order.edit_draft`) — giữ đúng hành vi cũ: `division` không thuộc `CONTACT_FIELDS`/`order.edit_contact`, không sửa được sau khi submit.
  - **Migrate dữ liệu cũ**: đơn có `division` cũ (`OFFICE_EQUIPMENT`/`SECURITY`/`GENERAL`) tự động map sang `division_id` của đúng nhóm cùng tên đã seed ở M16-07 (không mất dữ liệu "Phòng phụ trách" đã ghi).
  - UI: `DraftOrderForm`/`OrderInfoTab` đổi ô chọn "Phòng phụ trách" từ `<select>` tĩnh (hard-code 3 giá trị) sang `<select>` lấy danh sách từ `GET /api/v1/product-service-groups?is_active=true` (chỉ hiện nhóm đang hoạt động trong danh sách chọn khi tạo/sửa đơn DRAFT; đơn cũ trỏ tới nhóm đã ngừng hoạt động vẫn hiển thị đúng tên ở chế độ xem).
- Ngoài phạm vi: gắn nhóm vào Product/Service (M16-07 §2); báo cáo/dashboard theo nhóm (hiện không có, không thêm).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-194 | Hoa (SALE) tạo đơn | `POST /orders` kèm `division_id` = 1 nhóm đang hoạt động | 201, `division_id`/`division_name` đúng nhóm đó | integration |
| AC-ORD-195 | Đơn DRAFT | `PATCH /orders/{id}` kèm `division_id` = uuid không tồn tại | 422 field error trên `division_id` | integration |
| AC-ORD-196 | Đơn DRAFT đã có `division_id` | `PATCH /orders/{id}` kèm `division_id: null` | 200, `division_id`/`division_name` về `null` | integration |
| AC-ORD-197 | Trước migration, đơn X có `division='SECURITY'` | Chạy migration M16-08 | Sau migration, đơn X có `division_id` = id nhóm "Thiết bị an ninh" (seed ở M16-07) | integration (migration test, giống kiểu `alembic upgrade/downgrade` đã có) |
| AC-ORD-198 | Đơn đã submit (không còn DRAFT) | `PATCH /orders/{id}/contact` (hoặc endpoint tương đương `order.edit_contact`) gửi kèm `division_id` | 422 `extra=forbid` (field không có trong `OrderContactUpdate`, giống hành vi cũ của `division`) | integration |
| AC-ORD-199 | Đơn DRAFT, có nhóm "Thiết bị văn phòng" đã bị ngừng hoạt động | Hoa mở form tạo/sửa đơn, desktop 1440px | Ô "Phòng phụ trách" liệt kê đúng các nhóm **đang hoạt động** (không có "Thiết bị văn phòng" nếu đã ngừng) | component |
| AC-ORD-200 | Đơn cũ đã lưu `division_id` trỏ tới nhóm nay đã ngừng hoạt động | Mở lại đơn đó (chế độ xem), mobile 390px | Vẫn hiện đúng tên nhóm (không hiện trống/lỗi) dù nhóm không còn trong danh sách chọn | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/orders | order.create | `OrderCreate.division` (enum) → `division_id: uuid \| null` |
| PATCH | /api/v1/orders/{id} | order.edit_draft | `OrderUpdate.division` → `division_id: uuid \| null` |
| GET | /api/v1/orders/{id}, /api/v1/orders (list) | order.read | Response đổi `division: str \| null` → `division_id: uuid \| null`, `division_name: str \| null` |

## 5. Dữ liệu / Migration
- `ALTER TABLE orders ADD COLUMN division_id uuid NULL REFERENCES product_service_groups(id)`.
- Backfill: map `division='OFFICE_EQUIPMENT'/'SECURITY'/'GENERAL'` sang đúng `division_id` của 3 nhóm seed ở M16-07 (theo UUID cố định đã seed).
- `ALTER TABLE orders DROP COLUMN division`.

## 6. UI
- Copy giữ nguyên "Phòng phụ trách"; nguồn dữ liệu đổi từ hằng số `DIVISION_LABELS`/`DIVISION_ORDER` (xoá khỏi `frontend/src/features/orders/schemas.ts`) sang gọi API nhóm (tái dùng hook mới từ M16-07, lọc `is_active=true` khi ở form tạo/sửa).

## 7. Kịch bản UAT thủ công
1. Trước khi deploy: xác nhận vài đơn cũ có "Phòng phụ trách" khác nhau.
2. Sau migration: mở lại đúng các đơn đó, xác nhận "Phòng phụ trách" vẫn hiện đúng tên nhóm tương ứng.
3. Tạo đơn mới, chọn 1 nhóm từ danh sách — Manager vào Danh mục ngừng hoạt động nhóm đó — mở lại đơn cũ vẫn thấy đúng tên, nhưng tạo đơn mới không còn thấy nhóm đó trong danh sách chọn.

## 8. Giả định & câu hỏi
Chủ dự án đã chốt trực tiếp trong phiên (2026-10-24), thay quyết định Q08 cũ:
- `division_id` không bắt buộc là nhóm `is_active=true` ở tầng validate (chỉ cần tồn tại) — tầng UI mới lọc theo hoạt động khi hiện danh sách chọn.
- Dữ liệu đơn cũ map tự động theo tên nhóm trùng khớp (không bỏ trống).
- Không snapshot tên nhóm trên đơn — hiển thị theo tên hiện tại của nhóm (join sống), khác với snapshot sản phẩm/dịch vụ trên dòng hàng (quy tắc #7 CLAUDE.md áp dụng cho giá/tên SP-DV trên dòng hàng, không áp dụng cho nhãn "Phòng phụ trách" ở đây).
