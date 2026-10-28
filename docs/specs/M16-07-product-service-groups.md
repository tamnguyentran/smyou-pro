# M16-07 — Danh mục: "Nhóm sản phẩm/dịch vụ"

- **Status:** Approved (2026-10-24, chủ dự án chốt trực tiếp trong phiên — xem mục 8)
- **Backlog:** M16-07 · **Milestone:** M16
- **Liên quan:** `docs/specs/M2-01a-catalog-products-api.md`/`M2-02-catalog-services.md` (quy ước CRUD danh mục tái dùng); mở đường cho M16-08 (đổi `orders.division` sang chọn từ danh sách này)

## 1. Mục tiêu
Là Manager, tôi muốn quản lý 1 danh sách "Nhóm sản phẩm/dịch vụ" trong Danh mục (thêm/sửa/ngừng hoạt động), để dùng làm danh sách chọn cho trường "Phòng phụ trách" trên đơn hàng (M16-08) thay vì enum cố định trong code.

## 2. Phạm vi
- Trong phạm vi:
  - Entity mới `product_service_groups`: **chỉ 1 danh sách độc lập** (`id`, `name`, `is_active`, `version`, `created_at`, `updated_at`) — **không** gắn vào Product/Service hiện có (không thêm field "Nhóm" khi tạo/sửa Sản phẩm/Dịch vụ — ngoài phạm vi, để làm sau nếu cần).
  - CRUD: tạo, sửa tên, ngừng hoạt động/mở lại hoạt động (command riêng, giống `products`/`services`, không `PATCH` trực tiếp `is_active`) — dùng chung capability `catalog.manage` (viết)/`catalog.read` (đọc), không tạo capability mới.
  - `name` duy nhất trong các nhóm **đang hoạt động** (case-insensitive, trim — cùng kiểu unique index với `products.name`).
  - Màn hình mới trong menu "Danh mục": "Nhóm sản phẩm/dịch vụ", cạnh "Sản phẩm"/"Dịch vụ".
  - **Seed dữ liệu mẫu**: migration tạo sẵn 3 nhóm `is_active=true`: "Thiết bị văn phòng", "Thiết bị an ninh", "Kỹ thuật chung" (đúng 3 giá trị nhãn cũ của `orders.division`, dùng để map dữ liệu cũ ở M16-08).
- Ngoài phạm vi: gắn nhóm vào Product/Service; xoá cứng (chỉ ngừng hoạt động); import CSV.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-090 | An (MANAGER) | `POST /api/v1/product-service-groups` `{"name": "Thiết bị mạng"}` | 201, trả về nhóm mới `is_active=true`, `version=1` | integration |
| AC-CAT-091 | Đã có nhóm "Thiết bị mạng" đang hoạt động | `POST` nhóm tên "thiết bị mạng " (khác hoa/thường + khoảng trắng) | 409 CONFLICT | integration |
| AC-CAT-092 | Nhóm "Thiết bị mạng" đã ngừng hoạt động | `POST` nhóm tên "Thiết bị mạng" | 201 (tên trùng nhóm đã ngừng hoạt động vẫn tạo được) | integration |
| AC-CAT-093 | An sửa tên 1 nhóm | `PATCH /api/v1/product-service-groups/{id}` kèm `version` đúng | 200, tên đổi, `version += 1` | integration |
| AC-CAT-094 | Nhóm đang hoạt động | `POST .../deactivate` kèm `version` đúng | 200, `is_active=false` | integration |
| AC-CAT-095 | Hoa (SALE, chỉ có `catalog.read`) | `POST /api/v1/product-service-groups` | 403 | integration |
| AC-CAT-096 | Database vừa migrate xong (chưa seed thêm gì) | `GET /api/v1/product-service-groups` | Có đúng 3 nhóm: "Thiết bị văn phòng", "Thiết bị an ninh", "Kỹ thuật chung", đều `is_active=true` | integration |
| AC-CAT-097 | An mở "Danh mục" → "Nhóm sản phẩm/dịch vụ", desktop 1440px | render | Thấy bảng danh sách nhóm + nút "Thêm nhóm"; Hoa (SALE) chỉ xem, không thấy nút thêm/sửa | component |

## 4. API
| Method | Path | Capability | Việc |
|---|---|---|---|
| GET | /api/v1/product-service-groups | catalog.read | Danh sách (tìm `q`, lọc `is_active`, phân trang) |
| GET | /api/v1/product-service-groups/{id} | catalog.read | Chi tiết |
| POST | /api/v1/product-service-groups | catalog.manage | Tạo |
| PATCH | /api/v1/product-service-groups/{id} | catalog.manage | Sửa `name` (kèm `version`) |
| POST | /api/v1/product-service-groups/{id}/deactivate | catalog.manage | Ngừng hoạt động (kèm `version`) |
| POST | /api/v1/product-service-groups/{id}/activate | catalog.manage | Mở lại hoạt động (kèm `version`) |

## 5. Dữ liệu / Migration
- Bảng mới `product_service_groups` (`id uuid pk`, `name varchar(100)`, `is_active boolean default true`, `version int default 1`, `created_at`, `updated_at`), unique index `lower(btrim(name))` khi `is_active`.
- Seed 3 dòng với UUID cố định (để M16-08 map dữ liệu cũ theo đúng id này): "Thiết bị văn phòng", "Thiết bị an ninh", "Kỹ thuật chung".

## 6. UI
- Menu "Danh mục" thêm item "Nhóm sản phẩm/dịch vụ" (`spec/permissions.yaml`, capability `catalog.manage` cho menu entry — theo đúng cách Products/Services khai báo, `catalog.read` áp ở route).
- Màn hình: bảng (desktop)/thẻ (mobile) tên + trạng thái, Sheet thêm/sửa chỉ có ô "Tên nhóm", nút Ngừng/Mở hoạt động — rút gọn từ `ProductFormSheet` (không giá/ảnh/danh mục con).

## 7. Kịch bản UAT thủ công
1. Mở "Danh mục" → "Nhóm sản phẩm/dịch vụ" → thấy 3 nhóm mẫu đã seed.
2. Thêm 1 nhóm mới, sửa tên, ngừng hoạt động → mở lại.
3. Đăng nhập Sale → chỉ xem được, không thấy nút thêm/sửa.

## 8. Giả định & câu hỏi
Chủ dự án đã chốt trực tiếp trong phiên (2026-10-24):
- Không gắn nhóm vào Product/Service ở item này — chỉ là danh sách độc lập phục vụ M16-08.
- Dùng chung `catalog.manage`/`catalog.read`, không tạo capability riêng.
- 3 nhóm seed phải đặt tên đúng y 3 nhãn cũ của `orders.division` để M16-08 map dữ liệu đơn cũ không mất thông tin.
