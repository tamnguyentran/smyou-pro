# M3-03b — Gửi/thu hồi/huỷ đơn + danh sách/chi tiết: Giao diện

- **Status:** Approved
- **Backlog:** M3-03b (tách từ M3-03) · **Milestone:** M3
- **Liên quan:** `M3-03a-order-transitions-api.md` (API dùng ở item này: `submit`/`recall`/`cancel`, `GET /orders`, `GET /orders/{id}` + `allowed_commands`, `GET /orders/{id}/history`); `M3-02b-draft-orders-ui.md` (`DraftOrderForm` ở `/orders/new`/`/orders/:id` khi `DRAFT` — item này thêm nút "Gửi đơn"/"Huỷ đơn" vào đó và thay hẳn placeholder "Đơn đã được gửi, không thể sửa ở đây." bằng trang chi tiết thật khi `status != DRAFT`); `docs/design/UI_GUIDELINES.md` §5 hàng "Chi tiết đơn" (header + tab Thông tin·Dòng hàng·Lịch sử ở item này — Đầu việc/Tệp đính kèm để M4/M6) + §6 (`ConfirmDialog` cho hành động phá huỷ, toast, empty state); `spec/permissions.yaml` menu `orders` (`Danh sách đơn`, path `/orders`, kế thừa capability `order.create` của mục cha "Đơn hàng")

## 1. Mục tiêu
Là Sale/Manager, tôi muốn bấm "Gửi đơn" ngay trên form đang sửa, thu hồi/huỷ đơn khi cần, và mọi vai trò liên quan tra cứu được danh sách đơn + xem chi tiết (kể cả lịch sử thay đổi) của một đơn bất kỳ mà họ có quyền đọc.

## 2. Phạm vi
- **Trong phạm vi:**
  - Trang `/orders` (thay trang giữ chỗ hiện tại): danh sách đơn — tìm kiếm, lọc theo trạng thái, phân trang; bảng (desktop) / thẻ (mobile).
  - Trang `/orders/:id` khi `status != DRAFT`: trang chi tiết mới, header (mã + badge trạng thái + tên khách) + 3 tab **Thông tin** · **Dòng hàng** (chỉ đọc) · **Lịch sử** (timeline từ `GET /orders/{id}/history`); nút hành động hiện theo `allowed_commands` ("Thu hồi" nếu có `recall`, "Huỷ đơn" nếu có `cancel`).
  - `/orders/:id` khi `status == DRAFT`: giữ nguyên `DraftOrderForm` (M3-02b) — thêm nút "Gửi đơn" (nếu `allowed_commands` có `submit`) và "Huỷ đơn" (nếu có `cancel`) cạnh "Lưu nháp".
  - Sau `submit`/`recall`/`cancel` thành công: toast + điều hướng lại đúng trang tương ứng trạng thái mới (component tự chọn `DraftOrderForm` hay trang chi tiết theo `status` mới nhất).
  - `ConfirmDialog`/bottom sheet cho "Gửi đơn" (xác nhận thường), "Thu hồi" (xác nhận thường), "Huỷ đơn" (bottom sheet nhập lý do bắt buộc ≥5 ký tự — hành động không đảo ngược).
  - Toast lỗi tiếng Việt cho từng `guard` của `GUARD_FAILED` (`customer_present`, `has_lines_or_description`, `service_address_present`, `reason_present`), `INVALID_TRANSITION`, `STALE_VERSION` (tái dùng banner "Tải lại" mẫu AC-ORD-035).
- **Ngoài phạm vi:** tab Đầu việc/Tệp đính kèm của chi tiết đơn (M4/M6); nút huỷ đơn khi đang chạy (`cancel_active`, cần `task.manage`, M4-02); sửa liên hệ/dòng hàng sau khi gửi (M3-04); chuông thông báo thật khi có người submit đơn (phụ thuộc Q54 ở M3-03a, M7-01); đổi capability menu "Danh sách đơn" cho TECH_LEAD — xem Q56.

## 3. Acceptance Criteria
> Fixture như M3-03a: Hoa (SALE, chủ đơn), Hà (SALE khác), An (MANAGER), Tuấn (TECH_LEAD), Khoa (TECHNICIAN).

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-ORD-061 | Hoa ở `/orders/{id}`, đơn DRAFT đã lưu (`allowed_commands=["submit","cancel"]`), đủ điều kiện gửi | thấy nút "Gửi đơn" cạnh "Lưu nháp" → bấm | `ConfirmDialog` "Gửi đơn {code} tới Quản lý kỹ thuật?" → xác nhận → gọi `POST /orders/{id}/submit`; 200 → toast "Đã gửi đơn {code}."; điều hướng tới trang chi tiết mới, badge "Chờ điều phối", tab mặc định "Thông tin" | component + e2e |
| AC-ORD-062 | Đơn DRAFT thiếu khách (`customer_present` sẽ fail) | Hoa bấm "Gửi đơn" → xác nhận | 409 `GUARD_FAILED` guard=`customer_present` → toast đỏ "Đơn cần có khách hàng trước khi gửi."; tương tự: thiếu dòng hàng + mô tả → "Đơn cần có ít nhất 1 dòng hàng hoặc mô tả công việc."; thiếu địa chỉ thi công → "Đơn cần có địa chỉ thi công."; vẫn ở lại form, dữ liệu không mất | component |
| AC-ORD-063 | Hoa ở `/orders/{id}`, đơn DRAFT đã lưu, `allowed_commands` có `cancel` | bấm "Huỷ đơn" | bottom sheet (mobile) / modal (desktop) nhập lý do (`textarea`, bắt buộc ≥5 ký tự, nút "Xác nhận huỷ" disable tới khi đủ); xác nhận → `POST /orders/{id}/cancel`; 200 → toast "Đã huỷ đơn {code}."; điều hướng về `/orders` | component + e2e |
| AC-ORD-064 | Đơn PENDING_DISPATCH của Hoa (đã gửi) | Hoa mở `/orders/{id}` | trang chi tiết mới: header mã + badge "Chờ điều phối" + tên khách; tab Thông tin hiện đủ trường (địa chỉ, mô tả, ưu tiên, ngày hẹn…) chỉ đọc; nút "Thu hồi" và "Huỷ đơn" hiện (theo `allowed_commands=["recall","cancel"]`) | component + e2e |
| AC-ORD-065 | Như AC-ORD-064 | Hoa bấm "Thu hồi" | `ConfirmDialog` "Thu hồi đơn {code} về Nháp để sửa tiếp?" → xác nhận → `POST /orders/{id}/recall`; 200 → toast "Đã thu hồi đơn {code}."; điều hướng `/orders/{id}` giờ hiện lại `DraftOrderForm` (M3-02b) đúng dữ liệu | component + e2e |
| AC-ORD-066 | Đơn PENDING_DISPATCH của Hoa, có 2 dòng hàng (1 `LCD-DELL22`, 1 tự do) | mở tab "Dòng hàng" | hiện đúng danh sách dòng (tái dùng bảng/thẻ từ M3-02b) — chỉ đọc, **không** có nút thêm/sửa/xoá; tổng tiền theo từng mức VAT ở cuối | component |
| AC-ORD-067 | Đơn đã `submit` rồi `recall` (2 sự kiện) | mở tab "Lịch sử" | timeline mới nhất trước: "Thu hồi đơn" (Hoa, `dd/MM/yyyy HH:mm` giờ VN, "Chờ điều phối → Nháp"), rồi "Gửi đơn" (Hoa, "Nháp → Chờ điều phối"); tên lệnh dịch tiếng Việt (`submit`→"Gửi đơn", `recall`→"Thu hồi", `cancel`→"Huỷ đơn") | component + e2e |
| AC-ORD-068 | Đơn PENDING_DISPATCH của Hoa | Hà (SALE khác, `allowed_commands=[]`) mở `/orders/{id}` | xem đủ 3 tab (chỉ đọc, `order.read=all`) nhưng **không** có nút "Thu hồi"/"Huỷ đơn"; Khoa (TECHNICIAN, chưa có assignment, 404 từ API) → trang 404 chuẩn của app | component |
| AC-ORD-069 | Trang `/orders`, 3 đơn trạng thái khác nhau | tải trang | desktop: bảng cột Mã · Khách · Trạng thái (badge màu theo `spec/state_machines.yaml#color`) · Tổng tiền · Ngày hẹn · Người tạo; mobile: thẻ xếp dọc (mã + badge nổi bật, khách + tổng tiền bên dưới); ô tìm kiếm debounce 300ms (theo mã/tên/SĐT), chip lọc trạng thái; bấm 1 dòng/thẻ → `/orders/{id}`; không kết quả → empty state icon + "Không tìm thấy đơn nào." | component + e2e |
| AC-ORD-070 | Trang `/orders/{id}` (PENDING_DISPATCH), có người khác vừa `recall` trước | Hoa bấm "Huỷ đơn" → xác nhận | 409 `STALE_VERSION` → banner đỏ "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" (gọi lại `GET /orders/{id}`, mất nhập liệu lý do đang dở) | component |
| AC-ORD-071 | Màn `/orders` và `/orders/{id}` (PENDING_DISPATCH), iPhone 13 (390px) + 1440px | so sánh layout | mobile: tab dạng pill cuộn ngang trong khung (không tràn trang), nút hành động dính đáy (`sticky bottom-0`); desktop: tab ngang cố định dưới header, nút hành động nằm trong header bên phải; không cuộn ngang toàn trang ở 360px | component + e2e |

## 4. API
Không có route mới — dùng lại `M3-03a-order-transitions-api.md` (`submit`/`recall`/`cancel`, `GET /orders`, `GET /orders/{id}` + `allowed_commands`, `GET /orders/{id}/history`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Route `/orders`: trang danh sách mới, thay trang giữ chỗ; capability hiệu lực để vào trang = `order.read` (không phải `order.create` của menu — xem Q56), route guard kiểm qua `/me`.
- Route `/orders/:id`: component quyết định hiển thị `DraftOrderForm` (M3-02b, khi `status="DRAFT"`) hay `OrderDetailTabs` mới (khi khác `DRAFT`) dựa trên `GET /orders/{id}.status` — không có URL riêng cho 2 chế độ.
- `OrderDetailTabs`: header sticky (mã, badge, khách) + thanh tab (Thông tin/Dòng hàng/Lịch sử) + vùng nội dung theo tab; nút hành động (`Thu hồi`/`Huỷ đơn`) nằm trong header trên desktop, dính đáy trên mobile — theo mẫu "Lưu nháp" ở M3-02b.
- Badge trạng thái dùng màu từ `spec/state_machines.yaml#order.states[].color` (đã có token màu tương ứng — xem `UI_GUIDELINES` §2, tái dùng nếu đã có từ trang khác; nếu chưa có mapping màu, đây là phần cần làm mới ở item này).
- Copy tiếng Việt chính xác: nút "Gửi đơn"/"Thu hồi"/"Huỷ đơn"; toast thành công "Đã gửi đơn {code}."/"Đã thu hồi đơn {code}."/"Đã huỷ đơn {code}."; lỗi guard như bảng AC-ORD-062.

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập Sale; mở 1 đơn nháp đủ điều kiện (hoặc tạo mới) → bấm "Gửi đơn" → thấy trang chi tiết mới với badge "Chờ điều phối".
2. Bấm "Thu hồi" → quay lại form sửa; bấm "Gửi đơn" lại → bấm "Huỷ đơn", nhập lý do → đơn chuyển "Đã huỷ".
3. Vào `/orders`, tìm theo tên khách/SĐT/mã đơn, lọc theo trạng thái "Đã huỷ" → thấy đúng đơn vừa huỷ; mở lại → tab "Lịch sử" thấy đủ 3 sự kiện (gửi/thu hồi/huỷ).

## 8. Giả định & câu hỏi
- Giả định: tab "Dòng hàng" tái dùng UI hiển thị dòng hàng đã có ở `DraftOrderForm` (M3-02b) ở chế độ chỉ đọc (ẩn nút sửa/xoá), không viết lại từ đầu.
- Giả định: màu badge theo `state_machines.yaml#color` (`todo`/`review`/`in_progress`/`completed`/`urgent`) ánh xạ sang token màu cụ thể trong `UI_GUIDELINES` §2 — nếu token chưa đủ cho `review`/`urgent`, bổ sung khi code (không phải quyết định nghiệp vụ).
- **Câu hỏi mới — Q56 (đề xuất: giữ nguyên, không sửa `permissions.yaml`)**: mục menu "Danh sách đơn" (`/orders`) hiện kế thừa capability `order.create` của mục cha "Đơn hàng" (chỉ MANAGER/SALE thấy trong menu), dù `order.read` cũng cấp cho TECH_LEAD (`all`). *Đề xuất:* không đổi menu ở item này — TECH_LEAD chưa cần trang danh sách đơn chung (sẽ có "Đơn chờ điều phối" riêng ở M4-01); route `/orders` vẫn kiểm `order.read` ở tầng dữ liệu nên TECH_LEAD gõ thẳng URL vẫn xem được, chỉ không có link trong menu.
