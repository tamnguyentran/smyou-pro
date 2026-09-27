# M2-01b — Danh mục sản phẩm: giao diện

- **Status:** Draft
- **Backlog:** M2-01b · **Milestone:** M2
- **Liên quan:** `M2-01a-products-api.md` (mục tiêu, API, Q42–Q44); UI_GUIDELINES §3–§6 (dòng 71: mẫu tải ảnh nén phía client); M1-03a (menu, 403); M1-04b (mẫu trang danh sách + form + optimistic lock)

## 2. Phạm vi
Trang Danh mục sản phẩm (`/catalog/products`): danh sách (bảng/thẻ), tìm/lọc/phân trang, form tạo/sửa, ngừng/mở kinh doanh, chọn & xem trước ảnh; chỉ đọc với Sale và Quản lý kỹ thuật (mở bằng đường dẫn trực tiếp — menu "Danh mục" vẫn chỉ hiện với Manager theo YAML, như M1-04b/Q36).

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN]. Sản phẩm mẫu như M2-01a.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-012 | An trên máy tính / điện thoại | mở "Danh mục" → "Sản phẩm" | máy tính: bảng Mã hàng · Tên · Danh mục · Giá (đã format `12.500.000 ₫`) · Trạng thái (badge); điện thoại: thẻ xếp dọc kèm ảnh thu nhỏ; ô tìm (gõ xong 300ms mới gọi API), lọc danh mục (`category`), lọc trạng thái; phân trang; trạng thái tải (Skeleton), trống ("Chưa có sản phẩm phù hợp."), lỗi (Thử lại) | component + e2e |
| AC-CAT-013 | An | bấm "Thêm sản phẩm" (icon `Monitor`), điền `sku, name, category, brand, unit, price, vat_rate, price_fixed, warranty_months, specs`, Lưu | zod kiểm ở client trước (giá ≥ 0, VAT `[0,100]`); lỗi 409/422 server hiện dưới đúng ô; lưu xong → toast "Đã thêm sản phẩm PC SMYOU CORE I5-13400."; điều hướng sang trang chi tiết | component + e2e |
| AC-CAT-014 | An mở một sản phẩm đã tồn tại | sửa thông tin (không có ô `sku`/`category`/`unit` — đã khoá sau khi tạo), Lưu | toast "Đã cập nhật."; 409 `STALE_VERSION` → "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút Tải lại | component |
| AC-CAT-015 | An | "Ngừng kinh doanh" / "Mở lại kinh doanh" | `ConfirmDialog`: ngừng → "Sản phẩm sẽ không hiện khi tạo đơn mới."; xác nhận → badge đổi ngay, không cần tải lại trang | component + e2e |
| AC-CAT-016 | An mở form sản phẩm chưa có ảnh | chọn file ảnh từ máy (`accept="image/*"`) | xem trước ảnh trước khi lưu; nén phía client (cạnh dài ≤ 2000px, JPEG 0.85, theo mẫu UI_GUIDELINES dòng 71) trước khi tải lên; thanh tiến trình khi tải; tải xong → ảnh hiện trong danh sách và trang chi tiết. Chọn file không phải ảnh / > 10MB → thông báo tiếng Việt tương ứng lỗi server (`INVALID_FILE_TYPE`→"Tệp không phải ảnh hợp lệ.", `FILE_TOO_LARGE`→"Ảnh vượt quá 10MB.") mà **không** gọi API nén/tải nếu client tự phát hiện được kích thước trước | component + e2e |
| AC-CAT-017 | Hoa (SALE, có `catalog.read`) | mở `/catalog/products` trực tiếp (không qua menu) | xem được danh sách và chi tiết (chỉ đọc, không có nút Thêm/Sửa/Ngừng/tải ảnh); Khoa (TECHNICIAN, không có capability) mở → trang 403 (M1-03a). *Menu "Danh mục" vẫn chỉ hiện với Manager theo YAML* | component + e2e |
| AC-CAT-018 | Các màn trên, iPhone 13 + 1440px | E2E | axe 0 serious/critical; không cuộn ngang 360px; vùng chạm ≥ 44px; ảnh `products.png`, `product-form.png` | e2e |

## 4. API
Dùng API của M2-01a.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Theo UI_GUIDELINES §3–§4, §6 (ConfirmDialog, Toast, Skeleton, EmptyState); bottom sheet trên điện thoại cho form và hộp xác nhận; icon menu `Monitor` (đã có trong YAML).
- Badge trạng thái: "Đang kinh doanh" (`completed`), "Đã ngừng kinh doanh" (`todo`).
- Ảnh: khung vuông bo góc, `object-fit: cover`, ảnh giữ chỗ (icon `Monitor` xám) khi chưa có ảnh.
- Copy chính: "Thêm sản phẩm", "Lưu", "Ngừng kinh doanh", "Mở lại kinh doanh", "Chọn ảnh", "Đang tải ảnh…".

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → "Danh mục" → "Sản phẩm" → "Thêm sản phẩm" → điền đủ thông tin → Lưu.
2. Ở trang chi tiết, chọn 1 ảnh từ máy → xem trước → tải lên → thấy ảnh hiện ra.
3. "Ngừng kinh doanh" sản phẩm đó → badge đổi ngay.
4. Đăng nhập Sale ở cửa sổ khác, mở thẳng `/catalog/products` → thấy danh sách nhưng không có nút sửa.

## 8. Giả định
Theo Q42–Q44 (OPEN_QUESTIONS, xem M2-01a §8).
