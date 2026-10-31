# M19-01b — UI: Kỹ thuật viên thêm dòng hàng tại hiện trường

- **Status:** Approved
- **Backlog:** M19-01b · **Milestone:** M19
- **Liên quan:** M19-01a (API, cờ `can_add_lines_on_site`/`can_edit_on_site`), M3-04b (`OrderLinesSection`, `AddLineSheet`), M16-04 (Ghi doanh số). Phụ thuộc M19-01a.

## 1. Mục tiêu
Là kỹ thuật viên, khi mở đơn đang làm trên điện thoại, tôi thấy nút "Thêm dòng hàng" để thêm ngay thiết bị khách mua thêm, và sửa/xoá được dòng mình vừa thêm nếu bấm nhầm.

## 2. Phạm vi
- Trong phạm vi:
  - Tab "Dòng hàng" ở trang chi tiết đơn (`/orders/:id`; KTV vào từ "Việc của tôi"). Hiện nút "Thêm dòng hàng" khi `can_add_lines_on_site=true`. Nút mở `AddLineSheet` hiện có (tab Sản phẩm / Dịch vụ), gọi `lines-on-site`.
  - Dòng có `can_edit_on_site=true`: sửa số lượng, đơn giá (hàng giá linh hoạt), VAT, giảm giá, tặng kèm, ghi chú, và xoá (có xác nhận), giống thao tác Sale ở M3-04b nhưng gọi `lines-on-site`. Dòng còn lại chỉ đọc.
  - Ô "Ghi doanh số" trên dòng KTV thêm chỉ là chữ, không có ô chọn (Q124): "Ghi doanh số: Nguyễn Văn Bình".
  - Huy hiệu "KTV thêm · <tên>" trên mọi dòng `added_on_site=true`, cho mọi vai trò xem đơn (Sale/QLKT nhận biết dòng phát sinh).
  - Thông báo `ORDER_LINES_CHANGED_ON_SITE` hiện trong chuông. Bấm vào mở `/orders/:id` (theo cơ chế `entity_type=ORDER` sẵn có).
- Ngoài phạm vi: thay đổi API (M19-01a); màn danh mục cho KTV (KTV không có menu "Danh mục").

## 3. Acceptance Criteria
Dữ liệu như M19-01a: Bình (TECHNICIAN) đang `IN_PROGRESS` trên đơn DH2610-0042 của Hoa (SALE).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-236 | `OrderDetail` có `can_add_lines_on_site=true`, `can_edit_lines_after_submit=false` | render tab "Dòng hàng" | Có nút "Thêm dòng hàng" (vùng chạm ≥ 44px). Bấm vào mở Sheet "Thêm dòng hàng". Chọn "Ổ cứng SSD Kingston 512GB" thì gọi `POST /orders/{id}/lines-on-site` với `version` hiện tại và **không** gọi `lines-after-submit`; toast "Đã thêm dòng hàng" | component |
| AC-ORD-237 | `can_add_lines_on_site=false` và `can_edit_lines_after_submit=false` (KTV còn `PENDING`, hoặc đơn `AWAITING_CONFIRMATION`) | render | Không có nút "Thêm dòng hàng"; không dòng nào có nút sửa/xoá | component |
| AC-ORD-238 | Có 2 dòng: dòng Hoa tạo (`can_edit_on_site=false`) và dòng Bình thêm (`can_edit_on_site=true`, `added_on_site=true`, `added_by_name="Nguyễn Văn Bình"`) | render | Chỉ dòng của Bình có ô nhập số lượng/giảm giá và nút "Xoá dòng Ổ cứng SSD Kingston 512GB". Dòng đó có huy hiệu "KTV thêm · Nguyễn Văn Bình" và dòng chữ "Ghi doanh số: Nguyễn Văn Bình", không có ô chọn người | component |
| AC-ORD-239 | Dòng của Bình | đổi số lượng thành 2 và rời ô; bấm Xoá rồi xác nhận | Gọi `PATCH .../lines-on-site/{line_id}` với `{version, quantity:"2"}`, sau đó gọi `POST .../lines-on-site/{line_id}/remove`; tổng tiền cập nhật theo `OrderDetail` server trả về | component |
| AC-ORD-240 | Server trả 409 `GUARD_FAILED` guard=`actor_has_active_work_on_order` / 409 `ORDER_LOCKED` / 403 `LINE_NOT_EDITABLE` / 409 `STALE_VERSION` | thêm/sửa/xoá | Toast lỗi đúng message tiếng Việt của server. Với `STALE_VERSION`: tải lại đơn và hiện "Đơn vừa được người khác cập nhật, đã tải lại dữ liệu mới." (giữ hành vi M3-04b) | component |
| AC-ORD-241 | Hoa (SALE) xem đơn có dòng Bình thêm | render | Huy hiệu "KTV thêm · Nguyễn Văn Bình" hiện; Hoa vẫn sửa được dòng đó qua `lines-after-submit`, kể cả ô chọn "Ghi doanh số" (M16-04) | component |
| AC-ORD-242 | Stack Docker, Bình đăng nhập ở 390px | Việc của tôi → mở đơn DH2610-0042 → "Thêm dòng hàng" → chọn SSD → sửa số lượng 2 | Dòng mới hiện với huy hiệu "KTV thêm", tổng đơn tăng 2.700.000đ. Hoa đăng nhập thấy 1 thông báo "KTV thay đổi dòng hàng" trong chuông; bấm vào mở đúng đơn. Có screenshot 390px và 1440px | e2e |

## 4. API
Không thêm. Dùng 3 endpoint `lines-on-site` và các cờ mới của M19-01a (type sinh từ `make contract`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `OrderDetailTabs`: truyền thêm `canAddOnSite={order.can_add_lines_on_site}` vào `OrderLinesSection`. Section quyết định chế độ ghi theo thứ tự:
  1. Nếu `can_edit_lines_after_submit=true` → giữ luồng M3-04b, áp cho mọi dòng.
  2. Nếu không, mà `can_add_lines_on_site=true` → nút Thêm gọi `lines-on-site`; dòng nào có `can_edit_on_site=true` thì sửa/xoá được.
  3. Còn lại → chỉ đọc.
- `AddLineSheet`: thêm prop `mode: "draft" | "after_submit" | "on_site"`. Ở chế độ `on_site` không gửi `credited_employee_id` (server tự ghi cho KTV).
- Mobile-first 390px: dòng hàng dạng thẻ như hiện tại; huy hiệu dùng token màu `review`, icon `HardHat` (lucide-react), cỡ chữ `text-xs`. Desktop không đổi bố cục.
- Copy:
  - Nút: "Thêm dòng hàng"
  - Huy hiệu: "KTV thêm · {tên}"
  - Chữ ghi doanh số: "Ghi doanh số: {tên}"
  - Toast: "Đã thêm dòng hàng", "Đã cập nhật dòng hàng", "Đã xoá dòng hàng"
  - Xác nhận xoá: "Xoá dòng {tên hàng} khỏi đơn?"

## 7. Kịch bản UAT thủ công (cho chủ dự án)
1. Đăng nhập KTV có đầu việc đã "Nhận" hoặc "Bắt đầu". Vào Việc của tôi, mở đơn, sang tab "Dòng hàng".
2. Bấm "Thêm dòng hàng", chọn 1 sản phẩm. Dòng mới có huy hiệu "KTV thêm" và ghi doanh số cho chính mình.
3. Sửa số lượng hoặc giảm giá, rồi thử xoá dòng đó. Thử sửa một dòng Sale tạo: không có nút sửa.
4. Đăng nhập Sale chủ đơn: thấy thông báo "KTV thay đổi dòng hàng" và thấy huy hiệu trên dòng.
5. Đưa đơn sang "Chờ KH xác nhận": KTV không còn nút "Thêm dòng hàng".

## 8. Giả định & câu hỏi
- Theo M19-01a §8 (Q123–Q127). Không có câu hỏi mới.
