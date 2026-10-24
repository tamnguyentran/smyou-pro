# M16-01b — Ghi nhận tặng quà khách hàng — UI

- **Status:** Approved (2026-10-24)
- **Backlog:** M16-01b · **Milestone:** M16
- **Liên quan:** `M16-01a` (API); `docs/design/UI_GUIDELINES.md`; `spec/permissions.yaml#menu` (mục `customer-gifts`); `frontend/src/features/orders/components/ConfirmationAttachmentsTab.tsx` (mẫu upload ảnh tái dùng — nén ảnh client-side + progress bar); `frontend/src/features/orders` (mẫu ô chọn khách hàng dạng search-select)

## 1. Mục tiêu
Sale/CSKH/Manager xem và ghi nhận lịch sử tặng quà khách hàng qua một màn hình riêng trong menu "Đơn hàng", không phụ thuộc vào việc mở trang chi tiết khách hàng.

## 2. Phạm vi
- Trong phạm vi:
  - Mục menu mới "Ghi nhận quà tặng KH" (`spec/permissions.yaml#menu`, id `customer-gifts`, icon `Gift`, capability `customer_gift.read`) nằm trong nhóm "Đơn hàng", ngay dưới "Tạo đơn mới" và trên "Khách hàng".
  - Trang `/customer-gifts`: ô chọn khách hàng (search-select, tái dùng cách Order chọn khách hàng) **bắt buộc chọn trước để xem danh sách**. Chưa chọn → trạng thái rỗng "Chọn khách hàng để xem danh sách quà tặng", không gọi API danh sách (khớp API M16-01a — `customer_id` bắt buộc, AC-GFT-015).
  - Sau khi chọn khách hàng → gọi `GET /customer-gifts?customer_id=` hiện danh sách bản ghi của khách đó, sắp `performed_date` giảm dần. Mỗi dòng hiện: dịp/lễ, ngày thực hiện, gói quà, số lượng × đơn giá, chi phí khác, thành tiền, người thực hiện, người yêu cầu, số ảnh (nếu có).
  - **Đã chốt (2026-10-24, theo yêu cầu người dùng):** nút "Thêm quà tặng" (icon `Gift`, `lucide-react`) **luôn bật**, không phụ thuộc việc đã chọn khách hàng ở ô tìm kiếm trên trang hay chưa. Sheet "Thêm quà tặng" tự có ô chọn khách hàng riêng (search-select, cùng component `CustomerSearchField`, **có thể sửa** — không còn read-only), bắt buộc chọn trước khi lưu; nếu trang đã chọn khách hàng thì ô này tự điền sẵn khách đó (vẫn sửa được). Sau khi lưu thành công, trang tự chuyển ô tìm kiếm sang khách hàng vừa chọn trong sheet để danh sách hiện ngay bản ghi mới. Sheet sửa (PATCH) giữ nguyên: khách hàng không hiện/không sửa được, vì đổi khách hàng của bản ghi đã tồn tại ngoài phạm vi item này.
  - Sheet nhập các trường theo §3 `CustomerGiftCreate` của M16-01a; `performed_by`/`requested_by` là `<select>` nhân viên (tái dùng danh sách nhân viên active, giống cách Order chọn người). **Đã chốt (2026-10-24, theo yêu cầu người dùng):** thêm ô "Ghi chú" (`Textarea`, tuỳ chọn, tối đa 2000 ký tự, field `note` của M16-01a) ở cuối form, chiếm hết chiều rộng (không nằm trong lưới 2 cột); hiện trong danh sách (dòng chữ nghiêng, nhỏ) nếu bản ghi có ghi chú.
  - Bấm vào 1 dòng → sheet sửa (cùng form, PATCH, optimistic lock `version` — lỗi `STALE_VERSION` hiện banner + nút "Tải lại" giống Customer/Order); khách hàng không sửa được ở form sửa.
  - Tải ảnh: input file nhiều ảnh (`accept="image/*" capture="environment"`), nén client-side trước khi gửi (tái dùng `features/products/imageCompression`), progress bar, hiện lưới thumbnail sau khi tải — giống `ConfirmationAttachmentsTab`.
  - Form bố trí 2 cột từ `md:` (như M15-05 addendum — `wide` Sheet, `FieldGroup`), nút "Lưu"/"Huỷ" cạnh nhau mỗi nút 50% (như Customer form sau đợt sửa UI gần nhất).
- Ngoài phạm vi: báo cáo (M16-02b); không thêm tab "Quà tặng" trong trang chi tiết khách hàng (thay bằng màn hình riêng này).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-GFT-020 | An (MANAGER) mở `/customer-gifts` từ menu "Đơn hàng", chưa chọn khách hàng | render trang | Hiện trạng thái rỗng "Chọn khách hàng để xem danh sách quà tặng"; nút "Thêm quà tặng" **vẫn bật**; menu "Đơn hàng" hiện mục "Ghi nhận quà tặng KH" ngay dưới "Tạo đơn mới" | component |
| AC-GFT-021 | Khách `KH00001` có 2 bản ghi quà tặng | chọn `KH00001` ở ô tìm khách hàng | `GET /customer-gifts?customer_id=<KH00001>`; hiện 2 dòng đủ trường, sắp `performed_date` giảm dần | component |
| AC-GFT-022 | Chưa chọn khách hàng ở trang, mở sheet "Thêm quà tặng", không chọn khách hàng trong sheet | bấm "Lưu" | Lỗi hiện dưới ô chọn khách hàng trong sheet, không gửi request | component |
| AC-GFT-022b | Đã chọn khách hàng (ở trang hoặc trong sheet), mở sheet "Thêm quà tặng", không điền `performed_by` | bấm "Lưu" | Lỗi hiện dưới ô "Người thực hiện", không gửi request | component |
| AC-GFT-023 | Trang chưa chọn khách hàng; mở sheet "Thêm quà tặng", chọn khách `KH00001` trong sheet, điền đủ trường hợp lệ | bấm "Lưu" | `POST /customer-gifts` đúng payload gồm `customer_id=<KH00001>` (không gửi `total_amount`); toast "Đã thêm quà tặng."; trang tự chuyển sang hiện danh sách của `KH00001` | component |
| AC-GFT-024 | Sheet thêm/sửa quà tặng | tải 1 ảnh hợp lệ | Progress bar → thumbnail hiện trong lưới, `POST .../photos` gọi đúng `gift id` | component |
| AC-GFT-025 | Sheet sửa, 2 người cùng sửa 1 bản ghi | Lưu với `version` cũ | Banner lỗi + nút "Tải lại" (giống `test_update_duplicate_phone_warning`/`STALE_VERSION` pattern của Customer) | component |
| AC-GFT-026 | Đức (TECHNICIAN, không có `customer_gift.read`) | mở `/customer-gifts` | 403; menu "Đơn hàng" không hiện mục "Ghi nhận quà tặng KH" | component |

## 4. API
Dùng nguyên API của M16-01a, không route mới.

## 5. Dữ liệu / Migration
Không.

## 6. UI
Icon `Gift` (lucide-react) cho mục menu và nút "Thêm quà tặng". Màu/token theo `UI_GUIDELINES.md` hiện có, không thêm token mới.

## 7. Kịch bản UAT thủ công
1. Vào menu "Đơn hàng" → thấy mục "Ghi nhận quà tặng KH" ngay dưới "Tạo đơn mới" → mở đúng trang.
2. Thêm 1 bản ghi mới: chọn khách hàng, điền đủ trường, kèm ảnh → thấy ngay trong danh sách.
3. Sửa 1 bản ghi đã có → lưu → số liệu cập nhật đúng.
4. Thử lưu khi thiếu "Người thực hiện" → lỗi rõ ràng, không mất dữ liệu đã nhập.

## 8. Giả định & câu hỏi
- **Đã chốt (2026-10-24, theo yêu cầu người dùng):** đổi từ tab trong trang chi tiết khách hàng sang màn hình riêng `/customer-gifts` trong menu "Đơn hàng", ngay dưới "Tạo đơn mới" — thay cho thiết kế tab ban đầu.
- Giả định: trang bắt buộc chọn khách hàng trước khi xem/thêm (không có chế độ "xem tất cả") — vì API M16-01a cố định `customer_id` bắt buộc ở `GET /customer-gifts` (AC-GFT-015, đã implement + test pass); liệt kê nhiều khách hàng cùng lúc thuộc về báo cáo M16-02a/b, không mở lại ở item này.
- Giả định: màn hình hiện cho mọi role có `customer_gift.read` (MANAGER/SALE/CUSTOMER_CARE); role khác không thấy mục menu và bị 403 nếu gọi trực tiếp.
- Giả định: không giới hạn số ảnh/bản ghi ở UI (giới hạn thực tế là kích thước từng ảnh, theo M6-01); không có nút xoá ảnh ở item này (giống `ConfirmationAttachmentsTab` ban đầu — chỉ thêm).
