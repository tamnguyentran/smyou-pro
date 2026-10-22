# M15-06 — Bỏ dòng hàng "Tự do" khi tạo đơn

- **Status:** Approved
- **Backlog:** M15-06 · **Milestone:** M15
- **Liên quan:** `docs/product/DOMAIN_MODEL.md` §6 (`order_lines.item_type`); `docs/specs/M3-02a-draft-orders-api.md` / `M3-02b-draft-orders-ui.md` (thêm dòng hàng, tab "Tự do")

## 1. Mục tiêu
Là Sale/CSKH, khi thêm dòng hàng vào đơn, tôi chỉ được chọn trong danh mục Sản phẩm/Dịch vụ — không còn nhập tay tự do — để mọi dòng hàng đều có nguồn gốc rõ ràng, phục vụ tính giá vốn/lợi nhuận (M15-07/08).

## 2. Phạm vi
- Trong phạm vi:
  - `POST /orders/{id}/lines`: từ chối (422) khi `item_type = "CUSTOM"` cho dòng **mới**. `PRODUCT`/`SERVICE` không đổi.
  - UI thêm dòng hàng: bỏ tab "Tự do", chỉ còn 2 tab "Sản phẩm"/"Dịch vụ".
  - Đơn cũ đã có dòng `CUSTOM` (tạo trước item này): giữ nguyên hiển thị, vẫn tính tiền/VAT như cũ, không chặn xem/sửa số lượng-giá của dòng đó nếu đơn còn ở `DRAFT`, không chặn hoàn tất đơn.
- Ngoài phạm vi: không xoá cột/enum `CUSTOM` khỏi schema (vẫn cần đọc dữ liệu cũ); không migrate dữ liệu cũ sang `PRODUCT`/`SERVICE`.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-181 | Hoa; đơn `DRAFT` | `POST /orders/{id}/lines {item_type:"CUSTOM", name:"...", unit_price:100000, quantity:1}` | 422 `VALIDATION_ERROR`, field `item_type` — "Chỉ được chọn Sản phẩm hoặc Dịch vụ." | integration |
| AC-ORD-182 | Hoa | `POST /orders/{id}/lines {item_type:"PRODUCT", product_id}` | 201 (không đổi so với hiện tại) | integration |
| AC-ORD-183 | Đơn cũ (seed trước item này) có 1 dòng `CUSTOM` | `GET /orders/{id}` | Dòng `CUSTOM` vẫn trả về đầy đủ như cũ, không lỗi | integration |
| AC-ORD-184 | Màn "Thêm dòng hàng" (M3-02b) | Mở sheet thêm dòng | Chỉ còn 2 tab "Sản phẩm" / "Dịch vụ"; không còn tab "Tự do" | component |
| AC-ORD-185 | Đơn cũ có dòng `CUSTOM`, đang `DRAFT` | Hoa sửa số lượng dòng `CUSTOM` đó | 200 — vẫn sửa được số lượng/đơn giá dòng cũ như trước (không bị item này chặn, chỉ chặn **tạo mới**) | integration |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/orders/{id}/lines | order.edit_draft | Thêm validation từ chối `item_type = CUSTOM` cho dòng mới |

## 5. Dữ liệu / Migration
Không có migration — giữ enum `CUSTOM` trong `order_lines.item_type` cho dữ liệu lịch sử, chỉ chặn ở tầng validation API.

## 6. UI
- Sheet "Thêm dòng hàng": bỏ tab "Tự do" khỏi `ItemTypeTabs`.

## 7. Kịch bản UAT thủ công
1. Mở đơn nháp, bấm "Thêm dòng hàng" → chỉ thấy 2 tab Sản phẩm/Dịch vụ.
2. Gọi API trực tiếp với `item_type=CUSTOM` → 422.
3. Mở đơn cũ có dòng Tự do (nếu có dữ liệu seed/demo) → vẫn hiển thị, sửa số lượng được.

## 8. Giả định & câu hỏi
- Giả định: "không migrate dữ liệu cũ" — các đơn đã có dòng CUSTOM trong lịch sử coi là bình thường, không yêu cầu Sale phải đổi lại. Nếu chủ dự án muốn ẩn/cảnh báo các đơn cũ này khỏi báo cáo lợi nhuận mới (M15-09/10, không có giá vốn cho dòng CUSTOM) → cần quyết định riêng, ghi vào `OPEN_QUESTIONS.md`.
