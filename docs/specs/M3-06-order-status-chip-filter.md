# M3-06 — Bộ lọc trạng thái đơn hàng bằng ChipGroup

- **Status:** Draft
- **Backlog:** M3-06 · **Milestone:** M3
- **Liên quan:** `M3-03b-order-list-detail-ui.md` (AC-ORD-069, wording đã duyệt "chip lọc trạng thái"); `frontend/src/components/ui/Chip.tsx` (`ChipGroup`, component có sẵn — dùng cho VAT ở M3-02a/b); UI_GUIDELINES §6 "chip chọn nhanh"; phát hiện ở `/review` M3-03b (`reports/review-M3-03b.md`, finding "Status filter is a `<Select>`, not the 'chip lọc trạng thái'...")

## 1. Mục tiêu
Là Sale/Quản lý/Quản lý kỹ thuật ở trang Danh sách đơn, tôi lọc theo trạng thái bằng cách bấm 1 chip thay vì mở menu `<select>`, đúng như AC-ORD-069 đã duyệt — bấm 1 lần thấy ngay các lựa chọn, không cần mở/đóng dropdown.

## 2. Phạm vi
- **Trong phạm vi:** thay `<Select label="Trạng thái">` ở `OrdersListPage.tsx` bằng `ChipGroup` có sẵn (`components/ui/Chip.tsx`, không đổi component dùng chung — chỉ đổi nơi gọi); cập nhật `orderList.test.tsx` (bỏ `selectOptions`, dùng click chip) cho đúng AC-ORD-069 đã duyệt.
- **Ngoài phạm vi (item này):**
  - Bộ lọc "Trạng thái"/"Loại khách hàng" ở `ProductsPage`/`ServicesPage`/`CustomersPage` — các AC gốc của những trang đó (vd AC-CAT-012) chỉ ghi "lọc trạng thái", không có wording "chip" nào bị sai lệch; đổi thêm các trang này sẽ vượt phạm vi lát cắt dọc của item này.
  - Lọc nhiều trạng thái cùng lúc (multi-select) — `ChipGroup` hiện là single-choice (`role="radiogroup"`), giữ đúng hành vi hiện tại của `<Select>` (chỉ chọn 1 trạng thái hoặc "Tất cả" tại một thời điểm), không mở rộng thành multi-select.
  - Đổi màu chip theo tông trạng thái (vd đỏ cho "Chỉnh sửa" như `Badge`/`ORDER_STATUS_TONE`) — `ChipGroup` dùng 1 kiểu chọn/không-chọn thống nhất (như VAT), giữ nhất quán với chip đã có, không thêm biến thể màu mới.

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]. Đơn mẫu đủ 7 trạng thái (`DRAFT`, `PENDING_DISPATCH`, `IN_PROGRESS`, `AWAITING_CONFIRMATION`, `COMPLETED`, `REVISION`, `CANCELLED`).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-110 | An hoặc Hoa ở `/orders` | mở trang | bộ lọc trạng thái là nhóm chip (`role="radiogroup"` aria-label "Trạng thái"), không còn `<select>`; thứ tự: "Tất cả", "Nháp", "Chờ điều phối", "Đang thực hiện", "Chờ khách xác nhận", "Hoàn tất", "Chỉnh sửa", "Đã huỷ"; "Tất cả" đang chọn theo mặc định (`aria-checked="true"`) | component + e2e |
| AC-ORD-111 | Như trên, danh sách đang hiện đơn ở nhiều trạng thái | bấm chip "Chờ điều phối" | chip "Chờ điều phối" chuyển `aria-checked="true"`, các chip khác `false`; gọi lại `GET /orders?status=PENDING_DISPATCH...`; danh sách chỉ còn đơn `PENDING_DISPATCH` | component |
| AC-ORD-112 | Đang chọn chip "Chờ điều phối" (như AC-ORD-111) | bấm chip "Tất cả" | "Tất cả" `aria-checked="true"`, "Chờ điều phối" trở lại `false`; gọi lại `GET /orders` không có tham số `status`; danh sách về đầy đủ | component |
| AC-ORD-113 | Màn hình trên, iPhone 13 (390px) | mở trang, có đủ 8 chip | nhóm chip tự xuống dòng (wrap), không gây cuộn ngang trang ở 360px; mỗi chip cao ≥ 44px | e2e |
| AC-ORD-114 | Màn hình danh sách đơn (có bộ lọc chip), mobile + desktop | E2E | axe 0 vi phạm `serious`/`critical`; ảnh `order-list.png` (390px và 1440px) cập nhật, thấy chip thay cho dropdown | e2e |

## 4. API
Không đổi — vẫn `GET /api/v1/orders?status=...` (đã có từ M3-03a), chỉ đổi cách FE dựng tham số từ UI.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `OrdersListPage.tsx`: thay `<Select label="Trạng thái" ...>` bằng `<ChipGroup label="Trạng thái" value={status} options={[{value: "", label: "Tất cả"}, ...ORDER_STATUS_ORDER.map(...)]} onChange={...} />` (cùng `components/ui/Chip.tsx` đang dùng cho VAT, không sửa component).
- Bố cục: ô "Tìm kiếm" giữ nguyên trong lưới `sm:grid-cols-2`; nhóm chip đặt ngay dưới, full-width (không ép vào cột như `<Select>` cũ) — chip tự wrap nên không cần giới hạn chiều rộng theo cột.
- Không đổi copy nhãn trạng thái (`ORDER_STATUS_LABEL` giữ nguyên).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Sale → "Đơn hàng" → "Danh sách đơn".
2. Thấy dòng chip trạng thái ngay dưới ô tìm kiếm (không phải dropdown).
3. Bấm chip "Chờ điều phối" → danh sách lọc ngay; bấm "Tất cả" → về đầy đủ.
4. Mở trên điện thoại (hoặc thu nhỏ trình duyệt ~390px) → chip xuống dòng, không cuộn ngang.

## 8. Giả định & câu hỏi
- Không có câu hỏi mới — đây là sửa lệch giữa code và AC-ORD-069 đã duyệt (M3-03b), không phát sinh quy tắc nghiệp vụ mới.
- Giả định: giữ single-select (như hành vi `<select>` cũ), không mở rộng multi-select — xem §2.
- Giả định: không đổi `orderStatus.ts` (`ORDER_STATUS_LABEL`/`ORDER_STATUS_ORDER`) — chip chỉ đổi cách hiển thị bộ lọc, không đổi danh sách/nhãn trạng thái.
