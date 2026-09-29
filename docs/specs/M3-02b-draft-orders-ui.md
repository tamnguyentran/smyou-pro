# M3-02b — Đơn nháp + dòng hàng + tính tiền: giao diện

- **Status:** Approved
- **Backlog:** M3-02b · **Milestone:** M3
- **Liên quan:** `M3-02a-draft-orders-api.md` (API dùng ở item này); `docs/design/UI_GUIDELINES.md` §5 hàng "Tạo/sửa đơn" (mô tả thiết kế màn hình — nguồn chính cho item này); `spec/permissions.yaml` menu `order-new` (`order.create`, path `/orders/new`, đã khai ở M1-03a nhưng route hiện là trang giữ chỗ); M3-01 (trang Khách hàng — tái dùng cách tìm/tạo nhanh khách); M2-01b/M2-02 (mẫu Sheet chọn item từ danh mục)

## 1. Mục tiêu
Là Nhân viên kinh doanh, tôi mở trang "Tạo đơn", chọn/tạo nhanh khách hàng, thêm các dòng sản phẩm/dịch vụ/tự do, thấy tổng tiền cập nhật ngay khi nhập, để lập một đơn nháp chính xác trước khi gửi đi điều phối (gửi đơn thuộc M3-03, ngoài phạm vi item này).

## 2. Phạm vi
- **Trong phạm vi:** trang `/orders/new` (tạo đơn — thay trang giữ chỗ hiện tại) và `/orders/:id` (mở lại đúng đơn DRAFT vừa tạo để sửa tiếp, dùng chung component với trang tạo); form thông tin đơn; bảng/danh sách dòng hàng có thêm/sửa/xoá; ô tìm sản phẩm/dịch vụ để thêm dòng; dòng tự do (CUSTOM); công tắc "Tặng kèm"; ô giảm giá; chip chọn nhanh VAT; khoá ô đơn giá khi giá cố định; tổng tiền hiển thị theo từng mức VAT; toast/lỗi 422/409.
- **Ngoài phạm vi:** nút "Gửi đơn" và mọi hành động chuyển trạng thái (M3-03); trang danh sách đơn (`/orders`, vẫn là trang giữ chỗ); tab Đầu việc/Tệp đính kèm/Lịch sử của chi tiết đơn (M3-03); `/orders/:id` khi đơn **không** còn `DRAFT` (M3-03 sẽ thay bằng trang chi tiết đầy đủ — item này chỉ cần hiện thông báo "Đơn đã được gửi, không thể sửa ở đây." + nút quay lại danh sách nếu người dùng cố mở URL cũ, không cần dựng UI đầy đủ).

## 3. Acceptance Criteria
Dữ liệu mẫu: **Hoa** NV005 [SALE]; khách `KH00001` "Cty Sáng Tạo Mới" SĐT `0909123456`; sản phẩm `LCD-DELL22` "Màn hình Dell 22 inch" giá 2.500.000, VAT 8%, giá cố định; sản phẩm `PC-I5-12400` "PC SMYOU CORE I5-12400" giá 11.980.000, VAT 0%, giá **không** cố định; dịch vụ `DV-BOMMUC` "Bơm mực máy in" giá 790.000, VAT 8%, giá cố định.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-024 | Hoa đã đăng nhập, trên máy tính/điện thoại | mở menu "Đơn hàng" → "Tạo đơn mới" (hoặc bấm nút "+" ở thanh dưới đáy trên mobile) | vào `/orders/new`; form: chọn khách (ô tìm autocomplete theo tên/SĐT/MST như trang Khách hàng, hoặc "+ Khách lẻ" nhập tay `customer_name`+`customer_phone`), `division` (select, không bắt buộc), `service_address`, `work_description` (textarea), `priority` (chip LOW/NORMAL/HIGH/URGENT, mặc định NORMAL), `requested_date` (date picker); khu vực "Dòng hàng" rỗng với CTA "Thêm dòng hàng"; nút "Lưu nháp" luôn hiện, dính đáy trên mobile | component + e2e |
| AC-ORD-025 | Hoa đang ở `/orders/new`, đã gõ vài trường | gõ tên khách `sáng tạo` vào ô tìm khách (đợi 300ms) | hiện danh sách gợi ý (dùng lại `GET /customers?q=`), chọn `KH00001` → điền sẵn SĐT/địa chỉ hiển thị dưới ô (chỉ để tham khảo, không phải input); bấm "+ Khách lẻ" thay vào đó → ô tìm ẩn đi, hiện 2 ô nhập `customer_name`, `customer_phone` | component + e2e |
| AC-ORD-026 | Hoa đang ở `/orders/new`, đã chọn khách `KH00001` | bấm "Thêm dòng hàng" → chọn tab "Sản phẩm", gõ "dell" vào ô tìm (300ms debounce, dùng `GET /products?q=`) | hiện `LCD-DELL22` trong danh sách kết quả (ảnh nhỏ + tên + giá + badge "Giá cố định" nếu có); chọn → dòng được thêm vào bảng dòng hàng ngay (gọi `POST /orders/{id}/lines`; nếu đơn chưa có `id`, gọi `POST /orders` trước để lấy nháp rồi mới thêm dòng, trong suốt với người dùng — chỉ 1 vòng loading) | component + e2e |
| AC-ORD-027 | Đơn đã có dòng `LCD-DELL22` (giá cố định) | xem dòng trong bảng | ô "Đơn giá" hiển thị `2.500.000 ₫`, `readonly` + icon `Lock` + tooltip "Giá cố định"; ô "Giảm giá" và công tắc "Tặng kèm" vẫn bấm/sửa được; đổi số lượng → tổng dòng cập nhật **ngay** trên UI (tính tạm ở client), sau đó đồng bộ với số server trả về khi lưu (không lệch) | component |
| AC-ORD-028 | Đơn đã có dòng `PC-I5-12400` (giá không cố định, VAT 0%) | sửa "Giảm giá" thành `180.000`, đổi VAT sang `0%` (đã mặc định) | dòng: gộp `11.980.000 − 180.000 = 11.800.000 ₫`, VAT `0 ₫`; bấm chip VAT "8%" → cập nhật lại tổng dòng theo 8%; bấm "Khác" → mở ô nhập số (0–100, tối đa 2 chữ số thập phân), nhập sai → lỗi zod ngay dưới ô | component |
| AC-ORD-029 | Hoa bật công tắc "Tặng kèm" trên dòng `LCD-DELL22` | xem lại dòng | ô "Đơn giá" hiển thị `0 ₫`, bị khoá (dù giá cố định hay không); "Giảm giá" tự ẩn/disable vì không còn ý nghĩa với dòng 0đ; nhãn "Tặng kèm" hiện cạnh tên dòng trong bảng | component |
| AC-ORD-030 | Hoa bấm "Thêm dòng hàng" → tab "Tự do" | điền tên "Công tháo dỡ tủ mạng cũ", đơn vị "Lần", số lượng 1, đơn giá 500.000, chọn VAT 10% | dòng thêm vào loại `CUSTOM`, không có badge "Giá cố định"; đơn giá sửa được tự do | component + e2e |
| AC-ORD-031 | Đơn có 2 dòng: `LCD-DELL22` VAT 8% (tổng dòng 5.400.000) và `DV-BOMMUC` VAT 8% (tổng dòng 853.200) | xem cuối trang | bảng tổng theo mức VAT: "Tiền hàng chịu VAT 8%: 5.790.000 ₫ · VAT 8%: 463.200 ₫"; dòng "Tổng cộng: **6.253.200 ₫**" in đậm `tabular-nums`; số khớp response `GET`/`POST` gần nhất (server tính, không phải cộng tay ở FE) | component |
| AC-ORD-032 | Đơn có 1 dòng | bấm icon xoá trên dòng đó | `ConfirmDialog` "Xoá dòng {tên}? Không thể hoàn tác." → xác nhận → gọi `POST /orders/{id}/lines/{line_id}/remove`, dòng biến mất, tổng về `0 ₫`, toast "Đã xoá dòng hàng." | component + e2e |
| AC-ORD-033 | Hoa điền dòng mới với số lượng `0` hoặc để trống đơn giá | bấm "Thêm" trong sheet chọn dòng | zod chặn trước khi gọi API, lỗi tiếng Việt dưới đúng ô ("Số lượng phải lớn hơn 0."); server trả 422 (vd `PRICE_FIXED`, `DISCOUNT_EXCEEDS_GROSS`, `ITEM_INACTIVE`) → hiện dưới đúng ô tương ứng, không mất dữ liệu đã nhập trong sheet | component |
| AC-ORD-034 | Hoa đã điền đủ thông tin + ≥1 dòng | bấm "Lưu nháp" | gọi `POST /orders` (lần đầu) hoặc `PATCH /orders/{id}` (đã có id); thành công → toast "Đã lưu nháp {code}."; URL chuyển thành `/orders/{id}` (không tạo đơn trùng nếu bấm Lưu nháp nhiều lần sau đó — chỉ `PATCH`); nút "Lưu nháp" disable + spinner trong lúc gọi, chống bấm đôi | component + e2e |
| AC-ORD-035 | Đang sửa đơn ở `/orders/{id}`, có người khác (hoặc tab khác) vừa lưu trước | bấm "Lưu nháp" | 409 `STALE_VERSION` → banner đỏ "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" (gọi lại `GET /orders/{id}`, mất thay đổi chưa lưu — có cảnh báo trước khi tải lại nếu đang có input dở) | component |
| AC-ORD-036 | Mở trực tiếp `/orders/{id}` với đơn đã seed `status="PENDING_DISPATCH"` (không phải DRAFT) | tải trang | không hiện form sửa; hiện thông báo "Đơn {code} đã được gửi, không thể sửa ở đây." + nút "Về Tổng quan"; không gọi `PATCH`/thêm dòng nào | component |
| AC-ORD-037 | Hà (SALE khác, không phải chủ đơn) mở `/orders/{id}` của đơn Hoa vừa tạo | tải trang | xem được toàn bộ thông tin + dòng hàng (chỉ đọc — `order.read` scope `all`) nhưng **không** có nút Thêm dòng/Sửa/Xoá/Lưu nháp (vì `order.edit_draft` scope `own`, không phải Hà); An (MANAGER) mở cùng đơn → đầy đủ quyền sửa như Hoa | component + e2e |
| AC-ORD-038 | Màn `/orders/new` và `/orders/{id}`, iPhone 13 (390px) + 1440px | so sánh layout | mobile: form 1 cột, các section thu gọn (accordion) trừ "Dòng hàng"; bảng dòng hàng hiển thị dạng thẻ (tên + tổng dòng nổi bật, còn lại gọn trong thẻ, vuốt/bấm để sửa/xoá); "Lưu nháp" dính đáy (`sticky bottom-0`); desktop: form 2 cột (thông tin trái, dòng hàng + tổng bên phải hoặc bảng full-width bên dưới), bảng dòng hàng dạng table | component + e2e |
| AC-ORD-039 | Các màn trên | E2E: tạo đơn có khách có sẵn + 1 dòng giá cố định + 1 dòng tự do + giảm giá, lưu nháp, mở lại | axe 0 serious/critical; không cuộn ngang 360px; vùng chạm ≥ 44px; ảnh `order-new.png`, `order-lines.png` (390px và 1440px) | e2e |

## 4. API
Không có API mới — dùng toàn bộ endpoint của `M3-02a-draft-orders-api.md`, cộng `GET /customers`, `GET /products`, `GET /services` (đã có, `catalog.read`/`customer.read`) cho các ô tìm kiếm.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Route `/orders/new`: tạo mới, chưa có `id` cho tới khi lưu lần đầu. Route `/orders/:id`: mở lại đúng đơn (chỉ khi `status=DRAFT`, theo AC-ORD-036). Cùng 1 component `DraftOrderForm`.
- Section 1 — Thông tin đơn: khách hàng (autocomplete hoặc "+ Khách lẻ"), `division`, `service_address`, `work_description`, `priority` (chip), `requested_date`.
- Section 2 — Dòng hàng: nút "Thêm dòng hàng" mở `Sheet` 3 tab (Sản phẩm / Dịch vụ / Tự do — icon `Package`/`Hammer`/`PenLine`), mỗi dòng trong bảng có: tên (+ badge "Giá cố định" `Lock`, "Tặng kèm"), số lượng (input số), đơn giá (readonly nếu giá cố định và không phải quà tặng), VAT (chip 0/8/10/Khác), giảm giá (input tiền), tổng dòng (`tabular-nums font-semibold`), icon xoá (`Trash2`).
- Section 3 — Tổng tiền: bảng nhóm theo mức VAT + dòng "Tổng cộng" in đậm.
- Nút "Lưu nháp" (Primary, sticky đáy mobile / trong section 1 trên desktop).
- Copy tiếng Việt: "Thêm dòng hàng", "Khách lẻ", "Giá cố định", "Tặng kèm", "Lưu nháp", toast "Đã lưu nháp {code}.", "Đã xoá dòng hàng.", lỗi "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.", "Đơn {code} đã được gửi, không thể sửa ở đây.".
- Tiền: `Intl.NumberFormat('vi-VN')` + " ₫" theo UI_GUIDELINES.
- Sau item này: cập nhật nút "+" ở thanh điều hướng dưới đáy (mục backlog follow-up của M1-03b) từ trang giữ chỗ thành `Link` thường tới `/orders/new` thật (bỏ `aria-current` đặc biệt của trang giữ chỗ).

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập Hoa (SALE) → "Đơn hàng" → "Tạo đơn mới".
2. Chọn khách `KH00001`, thêm 1 dòng sản phẩm giá cố định, 1 dòng dịch vụ, 1 dòng tự do có giảm giá → kiểm tổng tiền hiện đúng theo từng mức VAT.
3. Bấm "Lưu nháp" → thấy toast + URL đổi sang `/orders/{id}`; tải lại trang → dữ liệu còn nguyên.
4. Đăng nhập Hà (SALE khác) → mở cùng URL → chỉ xem, không có nút sửa.

## 8. Giả định & câu hỏi
- Giả định: khi người dùng thêm dòng đầu tiên trên `/orders/new` mà đơn chưa từng lưu, FE tự gọi `POST /orders` ngầm (dùng dữ liệu section 1 hiện có, kể cả nếu còn thiếu) để có `id` trước khi gọi `POST .../lines` — người dùng chỉ thấy 1 trạng thái loading, không cần bấm "Lưu nháp" trước; nếu section 1 đổi sau đó, `PATCH` bình thường theo `version` mới nhất.
- Giả định: đóng tab/rời trang giữa chừng sau khi đã có `id` (đã lưu ít nhất 1 lần) không mất dữ liệu — đơn nháp vẫn nằm trong DB ở trạng thái `DRAFT`; chưa có trang danh sách (`/orders`) để tìm lại ở item này (M3-03), nên trong phiên UAT người dùng cần tự lưu lại URL `/orders/{id}` nếu muốn quay lại trước M3-03.
- Không có câu hỏi mới về giao diện — mọi quyết định UI đã có sẵn trong `UI_GUIDELINES.md` §5.
