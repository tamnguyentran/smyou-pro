# M15-08 — Lịch sử thay đổi giá bán/giá vốn + snapshot giá vốn trên dòng hàng

- **Status:** Done
- **Backlog:** M15-08 · **Milestone:** M15
- **Liên quan:** M15-07 (`cost_price`); `docs/product/DOMAIN_MODEL.md` §2–3 (Product/Service), §6 (`order_lines`, các cột `*_snapshot` hiện có)

## 1. Mục tiêu
Là Manager, tôi muốn xem lại lịch sử mỗi lần giá bán/giá vốn của một sản phẩm-dịch vụ thay đổi (ai sửa, khi nào, giá cũ→mới) để đối chiếu sau này; và mỗi dòng hàng trong đơn phải lưu lại giá vốn tại thời điểm thêm dòng để tính lời/lỗ.

## 2. Phạm vi
- Trong phạm vi:
  - Bảng mới `catalog_price_history`: `id, item_type (PRODUCT|SERVICE), item_id, old_price, new_price, old_cost_price, new_cost_price, changed_by, changed_at`. Ghi 1 dòng mỗi lần `PATCH /products/{id}` hoặc `PATCH /services/{id}` thực sự đổi `price` và/hoặc `cost_price` (không ghi nếu lần sửa đó không đổi 2 trường này, vd chỉ đổi `name`).
  - `GET /api/v1/products/{id}/price-history`, `GET /api/v1/services/{id}/price-history` — capability `catalog.manage` (chỉ ai sửa được catalog mới xem lịch sử giá — nhất quán vì đây là dữ liệu đối chiếu nội bộ, khác quyết định "ai cũng xem giá vốn hiện tại" ở M15-07 vốn áp dụng cho `order_lines`/báo cáo, không áp dụng cho lịch sử sửa đổi).
  - `order_lines` thêm cột `cost_price_snapshot bigint null` — snapshot `cost_price` của product/service tại thời điểm `POST /orders/{id}/lines`, cùng cách các cột `*_snapshot` khác đã làm (DOMAIN_MODEL §6). Dòng `PRODUCT`/`SERVICE` tạo **sau item M15-07** luôn có giá trị (vì `cost_price` đã bắt buộc ở catalog); dòng tạo trước đó hoặc catalog item chưa kịp điền giá vốn → `null`.
  - Màn "Lịch sử giá" trên trang chi tiết Sản phẩm/Dịch vụ (bảng: thời điểm, người sửa, giá bán cũ→mới, giá vốn cũ→mới).
- Ngoài phạm vi: không tính lại/migrate `cost_price_snapshot` cho dòng hàng cũ đã tạo trước item này (giữ `null`, báo cáo M15-09/10 xử lý trường hợp thiếu — xem §8 các spec đó).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-081 | An; `LCD1137` có `price=5000000, cost_price=4200000, version=1` | `PATCH /products/{id} {version:1, price:5200000, cost_price:4200000}` | 200; 1 dòng `catalog_price_history` ghi `old_price=5000000, new_price=5200000, old_cost_price=4200000, new_cost_price=4200000` | integration |
| AC-CAT-082 | Như trên, lần sửa chỉ đổi `name` (không đổi `price`/`cost_price`) | `PATCH /products/{id} {version, name:"Tên mới"}` | 200; **không** thêm dòng `catalog_price_history` | integration |
| AC-CAT-083 | `LCD1137` đã có 3 lần sửa giá | An `GET /products/{id}/price-history` | 200; 3 phần tử, sắp `changed_at` giảm dần (mới nhất trước) | integration |
| AC-CAT-084 | Hoa (SALE, không có `catalog.manage`) | `GET /products/{id}/price-history` | 403 | integration |
| AC-CAT-085 | Hoa thêm dòng hàng `product_id=LCD1137` (`cost_price=4200000` hiện tại) vào đơn nháp | `POST /orders/{id}/lines {item_type:"PRODUCT", product_id, quantity:1, unit_price:5200000}` | 201; `OrderLine.cost_price_snapshot = 4200000` | integration |
| AC-CAT-086 | Sau đó Manager đổi `cost_price` của `LCD1137` thành `4500000` | `GET /orders/{id}` (đơn đã tạo ở trên) | Dòng hàng cũ vẫn `cost_price_snapshot = 4200000` (không đổi theo giá catalog mới — đúng tinh thần snapshot) | integration |
| AC-CAT-087 | Trang chi tiết sản phẩm | mở tab "Lịch sử giá" | Bảng hiện đúng các lần sửa, cột giá bán/giá vốn cũ→mới, người sửa, thời điểm (định dạng `Asia/Ho_Chi_Minh`) | component |

## 4. API
| Method | Path | Capability | Response |
|---|---|---|---|
| GET | /api/v1/products/{id}/price-history | catalog.manage | `[{changed_at, changed_by: {id,code,full_name}, old_price, new_price, old_cost_price, new_cost_price}]` |
| GET | /api/v1/services/{id}/price-history | catalog.manage | như trên |

## 5. Dữ liệu / Migration
`make migration name=catalog_price_history` —
- Bảng `catalog_price_history(id uuid pk, item_type varchar, item_id uuid, old_price bigint, new_price bigint, old_cost_price bigint null, new_cost_price bigint null, changed_by uuid references employees, changed_at timestamptz)`, index `(item_type, item_id, changed_at)`.
- `order_lines` thêm `cost_price_snapshot bigint null`.

## 6. UI
- Trang chi tiết Sản phẩm/Dịch vụ: thêm tab/khối "Lịch sử giá" (chỉ Manager thấy, theo capability `catalog.manage`).

## 7. Kịch bản UAT thủ công
1. Sửa giá bán + giá vốn 1 sản phẩm 2 lần → xem "Lịch sử giá" → thấy đúng 2 dòng.
2. Sửa chỉ tên sản phẩm → "Lịch sử giá" không tăng dòng.
3. Thêm dòng hàng sản phẩm đó vào đơn → đổi giá vốn catalog → kiểm dòng hàng cũ giữ giá vốn snapshot ban đầu.

## 8. Giả định & câu hỏi
- Giả định: chỉ ghi lịch sử khi `price`/`cost_price` thực sự đổi giá trị (so sánh cũ≠mới), không ghi khi gửi lại đúng giá cũ.
- Giả định: capability xem lịch sử giá = `catalog.manage` (chỉ Manager) — SALE/TECH_LEAD/CUSTOMER_CARE tuy xem được giá vốn **hiện tại** (M15-07, quyết định chủ dự án) nhưng không xem được lịch sử sửa đổi, vì đây là dữ liệu đối chiếu quản trị. → ghi vào `OPEN_QUESTIONS.md` để chủ dự án xác nhận có đúng ý hay cần mở rộng quyền xem lịch sử.
