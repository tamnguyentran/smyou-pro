# M29-01 — Tải ảnh ngay khi thêm sản phẩm + ảnh mặc định "Chưa có ảnh"

- **Status:** Approved
- **Backlog:** M29-01 · **Milestone:** M29
- **Liên quan:** spec/permissions.yaml#`catalog.manage`, M2-01b (AC-CAT-016, §8 "chỉ tải ảnh sau khi tạo"), Q198
- **Thay thế một phần:** M2-01b §8 giả định "ảnh chỉ tải được khi sửa sản phẩm đã có".

## 1. Mục tiêu
Là Quản lý, tôi muốn chọn ảnh ngay trong form "Thêm sản phẩm" để không phải tạo xong rồi mở lại để thêm ảnh. Là mọi người dùng, tôi muốn nhận ra ngay sản phẩm nào chưa có ảnh, thay vì thấy một icon trông như ảnh sản phẩm.

## 2. Phạm vi
- Trong phạm vi:
  - Form "Thêm sản phẩm" có ô "Ảnh sản phẩm" giống form sửa: chọn ảnh, xem trước, kiểm tra loại/kích thước, nén ở client. Bấm "Lưu" thì tạo sản phẩm trước, rồi tải ảnh lên `POST /products/{id}/image` (API đã có), kèm thanh tiến trình.
  - Ảnh mặc định khi chưa có ảnh, dùng chung ở mọi nơi hiện ảnh sản phẩm: danh sách sản phẩm, xem chi tiết, form sửa, sheet "Thêm dòng hàng" ở form đơn hàng.
    - Icon `ImageOff` trên nền xám.
    - Có nhãn cho trình đọc màn hình: "Chưa có ảnh".
    - Ô ảnh lớn (form sửa/thêm, xem chi tiết) có thêm chữ "Chưa có ảnh" dưới icon.
- Ngoài phạm vi:
  - Ảnh cho dịch vụ (dịch vụ không có ảnh).
  - Đổi API/backend.
  - Xoá ảnh đã tải.
  - Nhiều ảnh cho một sản phẩm.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-111 | An (Quản lý) mở "Thêm sản phẩm" | xem form | Có ô "Ảnh sản phẩm" với ảnh mặc định "Chưa có ảnh" và nút "Chọn ảnh" | component |
| AC-CAT-112 | An điền đủ thông tin, chọn ảnh hợp lệ | bấm "Lưu" | Thấy ảnh xem trước. Gọi `POST /products` trước, rồi `POST /products/{id}/image` với ảnh đã nén. Có thanh tiến trình. Xong thì đóng sheet, toast "Đã thêm sản phẩm {tên}." (giữ như AC-CAT-013), danh sách hiện ảnh vừa tải | component + e2e |
| AC-CAT-113 | An chọn tệp không phải ảnh hoặc > 10MB trong form thêm | chọn tệp | Báo "Tệp không phải ảnh hợp lệ." / "Ảnh vượt quá 10MB." dưới ô ảnh; không gọi API; vẫn lưu được sản phẩm không kèm ảnh | component |
| AC-CAT-114 | An thêm sản phẩm kèm ảnh, nhưng tải ảnh lỗi (500/mạng) | bấm "Lưu" | Sản phẩm vẫn được tạo. Sheet không đóng mà chuyển sang chế độ sửa sản phẩm vừa tạo. Báo lỗi dưới ô ảnh: "Đã thêm sản phẩm nhưng chưa tải được ảnh. Vui lòng chọn ảnh lại." Bấm "Lưu" lần nữa không tạo sản phẩm trùng | component |
| AC-CAT-115 | An thêm sản phẩm không chọn ảnh | bấm "Lưu" | Chỉ gọi `POST /products`, không gọi API ảnh; hành vi như trước | component |
| AC-CAT-116 | Sản phẩm chưa có ảnh (`image_attachment_id = null`) | xem danh sách SP, xem chi tiết, sheet "Thêm dòng hàng" ở đơn | Hiện ảnh mặc định: icon `ImageOff`, `role="img"`, nhãn "Chưa có ảnh"; không còn icon màn hình (`Monitor`). Sản phẩm có ảnh thì vẫn hiện ảnh như cũ | component |
| AC-CAT-117 | 390px và 1440px, form "Thêm sản phẩm" có ảnh xem trước; danh sách SP | xem | Nút "Chọn ảnh" ≥ 44px; không cuộn ngang; axe không lỗi serious/critical; ảnh chụp lưu `reports/screenshots/` | e2e |

## 4. API
Không thêm, không đổi. Dùng `POST /api/v1/products` và `POST /api/v1/products/{id}/image` (capability `catalog.manage`), đã có từ M2-01a.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Form "Thêm sản phẩm":
  - Ô "Ảnh sản phẩm" đặt cùng vị trí như ở form sửa.
  - Chọn ảnh thì chỉ xem trước; chưa tải lên cho tới khi bấm "Lưu".
  - Nút "Lưu" bị khoá trong lúc tải ảnh.
- Ảnh mặc định:
  - Khung `rounded-xl border bg-sidebar-sub`, icon `ImageOff` màu `text-muted`.
  - Ô lớn (`size-20` trở lên) có thêm dòng chữ "Chưa có ảnh" (`text-xs text-muted`).
- Copy: "Chọn ảnh", "Chưa có ảnh", "Đã thêm sản phẩm {tên}.", "Đã thêm sản phẩm nhưng chưa tải được ảnh. Vui lòng chọn ảnh lại."

## 7. Kịch bản UAT thủ công
1. Đăng nhập `nam.nv`, vào Danh mục › Sản phẩm, bấm "Thêm sản phẩm". Thấy ô ảnh "Chưa có ảnh" và nút "Chọn ảnh".
2. Chọn một ảnh JPG/PNG, điền thông tin, bấm "Lưu". Sản phẩm mới hiện trong danh sách kèm ảnh.
3. Sản phẩm chưa có ảnh trong danh sách hiện icon "ảnh gạch chéo", không phải icon màn hình.
4. Tạo đơn hàng › "Thêm dòng hàng" › tab Sản phẩm: sản phẩm có ảnh hiện ảnh, sản phẩm chưa có ảnh hiện icon "Chưa có ảnh".

## 8. Giả định & câu hỏi
- Quyết định nghiệp vụ: Q198 (Chủ SP 2026-11-08). Cho tải ảnh khi thêm mới; chưa có ảnh thì hiện ảnh/icon mặc định để người dùng hiểu là "chưa có ảnh"; giữ ảnh ở sheet "Thêm dòng hàng".
- Giả định (UI):
  - Tạo xong sản phẩm mà tải ảnh lỗi thì không huỷ sản phẩm. Sheet chuyển sang chế độ sửa để chọn ảnh lại (AC-CAT-114). Việc này không trái quy tắc "chỉ giữ sheet mở khi lưu lỗi".
- Ước lượng: ~120 dòng code frontend không tính test → không tách.
