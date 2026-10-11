# M10-01 — Tên sản phẩm/dịch vụ không trùng

- **Status:** Approved
- **Backlog:** M10-01 · **Milestone:** M10
- **Liên quan:** `spec/permissions.yaml#catalog.manage` (MANAGER all); DOMAIN_MODEL §2 (Product), §3 (Service); `docs/specs/M2-01a-products-api.md` (mẫu kiểm trùng `sku` → 409 `CONFLICT`, `backend/app/modules/catalog/service.py` `SKU_TAKEN`/`CODE_TAKEN`); `M2-02-services.md` (mẫu kiểm trùng `code`); `docs/product/OPEN_QUESTIONS.md` Q80 (phạm vi so khớp đã chốt giả định).

## 1. Mục tiêu
Là Quản lý chung, khi tôi tạo/sửa/mở lại kinh doanh sản phẩm hoặc dịch vụ, hệ thống chặn tên trùng với một sản phẩm (hoặc dịch vụ) khác **đang kinh doanh**, để tránh nhầm lẫn khi Sale/Quản lý kỹ thuật tìm chọn trong đơn.

## 2. Phạm vi
- **Trong phạm vi:**
  - Thêm kiểm tra trùng `name` (không phân biệt hoa/thường, đã trim khoảng trắng đầu/cuối) khi: tạo sản phẩm mới, tạo dịch vụ mới, sửa tên sản phẩm/dịch vụ đã có (`PATCH`), mở lại kinh doanh (`activate`) một sản phẩm/dịch vụ đang ngừng mà tên đó đã bị một bản ghi **đang hoạt động khác** chiếm trong lúc nó ngừng.
  - Chỉ so khớp trong **cùng một bảng** (`products` so với `products`, `services` so với `services`) — 1 sản phẩm và 1 dịch vụ được phép trùng tên (Q80).
  - Chỉ tính các bản ghi `is_active = true` — một bản ghi đã ngừng kinh doanh không chặn tên mới, và chính nó so khi sửa tên loại trừ bản thân nó.
  - Index unique ở DB (không chỉ validate ở tầng service) để tránh race condition giữa 2 request đồng thời.
- **Ngoài phạm vi (không làm ở item này):**
  - Gộp/dedupe các bản ghi trùng tên đã tồn tại sẵn trong dữ liệu thật trước khi migration chạy — xem rủi ro ở §5, cần Quản lý xử lý tay nếu phát sinh.
  - Đổi quy tắc trùng cho `sku`/`code` (đã có từ M2-01a/M2-02, không đổi).
  - Chuẩn hoá bỏ dấu tiếng Việt khi so khớp (ví dụ "Máy in" vs "May in") — chỉ so hoa/thường + trim, không bỏ dấu (khác với tìm kiếm `q` ở M2-01a/M2-02 có dùng `unaccent`).

## 3. Acceptance Criteria
Dữ liệu mẫu (tiếp theo M2-01a/M2-02): **An** NV001 [MANAGER]. Sản phẩm: `LCD1137` "Màn hình Dell 22 inch" (active). Dịch vụ: `DV-SUAPC` "Sửa chữa PC" (active).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-062 | `LCD1137` "Màn hình Dell 22 inch" đang active | An `POST /products {sku:"LCD1138", name:"  màn hình dell 22 inch  ", category:"MONITOR", brand:"Dell", unit:"CAI", price:3000000}` | 409 `CONFLICT` field=`name`, message "Tên sản phẩm đã được dùng cho sản phẩm khác đang kinh doanh."; không tạo sản phẩm mới | integration |
| AC-CAT-063 | `LCD1137` đã bị ngừng kinh doanh (`is_active=false`) | An `POST /products {sku:"LCD1138", name:"Màn hình Dell 22 inch", ...}` | 201 — tên trùng với bản ghi **đã ngừng** không bị chặn | integration |
| AC-CAT-064 | `LCD1137` active; sản phẩm khác `MAYBO3551` active, `version=1` | An `PATCH /products/{MAYBO3551.id} {version:1, name:"Màn Hình Dell 22 Inch"}` | 409 `CONFLICT` field=`name`; `version` sản phẩm `MAYBO3551` không đổi | integration |
| AC-CAT-065 | `LCD1137` active, `version=1` | An `PATCH /products/{LCD1137.id} {version:1, name:"MÀN HÌNH DELL 22 INCH"}` (chỉ đổi hoa/thường tên của chính nó) | 200; `version=2` — không tự xung đột với chính bản ghi đang sửa | integration |
| AC-CAT-066 | `LCD1137` bị ngừng kinh doanh; sau đó An tạo sản phẩm khác `LCD1139` tên "Màn hình Dell 22 inch" (active, như AC-CAT-063) | An `POST /products/{LCD1137.id}/activate {version}` | 409 `CONFLICT` field=`name`; `LCD1137` vẫn `is_active=false` | integration |
| AC-CAT-067 | `DV-SUAPC` "Sửa chữa PC" active | An `POST /services {code:"DV-SUAPC2", name:"sửa chữa pc", category:"REPAIR", unit:"LAN", price:200000}` | 409 `CONFLICT` field=`name`, message "Tên dịch vụ đã được dùng cho dịch vụ khác đang kinh doanh."; không tạo dịch vụ mới | integration |
| AC-CAT-068 | `DV-SUAPC` active; dịch vụ khác `DV-BOMMUC` active, `version=1` | An `PATCH /services/{DV-BOMMUC.id} {version:1, name:"Sửa Chữa PC"}` | 409 `CONFLICT` field=`name`; `version` không đổi | integration |
| AC-CAT-069 | `DV-SUAPC` bị ngừng; dịch vụ khác tạo sau đó trùng tên (như AC-CAT-063/066, áp cho service) | An `POST /services/{DV-SUAPC.id}/activate {version}` | 409 `CONFLICT` field=`name`; vẫn `is_active=false` | integration |
| AC-CAT-070 | `LCD1137` "Màn hình Dell 22 inch" (sản phẩm, active) | An `POST /services {code:"DV-MH01", name:"Màn hình Dell 22 inch", category:"OTHER", unit:"LAN", price:0}` | 201 — trùng tên giữa 1 sản phẩm và 1 dịch vụ **được phép** (2 bảng riêng, Q80) | integration |
| AC-CAT-071 | Form "Thêm sản phẩm", đã điền `sku` hợp lệ, `name` trùng tên 1 sản phẩm active khác | bấm "Lưu" | server trả 409 field=`name` → ô "Tên sản phẩm" hiện lỗi "Tên sản phẩm đã được dùng cho sản phẩm khác đang kinh doanh." ngay dưới ô nhập (theo cơ chế map lỗi theo field đã có ở AC-CAT-013) | component |
| AC-CAT-072 | Form "Thêm dịch vụ", `name` trùng tên 1 dịch vụ active khác | bấm "Lưu" | ô "Tên dịch vụ" hiện lỗi "Tên dịch vụ đã được dùng cho dịch vụ khác đang kinh doanh." (theo cơ chế map lỗi đã có ở AC-CAT-028) | component |

## 4. API
Không có endpoint mới. Thêm điều kiện 409 `CONFLICT` field=`name` vào các route đã có:

| Method | Path | Capability | Thêm lỗi |
|---|---|---|---|
| POST | /api/v1/products | catalog.manage | 409 `CONFLICT` (name, ngoài sku đã có) |
| PATCH | /api/v1/products/{id} | catalog.manage | 409 `CONFLICT` (name) khi đổi `name` |
| POST | /api/v1/products/{id}/activate | catalog.manage | 409 `CONFLICT` (name) — kiểm trước khi đổi `is_active` |
| POST | /api/v1/services | catalog.manage | 409 `CONFLICT` (name, ngoài code đã có) |
| PATCH | /api/v1/services/{id} | catalog.manage | 409 `CONFLICT` (name) khi đổi `name` |
| POST | /api/v1/services/{id}/activate | catalog.manage | 409 `CONFLICT` (name) |

Thứ tự kiểm giữ đúng mẫu đã có (`STALE_VERSION` trước, rồi guard trạng thái/`INVALID_TRANSITION`, rồi `CONFLICT`): với `activate`, kiểm `CONFLICT` tên **sau khi** xác nhận `version` khớp và trạng thái hiện tại cho phép chuyển (`is_active=false` → `true`), trước khi ghi `is_active=true`.

## 5. Dữ liệu / Migration
- Thêm 2 unique partial index:
  - `products`: `CREATE UNIQUE INDEX products_name_active_uq ON products (lower(btrim(name))) WHERE is_active;`
  - `services`: `CREATE UNIQUE INDEX services_name_active_uq ON services (lower(btrim(name))) WHERE is_active;`
- **Rủi ro migration:** hệ thống đã go-live (M9), có dữ liệu thật. Nếu đang có ≥2 sản phẩm (hoặc ≥2 dịch vụ) active trùng tên (khác hoa/thường/khoảng trắng), `CREATE UNIQUE INDEX` sẽ báo lỗi và migration thất bại. Xử lý: migration script tự `SELECT lower(btrim(name)), count(*) ... GROUP BY 1 HAVING count(*)>1` trước khi tạo index; nếu có kết quả, in danh sách tên trùng + dừng migration với thông báo rõ ("Có N tên trùng, cần đổi tên tay trước khi chạy lại") — **không** tự động đổi tên bản ghi nào (quy tắc nghiệp vụ, không tự bịa).

## 6. UI
- Không có trang/màn hình mới. Lỗi 409 field=`name` dùng đúng cơ chế hiện có (map lỗi theo field dưới ô nhập, như `sku`/`code`) ở `ProductForm`/`ServiceForm` — chỉ cần thêm copy message (đã cho ở AC-CAT-071/072) vào chỗ tương ứng `SKU_TAKEN`/`CODE_TAKEN` phía backend.
- `ConfirmDialog` "Mở lại kinh doanh" khi gặp 409 field=`name`: thay thông báo thành công bằng lỗi "Tên sản phẩm/dịch vụ đã được dùng cho bản ghi khác đang kinh doanh. Vui lòng đổi tên trước khi mở lại." (mẫu lỗi chung, không cần sheet riêng).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → "Danh mục" → "Sản phẩm" → thêm sản phẩm tên trùng (khác hoa/thường) với 1 sản phẩm đang kinh doanh → thấy lỗi dưới ô "Tên sản phẩm".
2. Sửa tên 1 sản phẩm khác thành trùng tên sản phẩm còn lại → thấy lỗi tương tự.
3. Ngừng kinh doanh sản phẩm A, tạo sản phẩm B cùng tên → thành công. Thử "Mở lại kinh doanh" A → thấy lỗi trùng tên (vì B đang chiếm tên đó).
4. Lặp lại bước 1–2 ở "Dịch vụ".
5. Tạo 1 dịch vụ cùng tên với 1 sản phẩm đang có → thành công (được phép trùng chéo).

## 8. Giả định & câu hỏi
- **Q80 ✅ (áp dụng, đã có giả định mặc định trong `OPEN_QUESTIONS.md`):** so khớp không phân biệt hoa/thường, đã trim khoảng trắng; kiểm trùng riêng theo từng bảng (`products`, `services` độc lập); chỉ tính bản ghi `is_active=true`. Spec này dùng đúng giả định này — chủ dự án xem lại cột "Quyết định" ở Q80 nếu muốn đổi trước khi duyệt spec.
- Giả định kỹ thuật: không bỏ dấu tiếng Việt khi so khớp (chỉ hoa/thường + trim) — nếu chủ dự án muốn chặn cả biến thể bỏ dấu (vd "Máy in" vs "May in"), cần đổi sang so khớp trên cột `unaccent(lower(name))`, dễ sửa nếu cần.
- Giả định: không chặn khoảng trắng **giữa** các từ bị gõ dư (vd "Màn hình  Dell" 2 khoảng trắng vs "Màn hình Dell" 1 khoảng trắng) — chỉ `btrim` 2 đầu, không chuẩn hoá khoảng trắng giữa. Nếu chủ dự án muốn chặn luôn trường hợp này, cần đổi so khớp sang `regexp_replace(name, '\s+', ' ', 'g')`.
- Không có câu hỏi mới ngoài Q80 đã ghi.
