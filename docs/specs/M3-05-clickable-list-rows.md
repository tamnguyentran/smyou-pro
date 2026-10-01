# M3-05 — Hàng trong bảng danh sách bấm được cả dòng

- **Status:** Done
- **Backlog:** M3-05 · **Milestone:** M3
- **Liên quan:** `frontend/src/features/orders/components/OrderList.tsx`, `frontend/src/features/customers/components/CustomerList.tsx`; AC-ORD-069 (`M3-03b-order-list-detail-ui.md`), AC-CUS-009 (`M3-01-customers.md`); phát hiện ở `/review` M3-03b (`reports/review-M3-03b.md`, finding "Desktop order-list row is not fully clickable")

## 1. Mục tiêu
Là Sale/Quản lý/Quản lý kỹ thuật dùng bảng **Đơn hàng** hoặc **Khách hàng** trên máy tính, tôi bấm vào bất kỳ đâu trên một dòng để mở chi tiết, thay vì phải nhắm chính xác vào ô mã/tên — đúng như wording đã duyệt ở AC-ORD-069 ("bấm 1 dòng/thẻ → chi tiết").

## 2. Phạm vi
Thuần UI, không đổi API/dữ liệu/quyền. Chỉ sửa hành vi **desktop** (bảng `<table>`) của hai component; thẻ mobile (`<li><button>…</button></li>`) đã bấm được cả thẻ từ trước, không đổi.
- **Trong phạm vi:** `OrderList.tsx` (desktop `<tr>`), `CustomerList.tsx` (desktop `<tr>`) — toàn bộ vùng của hàng điều hướng tới chi tiết; giữ nguyên `<button>` mã/tên hiện có (để bàn phím/đọc màn hình vẫn có một mục tiêu tab rõ ràng); không nhân đôi điều hướng khi bấm đúng cái `<button>` đó (vẫn chỉ 1 lần `navigate`).
- **Ngoài phạm vi:** đổi cấu trúc cột, đổi bảng khác (chưa có bảng danh sách nào khác ngoài hai cái này); `ChipGroup` lọc trạng thái (tách sang `M3-06`); thẻ mobile.

## 3. Acceptance Criteria
Dữ liệu mẫu: đơn `DH2609-0001` (trạng thái `DRAFT`, khách "Cty Sáng Tạo Mới"); khách hàng `KH00001` "Cty Sáng Tạo Mới".

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-107 | An (SALE, `order.read`) ở `/orders` trên desktop (≥1024px), danh sách có đơn `DH2609-0001` | bấm vào ô "Khách" (`Cty Sáng Tạo Mới`) hoặc ô "Trạng thái" hoặc bất kỳ ô nào khác trong hàng của `DH2609-0001` (không phải ô mã) | điều hướng tới `/orders/{id}` của `DH2609-0001` (đúng 1 lần `navigate`, không điều hướng 2 lần) | component |
| AC-ORD-108 | Như trên | bấm vào `<button>` mã đơn (`DH2609-0001`) như hành vi cũ, hoặc Tab tới nút mã rồi Enter | vẫn điều hướng tới `/orders/{id}`, hành vi không đổi so với trước (không regression bàn phím) | component |
| AC-ORD-109 | Như trên, mobile (<1024px) | bấm vào thẻ đơn | hành vi không đổi: toàn thẻ vẫn là 1 `<button>` điều hướng (không có thay đổi gì ở mobile) | component |
| AC-CUS-014 | Hoa (SALE, `customer.manage`) ở `/customers` trên desktop, danh sách có `KH00001` | bấm vào ô "Loại", "SĐT", "MST", hoặc "Địa chỉ" trong hàng `KH00001` (không phải ô tên) | gọi `onSelect(customer)` với đúng khách hàng đó (mở sheet sửa), đúng 1 lần | component |
| AC-CUS-015 | Như trên | bấm vào `<button>` tên khách hàng như hành vi cũ | vẫn gọi `onSelect`, không regression | component |

## 4. API
Không đổi — không có endpoint mới/sửa.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Desktop: thêm `onClick` điều hướng lên chính `<tr>` của `OrderList`/`CustomerList`, giữ `hover:bg-sidebar-sub` đã có làm gợi ý trực quan, thêm `cursor-pointer` cho `<tr>`.
- `<button>` mã/tên bên trong giữ nguyên để bàn phím vẫn có một điểm dừng Tab rõ ràng dẫn tới cùng đích; bấm nút đó phải `e.stopPropagation()` để không bắn thêm sự kiện click của `<tr>` (tránh gọi `navigate`/`onSelect` hai lần — vô hại về chức năng nhưng tránh test/console warning thừa).
- Không đổi copy tiếng Việt, không đổi icon.
- Mobile không đổi.

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập An (SALE) → "Đơn hàng" → trên desktop, bấm vào ô "Khách" hoặc "Trạng thái" của một dòng bất kỳ (không bấm vào mã đơn) → vào được trang chi tiết đơn đó.
2. "Đơn hàng" → "Khách hàng" → bấm vào ô "SĐT" của một dòng → sheet sửa khách hàng đó mở ra.
3. Thu nhỏ trình duyệt xuống <1024px (hoặc mở trên điện thoại) → xác nhận thẻ vẫn bấm được như trước, không có gì đổi.

## 8. Giả định & câu hỏi
- Giả định: giữ `<button>` mã/tên bên trong `<tr>` (không gỡ bỏ) để không mất điểm neo bàn phím/đọc màn hình hiện có — gỡ nó đi và chỉ còn `onClick` trên `<tr>` sẽ làm desktop **kém** khả năng tiếp cận hơn hiện tại (hàng không có `role`/`tabIndex` sẽ không thể điều hướng bằng bàn phím). Không cần hỏi thêm — đây là cách làm chuẩn, tương thích AC-ORD-069 ("bấm 1 dòng") và không giảm khả năng tiếp cận.
- Không có câu hỏi nghiệp vụ mới; không cần sửa `spec/*.yaml`.
