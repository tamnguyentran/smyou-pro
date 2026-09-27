# M2-01a — Danh mục sản phẩm: API

- **Status:** Draft
- **Backlog:** M2-01a · **Milestone:** M2
- **Liên quan:** DOMAIN_MODEL §2 (Product), §11 (Attachment); `spec/permissions.yaml` (`catalog.read`: MANAGER/SALE/TECH_LEAD all; `catalog.manage`: MANAGER all); ARCHITECTURE §5 (`code_sequences`, dùng làm ví dụ đối chiếu — sản phẩm **không** dùng bảng này, xem Q44); M1-04a (mẫu CRUD + optimistic lock + guard "không xoá, chỉ đổi trạng thái")

## 1. Mục tiêu
Là Quản lý chung, tôi tạo/sửa/tìm sản phẩm trong danh mục và gắn ảnh minh hoạ, để Nhân viên kinh doanh và Quản lý kỹ thuật xem được thông tin, giá, ảnh khi làm việc (tạo đơn ở M3, chọn vật tư khi giao việc).

## 2. Phạm vi
Tách 2 phần (Q42 ✅ — như M1-04): spec này là **M2-01a — API**; giao diện ở `M2-01b-products-ui.md`.
- **M2-01a — API:** CRUD sản phẩm (danh sách/tìm/lọc, chi tiết, tạo, sửa, ngừng/mở kinh doanh); module `attachments` tối thiểu (Q43 ✅) — chỉ `kind=PRODUCT_IMAGE`, dùng để tải lên và phục vụ ảnh sản phẩm.
- **M2-01b — Giao diện:** trang Danh mục sản phẩm (bảng/thẻ), form tạo/sửa, chọn & xem trước ảnh.
- Ngoài phạm vi: xoá vĩnh viễn sản phẩm (không bao giờ — như nhân viên, chỉ "ngừng kinh doanh"); ràng buộc "không xoá nếu đã có trong đơn" (DOMAIN_MODEL §2) — không áp dụng vì không có lệnh xoá; import CSV/XLSX (M2-03); Dịch vụ (M2-02, bảng riêng nhưng cùng khuôn — sẽ tái dùng phần lớn code này); các `kind` khác của `attachments` (`TASK_PHOTO`, `CUSTOMER_CONFIRMATION`, `revision_no` > 1, nén ảnh phía client) — để M6-01 mở rộng trên nền bảng đã có.

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN]. Sản phẩm mẫu: `MAYBO3551` "PC SMYOU CORE I5-12400 (I5-12400/16GB/SSD 512GB)" [PC], `LCD1137` "Màn hình Dell 22 inch" [MONITOR], `HOPMUC3053` "Hộp mực Brother TN-2385" [PRINTER_SUPPLY].

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-001 | 3 sản phẩm trên, `HOPMUC3053` đã ngừng kinh doanh | An gọi `GET /products?q=hop&category=PRINTER_SUPPLY&is_active=false&limit=20&offset=0` | 200 `{items, total, limit, offset}`; `q` tìm không phân biệt hoa/thường/dấu trong `sku` và `name`; lọc đúng theo `category`, `brand`, `is_active`; sắp theo `sku`; mỗi item `{id, sku, name, category, brand, unit, price, vat_rate, price_fixed, warranty_months, is_active, image_attachment_id, version}`; `limit` > 100 → 422 | integration |
| AC-CAT-002 | Hoa (SALE) và Tuấn (TECH_LEAD) — cả hai có `catalog.read` all | `GET /products`, `GET /products/{id}` | cả hai: 200 (chỉ đọc); Khoa (TECHNICIAN, không có capability) → 403 `FORBIDDEN` trên mọi route bên dưới | integration |
| AC-CAT-003 | An | `POST /products {sku:"MAYBO3552", name:"PC SMYOU CORE I5-13400", category:"PC", brand:"SMYOU", unit:"BO", price:12500000, vat_rate:8, price_fixed:true, warranty_months:36, specs:"I5-13400/16GB/SSD 512GB"}` | 201; `is_active=true`, `version=1`; Hoa/Tuấn gọi cùng request → 403 `FORBIDDEN` (chỉ `catalog.manage`) | integration |
| AC-CAT-004 | An | tạo với: `sku` đã tồn tại (khác hoa/thường) / `price` âm / `vat_rate` ngoài `[0,100]` hoặc > 2 chữ số thập phân / `category` hoặc `unit` không thuộc enum DOMAIN_MODEL §2 / `name` rỗng | `sku` trùng → 409 `CONFLICT` field `sku`; còn lại → 422, `errors[].field` đúng tên trường, thông điệp tiếng Việt | integration |
| AC-CAT-005 | An; `LCD1137` có `version=1` | `PATCH /products/{id} {version:1, name, brand, price, vat_rate, price_fixed, warranty_months, specs}` | 200, `version=2`; sửa lại với `version:1` → 409 `STALE_VERSION`; đổi `sku` trùng sản phẩm khác → 409 `CONFLICT` | integration |
| AC-CAT-006 | An; `HOPMUC3053` đang hoạt động | `POST /products/{id}/deactivate {version}` | 200 `is_active=false`; deactivate lần nữa → 409 `INVALID_TRANSITION`. `POST /products/{id}/activate {version}` khi đang ngừng → 200 `is_active=true`; activate khi đã hoạt động → 409 `INVALID_TRANSITION` | integration |
| AC-CAT-007 | — | mọi route trên | khai báo đúng 1 capability (`catalog.read` cho GET, `catalog.manage` cho lệnh ghi); nằm trong ma trận RBAC route thật | generated |
| AC-CAT-008 | An; `MAYBO3551` chưa có ảnh | `POST /products/{id}/image` multipart, file `photo.jpg` thật (magic bytes JPEG), 2MB | 200/201 `{image_attachment_id}`; `GET /products/{id}` sau đó có `image_attachment_id` này; `GET /api/v1/attachments/{image_attachment_id}` (bởi An **hoặc** Hoa **hoặc** Tuấn — `catalog.read`) → 200, header `Content-Type: image/jpeg`, đúng nội dung file | integration |
| AC-CAT-009 | An | upload: file đặt tên `.jpg` nhưng nội dung không phải ảnh (magic bytes sai) / file 11MB / `Content-Type` khai `image/gif` | lần lượt 422 `INVALID_FILE_TYPE` / 422 `FILE_TOO_LARGE` / 422 `UNSUPPORTED_MEDIA_TYPE`; sản phẩm không đổi `image_attachment_id` | integration |
| AC-CAT-010 | Khoa (TECHNICIAN, không `catalog.read`) | `GET /api/v1/attachments/{id-ảnh-sản-phẩm-hợp-lệ}` | 403 `FORBIDDEN`. ID không tồn tại (bất kỳ ai có `catalog.read`) → 404 | integration |
| AC-CAT-011 | `LCD1137` đã có ảnh A (`image_attachment_id = A`) | An `POST /products/{id}/image` với ảnh B hợp lệ | 200, `image_attachment_id` đổi sang B; `GET /attachments/{A}` (ảnh cũ) vẫn 200 — không xoá file cũ, chỉ không còn được sản phẩm tham chiếu | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/products | catalog.read | `q, category, brand, is_active, limit≤100, offset` | `{items, total, limit, offset}` | 422 |
| GET | /api/v1/products/{id} | catalog.read | — | `ProductDetail` | 404 |
| POST | /api/v1/products | catalog.manage | `ProductCreate` | 201 `ProductDetail` | 409, 422 |
| PATCH | /api/v1/products/{id} | catalog.manage | `{version, name?, brand?, price?, vat_rate?, price_fixed?, warranty_months?, specs?}` | `ProductDetail` | 404, 409, 422 |
| POST | /api/v1/products/{id}/deactivate | catalog.manage | `{version}` | `ProductDetail` | 404, 409 |
| POST | /api/v1/products/{id}/activate | catalog.manage | `{version}` | `ProductDetail` | 404, 409 |
| POST | /api/v1/products/{id}/image | catalog.manage | multipart file (`image/jpeg,png,webp,heic`, ≤10MB) | `{image_attachment_id}` | 404, 422 |
| GET | /api/v1/attachments/{id} | catalog.read | — | binary + `Content-Type` | 403, 404 |

`sku`, `category`, `unit` **không** đổi được qua PATCH sau khi tạo (tránh lệch snapshot lịch sử đơn hàng ở M3 — mã hàng cố định). PATCH chỉ sửa thông tin; trạng thái đổi qua lệnh có tên (CLAUDE.md quy tắc 4).

## 5. Dữ liệu / Migration
- Bảng `products` theo DOMAIN_MODEL §2: `sku varchar(40) unique`, `name varchar(255)`, `category` enum, `brand varchar(60)`, `unit` enum, `price bigint`, `vat_rate numeric(5,2) default 8`, `price_fixed bool`, `warranty_months smallint`, `specs text`, `image_attachment_id uuid null references attachments`, `is_active bool default true`, `version int default 1`, `created_at/updated_at timestamptz`.
- Bảng `attachments` theo DOMAIN_MODEL §11 (tạo mới, dùng chung về sau cho M6-01): `owner_type varchar` (chỉ ghi `'PRODUCT'` ở item này), `owner_id uuid`, `kind varchar` (chỉ ghi `'PRODUCT_IMAGE'`), `revision_no int default 1`, `storage_key text`, `original_filename text`, `mime_type text`, `size_bytes int`, `sha256 text`, `width/height int null`, `uploaded_by uuid`, `created_at`.
- File lưu `/data/uploads/{yyyy}/{mm}/{uuid}` (volume, ARCHITECTURE); không phục vụ tĩnh.
- Index: `products(is_active)`, `products(category)`; tìm không dấu như M1-04a (`unaccent` hoặc cột chuẩn hoá) trên `sku` + `name`.

## 7. Kịch bản UAT thủ công (API — giao diện ở M2-01b)
1. `make up`; đăng nhập Manager, mở `/smyoutask/api/docs` (dev) → `POST /products` tạo 1 sản phẩm.
2. `POST /products/{id}/image` với 1 ảnh JPEG thật → nhận `image_attachment_id`; mở `GET /api/v1/attachments/{id}` trên trình duyệt → thấy ảnh.
3. Thử ngừng kinh doanh rồi ngừng lần nữa → 409 `INVALID_TRANSITION`.

## 8. Giả định & câu hỏi
- **Q42 ✅ (2026-09-27)** Tách M2-01 thành M2-01a (API) và M2-01b (giao diện)? *Quyết định:* có — như M1-04.
- **Q43 ✅ (2026-09-27)** Ảnh sản phẩm cần bảng `attachments` chung (dự kiến M6-01, chưa làm) — xây ngay hay bỏ ảnh khỏi M2-01? *Quyết định:* xây tối thiểu bảng `attachments` ngay trong M2-01a, chỉ dùng `kind=PRODUCT_IMAGE`; M6-01 sau mở rộng `TASK_PHOTO`/`CUSTOMER_CONFIRMATION`, `revision_no` > 1, nén ảnh phía client trên nền bảng này.
- **Câu hỏi mới — Q44 (đề xuất: nhập tay)**: Mã hàng (`sku`) do Manager tự gõ hay hệ thống tự sinh? Khác nhân viên (Q32: tự sinh `NV`+số) — ví dụ thực tế trong DOMAIN_MODEL (`MAYBO3551`, `LCD1137`, `HOPMUC3053`) là mã có ý nghĩa (viết tắt loại hàng + số), giống mã từ hệ thống/nhà cung cấp cũ, không phải số tự sinh tuần tự. *Đề xuất:* Manager tự gõ, hệ thống chỉ kiểm trùng (409 `CONFLICT`) — cho phép nhập lại đúng mã cũ khi chuyển dữ liệu.
- Giả định kỹ thuật: `vat_rate` mặc định 8 khi không truyền (DOMAIN_MODEL §2, Q18); `warranty_months` chỉ cần ≥ 0 (không ép đúng {0,12,24,36} — đó là ví dụ giá trị thường gặp, không phải enum cứng); ảnh chỉ nhận 1 ảnh/sản phẩm tại một thời điểm (không phải gallery nhiều ảnh); `sha256` dùng để chống trùng lặp lưu trữ ở M6-01, chưa cần enforce unique ở item này.
