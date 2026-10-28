# M16-12 — Bỏ nút "+ Khách lẻ" ở màn tạo/sửa đơn nháp

- **Status:** Approved (2026-10-28, chủ dự án chốt trực tiếp trong phiên)
- **Backlog:** M16-12 · **Milestone:** M16
- **Liên quan:** sửa đổi `M3-02b` (AC-ORD-025 — vế "+ Khách lẻ"), `M10-02` (AC-ORD-165), bổ sung `M16-10` (nút "Thêm khách hàng"). Thuần UI — không đổi API/DB/quyền.

## 1. Mục tiêu
Khách hàng của đơn luôn chọn từ danh sách khách hàng; khách mới (cá nhân/công ty) tạo bằng nút "Thêm khách hàng" (M16-10) thay cho nhập tay tên/SĐT "Khách lẻ".

## 2. Phạm vi
- Bỏ nút "+ Khách lẻ" trong `CustomerPicker`.
- Đơn nháp **cũ** đã lưu dạng khách lẻ (`customer_id` rỗng, có `customer_name`) vẫn mở được: hiện ô Tên/SĐT để sửa và nút "Chọn khách có sẵn" để chuyển sang khách trong danh sách. Không tạo mới được khách lẻ nữa.
- Ngoài phạm vi: backend vẫn nhận `customer_name`/`customer_phone` không kèm `customer_id` (dữ liệu cũ); nhãn "Khách lẻ" ở danh sách/chi tiết đơn cũ giữ nguyên.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-201 | Hoa mở `/orders/new` hoặc đơn nháp cũ là khách lẻ | render | Không có nút "+ Khách lẻ"; đơn cũ hiện đúng Tên/SĐT, bấm "Chọn khách có sẵn" → hiện ô "Tìm khách hàng", vẫn không có "+ Khách lẻ" | component |

AC-ORD-165 (thiếu SĐT khách lẻ → không lưu được) giữ nguyên, áp dụng cho đơn nháp cũ là khách lẻ.
