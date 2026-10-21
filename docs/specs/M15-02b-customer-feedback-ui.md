# M15-02b — Ghi nhận phản hồi khách hàng (CSKH) — Giao diện

- **Status:** Draft
- **Backlog:** M15-02b · **Milestone:** M15
- **Liên quan:** M15-02a (API `PUT /orders/{id}/csat`, `GET /orders/csat-summary`); `docs/specs/M3-03b-order-list-detail-ui.md` (trang danh sách/chi tiết đơn tái dùng); `docs/design/UI_GUIDELINES.md` (màu nền thẻ/dòng, token màu)

## 1. Mục tiêu
Là CSKH, tôi muốn thấy ngay trên danh sách đơn đơn nào đã được đánh giá tốt/xấu, xem tổng hợp số lượng theo từng mức sao, và ghi phản hồi ngay trên trang chi tiết đơn.

## 2. Phạm vi
- Trong phạm vi:
  - Trang `/orders` (dùng lại danh sách hiện có, M3-03b): khi người dùng có vai trò CUSTOMER_CARE, mặc định bộ lọc ngày = từ ngày đầu tháng hiện tại đến hôm nay (người dùng đổi được).
  - Tô màu nền mỗi dòng/thẻ đơn theo `csat_rating`: `csat_rating >= 4` → xanh nhạt (token `success-subtle` hoặc tương đương trong UI_GUIDELINES); `csat_rating == 3` → vàng nhạt (`warning-subtle`); `csat_rating <= 2` → hồng nhạt (`danger-subtle`); `csat_rating == null` → giữ nguyên nền hiện tại (không đổi).
  - Ô thống kê ngay trên danh sách: 5 số đếm theo sao (và số "chưa đánh giá"), lấy từ `GET /orders/csat-summary` với đúng filter hiện tại của danh sách; bấm vào 1 số → lọc danh sách theo đúng mức sao đó (ví dụ bấm "3★: 4" → danh sách chỉ còn 4 đơn 3 sao).
  - Trang chi tiết đơn (`/orders/:id`): thêm khối "Phản hồi khách hàng" (chỉ hiện với CUSTOMER_CARE hoặc MANAGER, chỉ khi đơn `COMPLETED`) — chọn sao (1–5) + ô nhập nội dung (bắt buộc) + nút "Lưu phản hồi"; nếu đã có phản hồi, hiện lại giá trị cũ, cho sửa.
- Ngoài phạm vi: nút "Tạo yêu cầu chỉnh sửa" (M15-03).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CSK-010 | Lan (CUSTOMER_CARE) mở `/orders` lần đầu trong ngày | render | Bộ lọc ngày = `[đầu tháng hiện tại, hôm nay]`; danh sách chỉ hiện đơn trong khoảng này | component |
| AC-CSK-011 | Danh sách có đơn A (`csat_rating=5`), B (`csat_rating=3`), C (`csat_rating=1`), D (chưa đánh giá) | render | A nền xanh nhạt, B nền vàng nhạt, C nền hồng nhạt, D nền mặc định (không đổi) | component |
| AC-CSK-012 | Ô thống kê hiện `{5:3, 4:2, 3:1, 2:1, 1:1, none:2}` theo filter hiện tại | Lan bấm số ở ô "3★" | Danh sách lọc lại chỉ còn đơn 3★ trong cùng khoảng ngày (gọi lại `GET /orders?...&csat_rating=3`) | component |
| AC-CSK-013 | Mở đơn `COMPLETED` chưa có phản hồi | render chi tiết đơn | Khối "Phản hồi khách hàng" hiện form trống: 5 ô sao + ô nội dung + nút "Lưu phản hồi" (disabled khi chưa chọn sao hoặc chưa nhập nội dung) | component |
| AC-CSK-014 | Form đã chọn 4 sao, nhập "Khách hài lòng" | Bấm "Lưu phản hồi" | Gọi `PUT /orders/{id}/csat`; thành công → toast "Đã lưu phản hồi của khách hàng."; khối cập nhật hiện lại giá trị đã lưu, nút đổi thành "Cập nhật phản hồi" | component |
| AC-CSK-015 | Mở đơn chưa `COMPLETED` (vd `PENDING_DISPATCH`) | render chi tiết đơn | Không hiện khối "Phản hồi khách hàng" (ẩn hoàn toàn, không hiện form disabled) | component |
| AC-CSK-016 | Hoa (SALE, không phải CUSTOMER_CARE/MANAGER) mở đơn `COMPLETED` | render chi tiết đơn | Không hiện khối "Phản hồi khách hàng" | component |

## 4. API
Không có route mới — dùng `GET /orders`, `GET /orders/csat-summary`, `PUT /orders/{id}/csat` từ M15-02a.

## 5. Dữ liệu / Migration
Không có (đã làm ở M15-02a).

## 6. UI
- Mobile (390px): ô thống kê 6 số xếp dạng lưới 2 cột × 3 dòng, chạm được để lọc (≥44px). Màu nền dòng áp cho cả thẻ danh sách dạng mobile và dòng bảng desktop.
- Desktop (1440px): ô thống kê xếp 1 dòng ngang phía trên bảng, cạnh bộ lọc ngày.
- Copy tiếng Việt: toast "Đã lưu phản hồi của khách hàng.", nhãn khối "Phản hồi khách hàng", placeholder ô nội dung "Nhập nội dung phản hồi của khách hàng…", nút "Lưu phản hồi"/"Cập nhật phản hồi".

## 7. Kịch bản UAT thủ công
1. Đăng nhập tài khoản CSKH, vào "Đơn hàng" → thấy mặc định lọc đầu tháng→hôm nay, ô thống kê sao.
2. Mở 1 đơn đã hoàn tất, ghi phản hồi 5 sao → lưu → về danh sách thấy dòng đơn đó chuyển nền xanh nhạt.
3. Bấm vào số ở ô "5★" → danh sách lọc đúng.

## 8. Giả định & câu hỏi
- Giả định: màu nền áp cho **toàn dòng/thẻ**, không chỉ 1 cột riêng — để dễ nhận biết từ xa trên danh sách dài.
- Câu hỏi mới (→ `OPEN_QUESTIONS.md`): có cần hiện khối "Phản hồi khách hàng" ở dạng chỉ-đọc cho TECH_LEAD/SALE (không sửa, chỉ xem) để họ biết khách đánh giá sao không, hay giữ kín hoàn toàn với 2 vai trò đó như AC-CSK-016? Mặc định: giữ kín (chỉ CUSTOMER_CARE/MANAGER thấy khối này trên trang chi tiết đơn — các vai trò khác xem số liệu tổng hợp qua Dashboard M15-04 thay vì từng đơn).
