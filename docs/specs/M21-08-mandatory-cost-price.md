# M21-08 — Bắt buộc có giá vốn

- **Status:** Approved
- **Backlog:** M21-08 · **Milestone:** M21
- **Liên quan:** DOMAIN_MODEL §5 (products/services), §6 (order_lines); spec M15-06 (bỏ dòng tự nhập), M15-07 (giá vốn danh mục), M19-01a (dòng hàng hiện trường), M23a (lưới an toàn 70%); Q161, Q165 (đã chốt 2026-11-04), Q175 (mở)

## 1. Mục tiêu
Là chủ doanh nghiệp, tôi muốn mọi dòng hàng bán ra đều có giá vốn lấy từ danh mục tại thời điểm bán, để báo cáo lợi nhuận, KPI và biểu đồ kinh doanh luôn tính đúng, không còn ô "—".

## 2. Phạm vi
- **Hiện trạng (đã có, chỉ giữ bằng test hồi quy):** dòng hàng mới chỉ được chọn từ danh mục, dòng tự nhập `CUSTOM` bị chặn (M15-06), kể cả KTV thêm tại hiện trường (M19-01a). Tạo mới SP/DV bắt buộc giá vốn, sửa SP/DV đang thiếu giá vốn thì bắt buộc điền (M15-07). Import CSV bắt buộc cột `cost_price`. Dòng hàng chụp lại `cost_price_snapshot` từ danh mục lúc thêm.
- **Trong phạm vi (mới):**
  1. **Chặn bán SP/DV không có giá vốn:** mọi đường thêm dòng hàng (đơn nháp, sửa sau gửi, KTV tại hiện trường; tất cả đi qua `_build_line`) trả 422 `ITEM_COST_MISSING` nếu SP/DV trong danh mục có `cost_price = null`.
  2. **Vá lỗ hổng xoá giá vốn:** `PATCH /products/{id}` / `PATCH /services/{id}` gửi `cost_price: null` tường minh hiện **xoá được** giá vốn của SP/DV đang có giá vốn → phải trả 422.
  3. **Migration dữ liệu (một lần):** SP/DV thiếu giá vốn được gán giá vốn = 70% giá bán. Dòng hàng của đơn cũ thiếu `cost_price_snapshot` được gán theo cùng quy tắc (dòng quà tặng: xem Q175). Làm tròn số nguyên VND, cùng cách làm tròn với M23 (`ROUND_HALF_UP`) để số liệu biểu đồ không đổi sau migration.
  4. **UI:** khi API trả `ITEM_COST_MISSING`, sheet thêm dòng hiện lỗi tiếng Việt ngay dưới ô chọn SP/DV.
- **Ngoài phạm vi:** quy tắc lúc truy vấn của M23 "thiếu giá vốn → 70% giá bán" **giữ nguyên** (Q161 mục 4). Không đổi phân quyền: không thêm endpoint, không thêm capability. Không đổi giao diện danh mục, vì ô giá vốn đã bắt buộc từ M15-07. Sửa dòng hàng đã có (`_apply_line_changes`) không bị chặn, vì dòng đó đã có snapshot sau migration.

## 3. Acceptance Criteria

Dữ liệu mẫu: Sale **Hoa**; Manager **An**; KTV **Minh** (được giao task của đơn). Sản phẩm `LBP2900` "Máy in Canon LBP2900" có giá bán 4.200.000, giá vốn 2.940.000. Sản phẩm `CAM-H265` "Camera Hikvision 2MP" có giá bán 1.250.000, giá vốn `null` (dữ liệu cũ, dựng thẳng trong DB). Dịch vụ `DV-LD01` "Lắp đặt camera" có giá bán 155.555, giá vốn `null`.

### A. Chặn bán SP/DV không có giá vốn
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-252 | Đơn DRAFT DH2611-0001 của Hoa | Hoa `POST /orders/{id}/lines {item_type:"PRODUCT", product_id:LBP2900, quantity:1, unit_price:4200000, vat_rate:8}` | 201; dòng có `cost_price_snapshot = 2940000` (lấy từ danh mục) | integration |
| AC-ORD-253 | Như trên | Hoa thêm dòng `PRODUCT` `CAM-H265` (giá vốn `null`) | 422 `ITEM_COST_MISSING`, `errors[0].field = "product_id"`, message "Sản phẩm/dịch vụ này chưa có giá vốn trong danh mục nên không thể bán. Vui lòng liên hệ Quản lý cập nhật giá vốn."; đơn không có dòng mới, `version` đơn không đổi, không ghi audit | integration |
| AC-ORD-254 | Như trên | Hoa thêm dòng `SERVICE` `DV-LD01` (giá vốn `null`) | 422 `ITEM_COST_MISSING`, `field = "service_id"`, cùng message | integration |
| AC-ORD-255 | Đơn DH2611-0002 đã gửi (sau DRAFT) | An thêm dòng `CAM-H265` qua đường sửa sau gửi (`.../lines-after-submit`) | 422 `ITEM_COST_MISSING`; không có dòng mới, không có audit "thêm dòng" | integration |
| AC-ORD-256 | Minh đang thực hiện task của DH2611-0002 | Minh thêm dòng hiện trường (M19-01a) với `DV-LD01` | 422 `ITEM_COST_MISSING`; không có dòng mới | integration |
| AC-ORD-257 | Hồi quy M15-06 | Hoa (đơn nháp) và Minh (hiện trường) gửi dòng `item_type:"CUSTOM"` | 422 `item_type` "Chỉ được chọn Sản phẩm hoặc Dịch vụ." (không đổi) | integration |
| AC-ORD-258 | Dòng LBP2900 của AC-ORD-252 đã có `cost_price_snapshot = 2940000` | An sửa giá vốn LBP2900 trong danh mục thành 3.000.000 | Dòng cũ vẫn `cost_price_snapshot = 2940000`; dòng LBP2900 thêm sau đó có 3.000.000 | integration |

### B. Không cho xoá giá vốn trong danh mục
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-108 | LBP2900 có giá vốn 2.940.000 | An `PATCH /products/{id} {version, cost_price:null}` | 422 field `cost_price` bắt buộc; giá vốn vẫn 2.940.000, `version` không đổi, không ghi lịch sử giá | integration |
| AC-CAT-109 | Dịch vụ có giá vốn 50.000 | An `PATCH /services/{id} {version, cost_price:null}` | 422 field `cost_price` bắt buộc; dữ liệu không đổi | integration |

### C. Migration điền giá vốn còn trống
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-110 | DB có `CAM-H265` (giá bán 1.250.000, giá vốn `null`), `DV-LD01` (155.555, `null`), LBP2900 (đã có 2.940.000) | Chạy `alembic upgrade head` | `CAM-H265.cost_price = 875000`; `DV-LD01.cost_price = 108889` (108.888,5 làm tròn lên); LBP2900 giữ 2.940.000; không còn SP/DV nào có `cost_price` null; `version` và giá bán không đổi | integration (migration) |
| AC-ORD-259 | Dòng hàng cũ không phải quà, `unit_price = 1250000`, `cost_price_snapshot = null`; một dòng khác đã có `cost_price_snapshot = 2940000` | Chạy migration | Dòng thứ nhất thành `cost_price_snapshot = 875000`; dòng thứ hai giữ 2.940.000; `unit_price`, `line_total`, `vat_rate` và `version` đơn không đổi | integration (migration) |
| AC-ORD-260 | Dòng tự nhập `CUSTOM` cũ (`unit_price = 300000`, giá vốn `null`) | Chạy migration | `cost_price_snapshot = 210000` | integration (migration) |
| AC-ORD-261 | Dòng **quà tặng** cũ (`is_gift`, `unit_price = 0`, `catalog_price_snapshot = 1250000`, giá vốn `null`); dòng quà `CUSTOM` cũ không có giá danh mục | Chạy migration | *(theo giả định Q175)* dòng thứ nhất `cost_price_snapshot = 875000`, dòng thứ hai `0` | integration (migration) |
| AC-ORD-262 | Sau migration, đơn hoàn tất trong kỳ chỉ có dòng thuộc AC-ORD-259 | Manager xem báo cáo Doanh thu (M16-05) và Biểu đồ kinh doanh (M23a) | Cột lợi nhuận hiện số (1.250.000 − 875.000 = 375.000 với `quantity = 1`), không còn "—"; biểu đồ lợi nhuận M23 vẫn 375.000 như trước migration | integration |

### D. UI
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-263 | Hoa mở sheet "Thêm dòng" của đơn nháp, ở 390px và 1440px | Chọn `CAM-H265`, bấm "Thêm"; API trả 422 `ITEM_COST_MISSING` | Sheet vẫn mở; message ở AC-ORD-253 hiện ngay dưới ô chọn SP/DV (màu lỗi, có `role="alert"`); dữ liệu đã nhập giữ nguyên | component |
| AC-ORD-264 | Minh mở sheet thêm dòng hiện trường (M19-01b) | Như trên với `DV-LD01` | Cùng hành vi như AC-ORD-263 | component |

## 4. API
Không thêm endpoint. Các đường thêm dòng hàng hiện có trả thêm một mã lỗi:

| Method | Path | Capability (không đổi) | Lỗi mới |
|---|---|---|---|
| POST | /api/v1/orders/{id}/lines | như hiện tại | 422 `ITEM_COST_MISSING` (`field`: `product_id` hoặc `service_id`) |
| POST | /api/v1/orders/{id}/lines-after-submit | như hiện tại | 422 `ITEM_COST_MISSING` |
| POST | đường thêm dòng hiện trường của M19-01a | như hiện tại | 422 `ITEM_COST_MISSING` |
| PATCH | /api/v1/products/{id}, /api/v1/services/{id} | như hiện tại | 422 field `cost_price` khi gửi `null` (trước đây lưu được) |

Thứ tự kiểm tra trong `_snapshot_item`: không tìm thấy → 422 field. Ngừng kinh doanh → `ITEM_INACTIVE`. Thiếu giá vốn → `ITEM_COST_MISSING`. `make contract` sinh lại kiểu lỗi nếu enum mã lỗi có trong OpenAPI.

## 5. Dữ liệu / Migration
- Migration **dữ liệu** mới, không đổi schema. Cột `cost_price` vẫn nullable để không phá test/seed cũ.
  - `UPDATE products SET cost_price = ROUND(price * 0.7) WHERE cost_price IS NULL;` Làm tương tự với `services`. `ROUND` của Postgres trên `numeric` là làm tròn nửa lên, khớp `ROUND_HALF_UP` của M23.
  - `UPDATE order_lines SET cost_price_snapshot = ROUND(unit_price * 0.7) WHERE cost_price_snapshot IS NULL AND NOT is_gift;`
  - Dòng quà tặng (Q175, theo giả định): `cost_price_snapshot = COALESCE(ROUND(catalog_price_snapshot * 0.7), 0)`.
  - `downgrade()` không làm gì, vì không phân biệt được giá vốn do migration ghi với giá vốn thật.
- Không ghi `catalog_price_history` và không ghi `audit_events` cho bản cập nhật này. Đây là sửa dữ liệu một lần, không phải người dùng thao tác.
- Seed e2e và fixture test đang tạo SP/DV không có giá vốn phải bổ sung `cost_price`. Đây chỉ là sửa fixture, không đổi assertion.
- Thực hiện quyết định Q161 mục 3 và Q165 (ghi snapshot cho dòng cũ). Cần nới quy tắc 7 trong CLAUDE.md ("đơn cũ không đổi") **một lần** cho riêng cột `cost_price_snapshot` đang null; ghi một dòng ở `DECISIONS.md`.

## 6. UI
- Sheet "Thêm dòng" của đơn nháp và sửa sau gửi, cùng sheet dòng hiện trường (M19-01b): map lỗi `ITEM_COST_MISSING` vào ô chọn SP/DV. Theo AC-ORD-263, message hiện ngay dưới ô đó, không chỉ là toast. Vùng chạm và bố cục giữ nguyên.
- Copy: "Sản phẩm/dịch vụ này chưa có giá vốn trong danh mục nên không thể bán. Vui lòng liên hệ Quản lý cập nhật giá vốn."
- Không cần ảnh chụp mới cho danh mục.

## 7. Kịch bản UAT thủ công
1. Sau khi deploy, vào **Danh mục**, lọc vài SP/DV trước đây trống giá vốn. Giá vốn hiện bằng khoảng 70% giá bán, là số nguyên.
2. Vào **Báo cáo Doanh thu**, chọn kỳ cũ. Cột lợi nhuận không còn "—".
3. Sửa một SP, xoá trống ô giá vốn rồi lưu. Hệ thống báo bắt buộc.
4. (Trên dev) Đặt giá vốn của một SP về trống bằng SQL, rồi thêm SP đó vào đơn nháp. Lỗi tiếng Việt hiện dưới ô chọn.

## 8. Giả định & câu hỏi
- **Đã chốt (Q161, 2026-11-04):** giá vốn luôn lấy từ danh mục; không bán dòng tự nhập; SP/DV thiếu giá vốn thì báo lỗi, không cho bán. Migration điền 70% giá bán cho SP/DV cũ và dòng đơn cũ. Giữ lưới an toàn 70% của M23.
- **Giả định — làm tròn:** "làm tròn, không lấy phần thập phân" được hiểu là làm tròn nửa lên tới số nguyên VND (108.888,5 → 108.889). Cách này giống M23, nên biểu đồ không nhảy số sau migration. Nếu anh/chị muốn **cắt bỏ** phần lẻ (→ 108.888), báo tôi đổi.
- **Giả định — "giá bán" của dòng đơn cũ** là `unit_price` (giá thực bán, chưa VAT), như M23 và Q165.
- **Câu hỏi mới Q175 — dòng quà tặng:** dòng quà có giá bán 0, nên "70% giá bán" cho ra giá vốn 0 và lợi nhuận bị đội lên. Đề xuất: lấy 70% giá danh mục lúc bán; nếu không có giá danh mục thì để 0.
- **Giả định:** migration không ghi lịch sử giá hay audit (§5).
- Không đổi `spec/*.yaml`.
