# M10-02 — Vô hiệu hoá nút Lưu nháp/Gửi đơn khi thiếu thông tin bắt buộc

- **Status:** Done
- **Backlog:** M10-02 · **Milestone:** M10
- **Liên quan:** `docs/specs/M3-02b-draft-orders-ui.md` (nút "Lưu nháp", AC-ORD-024 — item này sửa lại hành vi "nút luôn hiện" thành có điều kiện enable); `docs/specs/M3-03b-order-list-detail-ui.md` (nút "Gửi đơn", AC-ORD-061/062 — giữ nguyên xử lý lỗi `GUARD_FAILED` phía server làm lớp bảo vệ thứ hai); `spec/state_machines.yaml#order.transitions[submit].guards` (`customer_present`, `has_lines_or_description`, `service_address_present` — nguồn sự thật cho guard server, không đổi ở item này)

## 1. Mục tiêu
Là Nhân viên kinh doanh, khi đơn đang tạo/sửa còn thiếu khách hàng hoặc chưa có dòng hàng, tôi muốn nút "Lưu nháp"/"Gửi đơn" bị vô hiệu hoá kèm gợi ý rõ ràng, thay vì bấm được rồi mới thấy lỗi, để tránh bấm nhầm và đỡ phải đọc toast lỗi.

## 2. Phạm vi
- **Trong phạm vi:** điều kiện enable/disable client-side của nút "Lưu nháp" (`DraftOrderForm`, M3-02b) và nút "Gửi đơn" (cùng form khi `status=DRAFT` và `allowed_commands` có `submit`, M3-03b); helper text tiếng Việt giải thích lý do disabled; cập nhật lại AC-ORD-024 (M3-02b) — bỏ câu "nút Lưu nháp luôn hiện"; **(amendment)** điều kiện enable cho nút "Huỷ đơn" trên cùng form — xem AC-ORD-167..169.
- **Ngoài phạm vi:** đổi guard server (`spec/state_machines.yaml` không đổi — `has_lines_or_description` vẫn chấp nhận chỉ cần mô tả công việc, không bắt buộc dòng hàng ở tầng server); validate `service_address`/mô tả công việc trên nút "Gửi đơn" (vẫn xử lý phản ứng qua lỗi 409 `GUARD_FAILED` như AC-ORD-062, không đổi); nút "Thu hồi" và "Huỷ đơn" ở `OrderDetailTabs` (đơn không còn DRAFT — M3-03b, không đổi).

## 3. Acceptance Criteria
Dữ liệu mẫu: Hoa (SALE) NV005; khách `KH00001` "Cty Sáng Tạo Mới" SĐT `0909123456`; sản phẩm `LCD-DELL22`.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-158 | Hoa mở `/orders/new`, chưa chọn khách, chưa có dòng hàng | xem nút "Lưu nháp" | disabled (`aria-disabled="true"`, không phải CSS làm mờ không khai báo); dưới nút hiện helper text "Cần chọn khách hàng và thêm ít nhất 1 dòng hàng để lưu đơn." | component |
| AC-ORD-159 | Hoa đã chọn khách `KH00001`, chưa có dòng hàng nào | xem nút "Lưu nháp" | vẫn disabled; helper text thu hẹp còn "Cần thêm ít nhất 1 dòng hàng." | component |
| AC-ORD-160 | Hoa chưa chọn khách, đã có 1 dòng hàng (do thêm dòng tự động `POST /orders` ngầm theo giả định M3-02b §8) | xem nút "Lưu nháp" | vẫn disabled; helper text "Cần chọn khách hàng." | component |
| AC-ORD-161 | Hoa đã chọn khách `KH00001` (hoặc điền khách lẻ đủ `customer_name` + `customer_phone`) và có ≥1 dòng hàng | xem nút "Lưu nháp" | enabled, không còn helper text; bấm → hành vi như AC-ORD-034 (gọi `POST`/`PATCH`, toast "Đã lưu nháp {code}.") | component + e2e |
| AC-ORD-162 | Đơn đang đủ điều kiện (khách + 1 dòng), nút "Lưu nháp" đang enabled | Hoa xoá dòng hàng duy nhất | nút "Lưu nháp" chuyển về disabled **ngay trên UI** (tính theo state client, không cần gọi lại API để biết); helper text hiện lại "Cần thêm ít nhất 1 dòng hàng." | component |
| AC-ORD-163 | Hoa ở `/orders/{id}`, đơn DRAFT, `allowed_commands=["submit","cancel"]`, đơn còn thiếu khách hoặc dòng hàng | xem nút "Gửi đơn" cạnh "Lưu nháp" | disabled theo đúng điều kiện ở AC-ORD-158/159/160 (dùng chung logic với "Lưu nháp"); cùng helper text | component |
| AC-ORD-164 | Đơn DRAFT đủ điều kiện (khách + ≥1 dòng), `allowed_commands` **không** có `submit` (vd role/trạng thái không cho) | xem nút "Gửi đơn" | không hiện nút (giữ nguyên hành vi cũ của M3-03b — `allowed_commands` vẫn là điều kiện hiện/ẩn nút, M10-02 chỉ thêm điều kiện enable khi nút đã hiện) | component |
| AC-ORD-165 | Hoa bấm "+ Khách lẻ", chỉ điền `customer_name`, để trống `customer_phone` | xem nút "Lưu nháp"/"Gửi đơn" (đã có ≥1 dòng hàng) | vẫn disabled — khách lẻ chỉ hợp lệ khi có **cả** tên và SĐT (khớp `customer_present` ở `spec/state_machines.yaml` dùng cho server guard); helper text "Cần chọn khách hàng." | component |
| AC-ORD-166 | Màn `/orders/new`, iPhone 13 (390px) + 1440px, nút "Lưu nháp" đang disabled | so sánh layout | vùng chạm nút vẫn ≥ 44px (không co lại khi disabled); helper text không đẩy nút ra ngoài vùng nhìn thấy trên mobile (nằm trên nút sticky, không che khuất); axe 0 serious/critical cho trạng thái disabled (không thiếu `aria-disabled`) | e2e |
| AC-ORD-167 | Hoa mở `/orders/new`, bấm "Thêm dòng hàng" (tạo nháp ngầm qua `POST /orders` theo M3-02b §8) nhưng **chưa bấm "Lưu nháp"** lần nào trong phiên này | xem nút "Huỷ đơn" (đã hiện vì server đã trả `allowed_commands` có `cancel`) | disabled (`aria-disabled="true"`) — việc server tạo nháp ngầm không tính là "đã lưu" theo cảm nhận người dùng; bấm vào không mở sheet nhập lý do huỷ | component |
| AC-ORD-168 | Nối tiếp AC-ORD-167: Hoa bấm "Lưu nháp" và thành công (toast "Đã lưu nháp…") | xem lại nút "Huỷ đơn" | chuyển sang enabled ngay trên UI (không cần tải lại trang) | component |
| AC-ORD-169 | Hoa mở `/orders/{id}` của một đơn nháp **đã lưu từ phiên trước** (vào từ danh sách đơn, chưa thao tác gì trong phiên hiện tại) | xem nút "Huỷ đơn" | enabled ngay — không yêu cầu bấm lại "Lưu nháp" trong phiên này, vì đơn này chắc chắn đã lưu thật (khác AC-ORD-167, nơi nháp mới được tạo ngầm trong chính phiên đang mở) | component |

## 4. API
Không có API/route mới, không đổi `spec/state_machines.yaml`. Dùng lại toàn bộ endpoint của `M3-02a`/`M3-03a`. Guard server (`customer_present`, `has_lines_or_description`, `service_address_present`) giữ nguyên vai trò là lớp bảo vệ thứ hai (vd nếu client tính sai hoặc có race condition).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Điều kiện enable dùng chung cho cả 2 nút trong `DraftOrderForm`: `hasCustomer && lineCount >= 1`, trong đó `hasCustomer` = đã chọn khách có sẵn (`customer_id`) **hoặc** khách lẻ có cả `customer_name` và `customer_phone` (non-empty sau trim).
- Tính hoàn toàn ở client từ state hiện có của form (khách đã chọn + số dòng hàng trong bảng) — không gọi thêm API để kiểm tra.
- Helper text đặt ngay dưới nút, màu `muted-foreground`, động theo phần còn thiếu:
  - thiếu cả 2: "Cần chọn khách hàng và thêm ít nhất 1 dòng hàng để lưu đơn."
  - chỉ thiếu khách: "Cần chọn khách hàng."
  - chỉ thiếu dòng hàng: "Cần thêm ít nhất 1 dòng hàng."
  - đủ điều kiện: ẩn helper text.
- Nút disabled dùng `disabled` + `aria-disabled="true"`, giữ nguyên kích thước/vùng chạm (không co lại), không dùng tooltip-on-hover làm kênh giải thích duy nhất (mobile không hover được).
- Cập nhật `docs/specs/M3-02b-draft-orders-ui.md` AC-ORD-024: bỏ cụm "nút 'Lưu nháp' luôn hiện" (thay bằng ghi chú trỏ sang AC-ORD-158..162 của item này — gạch ngang phần cũ, không xoá dòng, theo quy ước "ID không bao giờ đổi/tái sử dụng").
- **(amendment)** Điều kiện enable "Huỷ đơn" (`DraftOrderForm`, không đổi nút "Huỷ đơn"/"Thu hồi" ở `OrderDetailTabs`): `openedExistingOrder || savedOnce`. `"/orders/new"` và `"/orders/:id"` dùng chung 1 route/1 instance component (xem `routes.tsx`) để giữ state khi tạo nháp ngầm — nên **không** dùng trực tiếp prop `orderId` (nó đổi từ `undefined` sang id thật ngay trong đời sống component khi `createDraft()` điều hướng, dù chưa ai bấm "Lưu nháp"). `openedExistingOrder` chụp giá trị `Boolean(orderId)` một lần duy nhất lúc mount (`useState(() => Boolean(orderId))`) — `true` nếu trang được mở thẳng từ `/orders/{id}` có sẵn, `false` nếu bắt đầu từ `/orders/new`. `savedOnce` là cờ client-side (`useState(false)`), chỉ chuyển `true` trong `onSave` sau khi `createOrder`/`updateOrder` thành công (không reset lại). Việc tạo nháp ngầm qua "Thêm dòng hàng" (`createDraft()` gọi từ `runWriteOrCreate`) không set cờ này. Nút vẫn chỉ *hiện* theo đúng điều kiện cũ (`allowed_commands` có `cancel`); amendment này chỉ thêm điều kiện *enable* khi nút đã hiện.

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập Hoa (SALE) → "Tạo đơn mới" → thấy "Lưu nháp" xám, có chữ nhỏ giải thích.
2. Chọn khách `KH00001` → chữ giải thích đổi thành "Cần thêm ít nhất 1 dòng hàng."; thêm 1 dòng `LCD-DELL22` → nút sáng lên, bấm được.
3. Xoá dòng vừa thêm → nút xám lại ngay, không cần tải lại trang.
4. Lưu nháp xong (đơn đã ở `/orders/{id}`, status DRAFT) → thấy nút "Gửi đơn" cạnh "Lưu nháp", cùng theo quy tắc trên.

## 8. Giả định & câu hỏi
- Giả định: quy tắc "khách hàng + ≥1 dòng hàng" (theo đúng chữ trong `BACKLOG.md`) áp dụng **giống nhau** cho cả "Lưu nháp" và "Gửi đơn" ở tầng client, dù guard server thật của lệnh `submit` (`has_lines_or_description`) cho phép thay dòng hàng bằng mô tả công việc. Nghĩa là: một đơn chỉ có mô tả công việc (không có dòng hàng nào) vẫn **không** bật được nút ở client theo rule mới, dù server sẽ chấp nhận nếu gọi API trực tiếp. Chọn theo đúng câu chữ backlog vì đây là phản hồi UAT cụ thể của chủ dự án, không cần hỏi lại — nhưng ghi rõ ở đây để chủ dự án duyệt lại nếu ý thật là "khách + (dòng HOẶC mô tả)" khớp hệt guard server.
- Không có câu hỏi mới cần thêm vào `OPEN_QUESTIONS.md` — giả định trên lấy trực tiếp từ câu chữ backlog, chủ dự án duyệt spec là xác nhận.
