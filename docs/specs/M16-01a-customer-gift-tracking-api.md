# M16-01a — Ghi nhận tặng quà khách hàng — API

- **Status:** Approved (2026-10-24 — chủ dự án chốt trực tiếp qua Q97–Q99, xem `OPEN_QUESTIONS_ARCHIVE.md`)
- **Backlog:** M16-01a · **Milestone:** M16
- **Liên quan:** `docs/product/DOMAIN_MODEL.md` §14 (CustomerGift); `docs/specs/M3-01-customers.md` (Customer); `backend/app/modules/files/` (pipeline ảnh M6-01, tái dùng cho `kind=GIFT_PHOTO`); `backend/app/modules/audit/` (lịch sử thay đổi); `spec/permissions.yaml`

## 1. Mục tiêu
Là Sale/CSKH/Manager, tôi muốn ghi nhận mỗi lần tặng quà cho khách hàng (dịp lễ, gói quà, chi phí, ảnh chụp) để theo dõi chi phí và lịch sử chăm sóc khách hàng.

## 2. Phạm vi
- Trong phạm vi:
  - Bảng `customer_gifts` theo DOMAIN_MODEL §14. Không gắn `order_id` (Q98).
  - Capability mới:
    - `customer_gift.read`: `{MANAGER: all, SALE: all, CUSTOMER_CARE: all}`
    - `customer_gift.manage`: `{MANAGER: all, SALE: all, CUSTOMER_CARE: all}` (tạo + sửa; không có xoá — Q97)
  - `POST /api/v1/customer-gifts` — tạo bản ghi: `{customer_id, occasion_name, performed_date, gift_name, quantity, unit_price, other_cost, performed_by, requested_by, note?}`. `total_amount` server tính (`quantity × unit_price + other_cost`), client không gửi trường này (nếu gửi, server bỏ qua — không nhận giá trị client tự tính). `note` (text, tối đa 2000 ký tự) tuỳ chọn, không ảnh hưởng `total_amount`.
  - `GET /api/v1/customer-gifts?customer_id=&from=&to=&limit=&offset=` — danh sách, mặc định sắp theo `performed_date` giảm dần rồi `created_at` giảm dần; `customer_id` bắt buộc (trang chi tiết khách hàng gọi theo 1 khách) — **không** cho gọi không `customer_id` ở item này (danh sách toàn hệ thống là báo cáo, xem M16-02a).
  - `GET /api/v1/customer-gifts/{id}` — chi tiết 1 bản ghi.
  - `PATCH /api/v1/customer-gifts/{id}` — sửa (optimistic lock `version`, giống Customer/Order). Mọi trường sửa được trừ `customer_id` (bất biến — tạo sai khách hàng thì tạo bản ghi mới, không chuyển bản ghi sang khách khác). Ghi `audit_events` (`entity_type=CUSTOMER_GIFT`, `action=update`, `data={changed_fields: {field: {from, to}}}`) cho **mọi** trường thực sự đổi giá trị (Q97 — lưu lịch sử thay đổi, đọc qua `GET /audit-events` đã có, `audit.read`, MANAGER).
  - `POST /api/v1/customer-gifts/{id}/photos` — tải ảnh (multipart, tái dùng `files.service.store_image`, `owner_type=CUSTOMER_GIFT`, `kind=GIFT_PHOTO`, `revision_no=1` cố định — không có khái niệm "revision" như ảnh xác nhận đơn, chỉ nhiều ảnh cùng 1 bản ghi). Giới hạn/định dạng giống M6-01 (`image/jpeg|png|webp|heic`, ≤ `UPLOAD_MAX_MB`).
  - `GET /api/v1/customer-gifts/{id}/photos` — danh sách ảnh của bản ghi.
  - `GET /api/v1/attachments/{id}` (đã có, M6-01) — thêm nhánh `owner_type=CUSTOMER_GIFT` → capability `customer_gift.read` (scope luôn `all` nên không cần check row-scope riêng như `ORDER`).
  - `audit.domain.EntityType` thêm `CUSTOMER_GIFT`.
- Ngoài phạm vi: UI (M16-01b); báo cáo "Chi phí quà tặng KH" (M16-02a/b); xoá bản ghi (không có — sửa sai thì sửa lại, có lịch sử).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-GFT-001 | Hoa (SALE), khách `KH00001` | `POST /customer-gifts {customer_id, occasion_name:"Tết 2027", performed_date:"2027-01-20", gift_name:"Giỏ quà Tết", quantity:2, unit_price:500000, other_cost:50000, performed_by:<Hoa>, requested_by:<An-MANAGER>}` | 201; `total_amount = 2*500000+50000 = 1050000`; `version=1`; `created_by=Hoa` | integration |
| AC-GFT-002 | Như trên | `POST` với `total_amount` client tự gửi khác số tính được | 201; server **bỏ qua** giá trị client gửi, `total_amount` vẫn = công thức server tính (field không có trong `CustomerGiftCreate`, extra="forbid" → thực ra 422 field `total_amount` không tồn tại) | integration |
| AC-GFT-003 | — | `POST` với `quantity:0` hoặc `unit_price:-1000` | 422 field tương ứng | integration |
| AC-GFT-004 | Lan (CUSTOMER_CARE) | `POST /customer-gifts {...}` | 201 (CUSTOMER_CARE có `customer_gift.manage`) | integration |
| AC-GFT-005 | Đức (TECHNICIAN, không có capability) | `POST /customer-gifts {...}` | 403 | integration |
| AC-GFT-006 | 3 bản ghi của `KH00001`, 1 bản ghi của `KH00002` | Hoa `GET /customer-gifts?customer_id=<KH00001>` | 200; chỉ 3 bản ghi của `KH00001`, sắp `performed_date` giảm dần (Q97 — scope `all`, Hoa thấy cả bản ghi do Lan tạo) | integration |
| AC-GFT-007 | Bản ghi do Hoa tạo (`version=1`) | Lan (CUSTOMER_CARE, không phải người tạo) `PATCH /customer-gifts/{id} {version:1, gift_name:"Giỏ quà Tết cao cấp"}` | 200; sửa được dù không phải người tạo (scope `all`); `version=2` | integration |
| AC-GFT-008 | Như trên, sau khi Lan sửa | `GET /audit-events?entity_type=CUSTOMER_GIFT&entity_id=<id>` (An, MANAGER) | 200; có event `action=update`, `actor=Lan`, `data.changed_fields.gift_name = {from:"Giỏ quà Tết", to:"Giỏ quà Tết cao cấp"}` | integration |
| AC-GFT-009 | Bản ghi có `version=1` | `PATCH {version:1, customer_id:<KH_khác>}` | 422 field `customer_id` — bất biến | integration |
| AC-GFT-010 | Bản ghi có `version=1`, sửa lại với `version:1` lần 2 (đã sửa 1 lần, giờ còn `version=2`) | `PATCH {version:1, note:"x"}` | 409 `STALE_VERSION` | integration |
| AC-GFT-011 | Bản ghi `id` bất kỳ | `POST /customer-gifts/{id}/photos` (multipart, ảnh JPEG hợp lệ ≤ giới hạn) | 201; `GET /customer-gifts/{id}/photos` trả về ảnh vừa tải | integration |
| AC-GFT-012 | Như trên | `POST .../photos` file không phải ảnh (vd .txt đổi đuôi) | 422 `INVALID_FILE_TYPE` | integration |
| AC-GFT-013 | Ảnh đã tải cho bản ghi tặng quà | Hoa (SALE, có `customer_gift.read`) `GET /attachments/{photo_id}` | 200, trả đúng ảnh | integration |
| AC-GFT-014 | — | Đức (TECHNICIAN) `GET /attachments/{photo_id}` (ảnh thuộc `CUSTOMER_GIFT`) | 403 | integration |
| AC-GFT-015 | — | `GET /customer-gifts` (không `customer_id`) | 422 — `customer_id` bắt buộc ở route này | integration |
| AC-GFT-016 | — | `POST /customer-gifts {..., note:"Khách hẹn giao chiều"}`; sau đó `PATCH {version:1, note:"Đã giao"}` | 201 có `note` đúng giá trị; 200 sau PATCH có `note="Đã giao"`, `audit_events` ghi `changed_fields.note`; không gửi `note` (bỏ hẳn field) → `note=null` | integration |

## 4. API
| Method | Path | Capability | Response |
|---|---|---|---|
| POST | /api/v1/customer-gifts | customer_gift.manage | `CustomerGiftOut` |
| GET | /api/v1/customer-gifts | customer_gift.read | `{items:[CustomerGiftOut], total}` |
| GET | /api/v1/customer-gifts/{id} | customer_gift.read | `CustomerGiftOut` |
| PATCH | /api/v1/customer-gifts/{id} | customer_gift.manage | `CustomerGiftOut` |
| POST | /api/v1/customer-gifts/{id}/photos | customer_gift.manage | `Attachment` (201) |
| GET | /api/v1/customer-gifts/{id}/photos | customer_gift.read | `{items:[Attachment]}` |

`CustomerGiftOut`: `{id, customer_id, occasion_name, performed_date, gift_name, quantity, unit_price, other_cost, total_amount, note, performed_by:{id,code,full_name}, requested_by:{id,code,full_name}, created_by, version, created_at, updated_at}`.

## 5. Dữ liệu / Migration
`make migration name=customer_gifts` — bảng mới `customer_gifts` (cột theo DOMAIN_MODEL §14, FK `customer_id→customers`, `performed_by/requested_by/created_by→employees`); không đổi bảng `attachments`/`audit_events` (chỉ thêm giá trị enum ở code, không phải cột DB).

## 6. UI
Không có ở item này — xem M16-01b.

## 7. Kịch bản UAT thủ công
1. Sale tạo bản ghi tặng quà cho 1 khách hàng, tải 1 ảnh → xem lại đúng dữ liệu + ảnh.
2. CSKH sửa bản ghi do Sale tạo → xem "Nhật ký hệ thống" (MANAGER) thấy đúng trường đã đổi, giá trị cũ/mới.
3. Kỹ thuật viên gọi API trực tiếp → 403.

## 8. Giả định & câu hỏi
- **Đã chốt (2026-10-24, theo yêu cầu người dùng):** thêm trường `note` (text, tuỳ chọn, tối đa 2000 ký tự) — ghi chú tự do cho bản ghi tặng quà; sửa được qua PATCH, có lịch sử `audit_events` giống các trường khác.
- **Đã chốt (Q97, 2026-10-24):** scope `all` cho MANAGER/SALE/CUSTOMER_CARE (xem + sửa mọi bản ghi); bắt buộc lưu lịch sử thay đổi qua `audit_events`.
- **Đã chốt (Q98, 2026-10-24):** không gắn `order_id`.
- **Đã chốt (Q99, 2026-10-24):** `performed_by`/`requested_by` là FK nhân viên, chọn từ danh sách — không phải chữ tự do.
- Giả định: không có route xoá (Q97 ngụ ý sửa-để-đúng, không xoá — giống Customer/Order không có DELETE); `performed_by`/`requested_by` không bắt buộc phải là nhân viên `is_active=true` lúc tạo (ảnh hưởng tối thiểu, không chặn ghi lịch sử nếu nhân viên đã nghỉ) — chỉ cần `employees.id` hợp lệ.
- Giả định: `GET /customer-gifts` bắt buộc `customer_id` ở item API này vì màn hình dùng nó là tab trong trang chi tiết khách hàng (M16-01b); liệt kê toàn hệ thống (không theo 1 khách) thuộc về báo cáo M16-02a, tránh trùng lặp route.
