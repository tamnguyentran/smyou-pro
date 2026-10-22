# M15-07 — Giá vốn bắt buộc trên Sản phẩm/Dịch vụ

- **Status:** Approved
- **Backlog:** M15-07 · **Milestone:** M15
- **Liên quan:** `docs/product/DOMAIN_MODEL.md` §2–3 (Product/Service); `docs/specs/M2-01a-products-api.md`, `M2-02-services.md` (API catalog hiện có); `docs/specs/M10-02-disable-save-submit-missing-info.md` (mẫu "vô hiệu hoá nút khi thiếu thông tin" — tái dùng cho item cũ thiếu giá vốn)

## 1. Mục tiêu
Là Manager, tôi muốn giá vốn là thông tin bắt buộc của mọi sản phẩm/dịch vụ (cùng với giá bán) để công ty tính được lợi nhuận từng đơn, từng nhân viên (phục vụ M15-09/10).

## 2. Phạm vi
- Trong phạm vi:
  - `products`, `services` thêm cột `cost_price bigint null` ("giá vốn, chưa VAT, VND") — nullable ở migration để không vỡ dữ liệu cũ, nhưng **bắt buộc** ở tầng API khi **tạo mới**.
  - `POST /products`, `POST /services`: `cost_price` bắt buộc (422 nếu thiếu/âm). `price` (giá bán) vẫn bắt buộc như hiện tại (chưa có giá vốn trước item này, DOMAIN_MODEL ghi "hiện chưa có giá vốn" — item này bổ sung).
  - `PATCH /products/{id}`, `PATCH /services/{id}`: nếu đang sửa và `cost_price` hiện tại là `null` (item cũ), bắt buộc phải điền khi lưu (không cho lưu các field khác mà bỏ qua `cost_price` mãi); nếu đã có `cost_price`, sửa field khác không bắt buộc gửi lại `cost_price`.
  - UI: ô "Giá vốn" cạnh ô "Giá bán" trong form Sản phẩm/Dịch vụ, bắt buộc (dấu `*`), validate ≥ 0.
  - Item cũ chưa có `cost_price` (`null`): theo mẫu M10-02 — hiện badge "Thiếu giá vốn" trên danh sách catalog; form sửa item đó tự mở sẵn, vô hiệu hoá nút "Lưu" cho tới khi điền `cost_price`.
- Ngoài phạm vi: lịch sử thay đổi giá (M15-08); `cost_price_snapshot` trên `order_lines` (M15-08).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-073 | An (MANAGER) | `POST /products {sku, name, category, unit, price:5000000, vat_rate:8, price_fixed:false, warranty_months:12}` (thiếu `cost_price`) | 422 field `cost_price` bắt buộc | integration |
| AC-CAT-074 | An | `POST /products {..., cost_price:4200000}` | 201; `ProductDetail.cost_price = 4200000` | integration |
| AC-CAT-075 | An | `POST /products {..., cost_price:-100}` | 422 field `cost_price` phải ≥ 0 | integration |
| AC-CAT-076 | Sản phẩm `LCD1137` seed trước item này, `cost_price=null` | `PATCH /products/{id} {version, name:"..."}` (không gửi `cost_price`) | 422 field `cost_price` bắt buộc — không cho lưu khi còn thiếu | integration |
| AC-CAT-077 | Như trên | `PATCH /products/{id} {version, name:"...", cost_price:3000000}` | 200; `cost_price` được điền, các lần sửa sau không cần gửi lại | integration |
| AC-CAT-078 | Danh sách Sản phẩm có 2 item: 1 đã có `cost_price`, 1 chưa (`null`) | render trang Sản phẩm | Item chưa có giá vốn hiện badge "Thiếu giá vốn" (tông `urgent`) | component |
| AC-CAT-079 | Form sửa sản phẩm, `cost_price` còn trống | xem nút "Lưu" | disabled; helper text "Cần nhập giá vốn." (mẫu theo M10-02) | component |
| AC-CAT-080 | `POST /services {..., cost_price:0}` dịch vụ "tính thực tế khi thi công" (`price=0`) | gọi | 201 — `cost_price = 0` hợp lệ (≥ 0, không bắt phải > 0) | integration |
| AC-CAT-088 | An (MANAGER) | `POST /services {code, name, category, unit, price:150000, vat_rate:8, price_fixed:true}` (thiếu `cost_price`) | 422 field `cost_price` bắt buộc (khớp AC-CAT-073 áp cho Service — §4 cũng liệt kê `POST /services`) | integration |
| AC-CAT-089 | Dịch vụ seed trước item này, `cost_price=null` | `PATCH /services/{id} {version, name:"..."}` (không gửi `cost_price`) | 422 field `cost_price` bắt buộc; gửi lại kèm `cost_price:50000` → 200, điền được (khớp AC-CAT-076/077 áp cho Service) | integration |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/products | catalog.manage | Thêm `cost_price` bắt buộc |
| PATCH | /api/v1/products/{id} | catalog.manage | Thêm `cost_price?`; bắt buộc nếu hiện đang `null` |
| POST | /api/v1/services | catalog.manage | Thêm `cost_price` bắt buộc |
| PATCH | /api/v1/services/{id} | catalog.manage | Như Product |

## 5. Dữ liệu / Migration
`make migration name=catalog_cost_price` — thêm `cost_price bigint null` vào `products` và `services`. Không backfill (giá trị cũ để `null`, buộc Manager điền dần qua UI badge "Thiếu giá vốn").

## 6. UI
- Form Sản phẩm/Dịch vụ: thêm ô "Giá vốn (chưa VAT)" ngay dưới ô "Giá bán", cùng định dạng nhập tiền VND.
- Danh sách catalog: badge "Thiếu giá vốn" theo mẫu màu/đặt-vị-trí như các badge cảnh báo khác đã có trong `UI_GUIDELINES.md`.

## 7. Kịch bản UAT thủ công
1. Tạo sản phẩm mới không nhập giá vốn → không lưu được, thấy lỗi rõ.
2. Tạo sản phẩm mới có giá vốn → lưu thành công.
3. Mở 1 sản phẩm demo cũ (chưa có giá vốn) → thấy badge, điền giá vốn → lưu được.

## 8. Giả định & câu hỏi
- Bổ sung lúc `/implement` (không phải quyết định nghiệp vụ mới): AC-CAT-088/089 lấp khoảng trống — bảng AC gốc chỉ có 1 case cho Service (AC-CAT-080) dù §2/§4 đã liệt kê `POST/PATCH /services` đổi giống Product; 2 AC mới áp lại đúng quy tắc AC-CAT-073/076 cho Service. Import CSV (M2-03a) cũng thêm cột `cost_price` bắt buộc vào `PRODUCT_COLUMNS`/`SERVICE_COLUMNS` để không vỡ khi `ProductCreate`/`ServiceCreate` bắt buộc field này — không có AC riêng, chỉ cập nhật fixture của AC-CAT-033..045 hiện có.
- Giả định: `cost_price` **không** hiển thị kèm VAT riêng (không có `cost_vat_rate`) — giá vốn là giá nhập/giá thành, không tách VAT như giá bán, vì mục đích chỉ để tính lợi nhuận nội bộ. → ghi vào `OPEN_QUESTIONS.md`: giá vốn có cần tách VAT đầu vào (khi nhập hàng có hoá đơn VAT) để tính lợi nhuận chính xác hơn, hay dùng 1 số giá vốn gộp là đủ? Mặc định: 1 số gộp, đơn giản.
