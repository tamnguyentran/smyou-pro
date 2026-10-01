# M3-04b — Sửa liên hệ & dòng hàng sau khi gửi: Giao diện

- **Status:** Approved
- **Backlog:** M3-04b (tách từ M3-04) · **Milestone:** M3
- **Liên quan:** `M3-04a-order-post-submit-edits-api.md` (API dùng ở item này: `PATCH /orders/{id}/contact`, `POST/PATCH/POST.../lines-after-submit*`, 2 cờ `can_edit_contact`/`can_edit_lines_after_submit` trên `GET /orders/{id}`); `M3-03b-order-list-detail-ui.md` (`OrderDetailTabs`/`OrderInfoTab`/`OrderLinesSection`/`OrderHistoryTab` đã có — item này bật khả năng sửa trên các component đó khi 2 cờ `true`, thay vì viết trang mới); `M3-02b-draft-orders-ui.md` (`AddLineSheet`, `OrderLineRow` canEdit=true — tái dùng nguyên UI, đổi endpoint đích); `docs/design/UI_GUIDELINES.md` §6 (`Sheet` = bottom sheet mobile/modal desktop, toast, banner "Tải lại" cho `STALE_VERSION`); `spec/permissions.yaml` (`order.edit_contact`, `order.edit_lines_after_submit`: MANAGER all/SALE own); `docs/product/OPEN_QUESTIONS.md` Q57 (6 trường liên hệ, trạng thái áp dụng — đã chốt ở M3-04a)

## 1. Mục tiêu
Là Nhân viên kinh doanh (đơn của mình) hoặc Quản lý chung (mọi đơn), trên trang chi tiết đơn đã gửi, tôi muốn sửa lại thông tin liên hệ và sửa/thêm/xoá dòng hàng ngay tại đó — giống hệt thao tác lúc còn Nháp — mà không cần gọi API thủ công, và các vai trò không có quyền này tiếp tục chỉ xem được (chỉ đọc) như hiện tại.

## 2. Phạm vi
- **Trong phạm vi:**
  - Tab "Thông tin" (`OrderInfoTab`, trong `OrderDetailTabs`): khi `can_edit_contact=true`, thêm nút "Sửa liên hệ" mở `Sheet` (bottom sheet mobile / modal desktop) chứa form 6 trường (`customer_name`, `customer_phone`, `customer_email`, `customer_tax_code`, `service_address`, `work_description`) điền sẵn giá trị hiện tại; "Lưu" gọi `PATCH /orders/{id}/contact`.
  - Tab "Dòng hàng" (`OrderLinesSection`, trong `OrderDetailTabs`): khi `can_edit_lines_after_submit=true`, bật `canEdit=true` (nút "Thêm dòng hàng" mở `AddLineSheet`, mỗi dòng sửa được số lượng/đơn giá/VAT/giảm giá/tặng kèm, nút xoá dòng) — **y hệt** UI đã có ở `DraftOrderForm` (M3-02b), chỉ đổi 3 route đích thành `.../lines-after-submit*` thay vì `.../lines*`.
  - Khi 1 trong 2 cờ (hoặc cả hai) là `false` (sai vai trò, sai scope, hoặc đơn đang `DRAFT`/`COMPLETED`/`CANCELLED`): giữ nguyên hành vi chỉ đọc hiện tại — không có gì đổi với các vai trò/trạng thái đó.
  - Tab "Lịch sử" (`OrderHistoryTab`): thêm nhãn tiếng Việt cho 4 hành động audit mới từ M3-04a (`edit_contact`, `add_line_after_submit`, `update_line_after_submit`, `remove_line_after_submit`) vào `COMMAND_LABELS` — hiện đang fallback hiện nguyên action tiếng Anh.
  - Xử lý lỗi: validate client-side (SĐT, email) trước khi gửi; lỗi field 422 từ server map vào đúng ô (tái dùng `fieldErrors`); `409 STALE_VERSION` dùng lại banner "Tải lại" đã có ở `OrderDetailTabs`.
- **Ngoài phạm vi (để lại milestone sau):**
  - Guard liên quan `tasks` (M4) — ngoài phạm vi của cả M3-04a/b.
  - Đổi hành vi của `DraftOrderForm` khi `status="DRAFT"` — không đổi (dùng form nháp hiện có của M3-02b).
  - Xây dựng cờ/khả năng mới trên API — tái dùng nguyên những gì M3-04a đã cung cấp, không sửa backend.

## 3. Acceptance Criteria
Dữ liệu mẫu — như M3-04a: **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]; **Hà** NV007 [SALE khác]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN].
"**Đơn A**": tạo bởi Hoa, đã `submit` → `status="PENDING_DISPATCH"`, `customer_name="Cty Sáng Tạo Mới"`, `customer_phone="0909123456"`, `customer_email=null`, `customer_tax_code=null`, `service_address="12 Lê Lợi, Q1"`, `work_description="Lắp 2 màn hình"`, 1 dòng `LCD-DELL22` quantity=2 (`line_total=5400000`), `can_edit_contact=true`, `can_edit_lines_after_submit=true` cho Hoa/An.

### Sửa liên hệ (tab "Thông tin")

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-093 | Hoa ở `/orders/{id}` (Đơn A), tab "Thông tin" | thấy nút "Sửa liên hệ" (icon bút) cạnh tiêu đề tab → bấm | `Sheet` "Sửa liên hệ" mở, form điền sẵn 6 trường hiện tại; sửa `customer_phone` → `"0988777666"`, `service_address` → `"20 Nguyễn Huệ, Q1"` → bấm "Lưu" | gọi `PATCH /orders/{id}/contact {version, customer_phone:"0988777666", service_address:"20 Nguyễn Huệ, Q1", ...5 trường còn lại}`; 200 → sheet đóng, toast "Đã cập nhật liên hệ."; tab "Thông tin" hiện ngay giá trị mới | component + e2e |
| AC-ORD-094 | Hoa mở Sheet "Sửa liên hệ" | gõ `customer_phone="123"` (sai định dạng) rồi rời ô; gõ `customer_email="abc"` (sai định dạng) rồi rời ô | lỗi tiêu đề ô tương ứng: "Số điện thoại cần 10 chữ số, bắt đầu bằng 0." / "Email không hợp lệ."; nút "Lưu" vô hiệu tới khi sửa đúng; **chưa** gọi API | component |
| AC-ORD-095 | Hà (SALE khác, `can_edit_contact=false`) mở Đơn A; Tuấn (TECH_LEAD, `can_edit_contact=false`) mở Đơn A; An (MANAGER) mở 1 đơn khác seed `status="COMPLETED"` (`can_edit_contact=false` vì trạng thái) | xem tab "Thông tin" | cả 3 trường hợp: **không** có nút "Sửa liên hệ"; các trường vẫn hiện (chỉ đọc) như M3-03b | component |
| AC-ORD-096 | Hoa đang mở Sheet "Sửa liên hệ" Đơn A (sheet đã lấy `version=V` lúc mở); một actor khác vừa sửa đơn trước đó khiến `version` thực tế là `V+1` | Hoa sửa `customer_phone` rồi bấm "Lưu" | `PATCH` trả `409 STALE_VERSION` → sheet hiện banner đỏ "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại"; bấm "Tải lại" → đóng sheet, `GET /orders/{id}` tải lại (mất nội dung đang sửa dở, giống mẫu `CancelOrderSheet`/AC-ORD-070) | component |
| AC-ORD-097 | Hoa sửa `customer_email` thành chuỗi vượt quá độ dài cho phép của server (422 field error) | bấm "Lưu" | `422` → lỗi hiện đúng dưới ô `customer_email` (tái dùng `fieldErrors`); sheet không đóng, các trường khác giữ nguyên giá trị đã nhập | component |

### Sửa/thêm/xoá dòng sau khi gửi (tab "Dòng hàng")

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-098 | An ở `/orders/{id}` (Đơn A), tab "Dòng hàng" (`can_edit_lines_after_submit=true`) | thấy nút "Thêm dòng hàng" + mỗi dòng có ô sửa số lượng/đơn giá/VAT/giảm giá + nút xoá (y hệt `DraftOrderForm`) → bấm "Thêm dòng hàng" → chọn sản phẩm `PC-I5-12400` | `AddLineSheet` mở (3 tab Sản phẩm/Dịch vụ/Tự do); bấm chọn → `POST /orders/{id}/lines-after-submit {...}`; 201 → sheet đóng, dòng mới xuất hiện trong danh sách, tổng tiền cộng thêm | component + e2e |
| AC-ORD-099 | Tiếp AC-ORD-098, dòng `LCD-DELL22` quantity=2 | An sửa ô "Số lượng" dòng đó thành `3`, rời ô | `PATCH /orders/{id}/lines-after-submit/{line_id} {version, quantity:3}`; 200 → `line_total` dòng và tổng đơn cập nhật ngay (không cần tải lại trang) | component |
| AC-ORD-100 | Tiếp AC-ORD-099 | An bấm nút xoá dòng `LCD-DELL22` → `ConfirmDialog` "Xoá dòng Màn hình Dell 22 inch? Không thể hoàn tác." → xác nhận | `POST /orders/{id}/lines-after-submit/{line_id}/remove`; 200 → dòng biến mất, tổng đơn giảm đúng, toast "Đã xoá dòng hàng." | component |
| AC-ORD-101 | Hà (SALE khác, `can_edit_lines_after_submit=false`) mở Đơn A; Tuấn (TECH_LEAD) mở Đơn A; An mở 1 đơn khác seed `status="COMPLETED"` | xem tab "Dòng hàng" | cả 3 trường hợp: danh sách dòng chỉ đọc — **không** có nút "Thêm dòng hàng", **không** có ô sửa/nút xoá trên từng dòng (giống AC-ORD-066 của M3-03b) | component |
| AC-ORD-102 | An ở tab "Dòng hàng" Đơn A, bấm "Thêm dòng hàng" → tab "Tự do" → nhập tên, số lượng, đơn giá nhưng **không** chọn VAT (gửi thiếu/`vat_rate` rỗng, nếu form cho phép bỏ trống) | bấm "Thêm" | `422 VAT_REQUIRED_FOR_CUSTOM` → lỗi hiện trong `Alert` đầu sheet (giống `CustomLineForm` ở M3-02b); sheet vẫn mở, dữ liệu đã nhập không mất | component |
| AC-ORD-103 | An đang sửa số lượng 1 dòng ở Đơn A; một actor khác vừa đổi `version` của đơn trước đó | An rời ô số lượng (trigger `PATCH lines-after-submit`) | `409 STALE_VERSION` → banner đỏ "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" ngay trên tab "Dòng hàng" (tái dùng cơ chế đã có ở `OrderDetailTabs` cho `recall`/`cancel`) | component |

### Tab "Lịch sử" — nhãn hành động mới

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-104 | Đơn A có 4 audit event từ M3-04a: `edit_contact`, `add_line_after_submit`, `update_line_after_submit`, `remove_line_after_submit` | Hoa mở tab "Lịch sử" | mỗi dòng hiện badge nhãn tiếng Việt: "Sửa liên hệ", "Thêm dòng hàng", "Sửa dòng hàng", "Xoá dòng hàng" (không còn hiện nguyên tên hành động tiếng Anh) | component |

### Mobile vs desktop

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-105 | `/orders/{id}` (Đơn A), iPhone 13 (390px) + 1440px | mở Sheet "Sửa liên hệ" và `AddLineSheet` ở cả hai kích thước | mobile: sheet trượt từ đáy, chiếm toàn chiều rộng, nút "Lưu"/"Thêm" dính đáy sheet; desktop: hiện dạng modal giữa màn hình; không cuộn ngang toàn trang ở 360px; nút "Sửa liên hệ" không che nút "Thu hồi"/"Huỷ đơn" ở header | component + e2e |

## 4. API
Không có route mới — dùng lại `M3-04a-order-post-submit-edits-api.md` (`PATCH /orders/{id}/contact`; `POST/PATCH/POST .../lines-after-submit*`; `GET /orders/{id}` + `can_edit_contact`/`can_edit_lines_after_submit`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `OrderInfoTab`: thêm nút "Sửa liên hệ" (icon `Pencil`, `aria-label="Sửa liên hệ"` nếu chỉ icon trên mobile) ở góc phải tiêu đề tab, hiện khi `order.can_edit_contact`. Không thêm vào thanh hành động sticky ở header (đã dành cho "Thu hồi"/"Huỷ đơn") vì đây không phải hành động phá huỷ.
- Form "Sửa liên hệ" dùng component `Sheet` có sẵn (bottom sheet mobile/modal desktop — UI_GUIDELINES §6); 6 trường dùng `TextField`/`Textarea` theo đúng nhãn: "Tên khách hàng", "Số điện thoại", "Email", "Mã số thuế", "Địa chỉ thi công", "Mô tả công việc"; validate SĐT/email client-side tái dùng pattern `customers/schemas.ts` (`phoneValid`, `z.email()`); nút "Lưu" loading + disable chống bấm đôi (UI_GUIDELINES §6).
- `OrderLinesSection`/`OrderLineRow`/`AddLineSheet` (đã có từ M3-02b): tổng quát hoá để nhận tham số chọn nhóm endpoint đích (`lines` khi `DRAFT`, `lines-after-submit` khi `can_edit_lines_after_submit`) — không viết lại UI, chỉ đổi hook gọi API bên trong; `canEdit` của `OrderDetailTabs` khi hiện tab "Dòng hàng" chuyển từ hằng `false` sang `order.can_edit_lines_after_submit`.
- `OrderHistoryTab`/`orderStatus.ts`: thêm 4 khoá vào `COMMAND_LABELS` — `edit_contact: "Sửa liên hệ"`, `add_line_after_submit: "Thêm dòng hàng"`, `update_line_after_submit: "Sửa dòng hàng"`, `remove_line_after_submit: "Xoá dòng hàng"`.
- Toast thành công: "Đã cập nhật liên hệ." (sửa liên hệ); các toast dòng hàng tái dùng nguyên văn đã có ("Đã xoá dòng hàng." …).
- `STALE_VERSION`: tái dùng đúng banner "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" đã code ở `OrderDetailTabs` (AC-ORD-070 của M3-03b).

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập Sale; mở 1 đơn đã gửi (`PENDING_DISPATCH`) của mình → tab "Thông tin" → bấm "Sửa liên hệ" → đổi SĐT → "Lưu" → thấy toast + giá trị mới.
2. Tab "Dòng hàng" → "Thêm dòng hàng" → chọn 1 sản phẩm → thấy dòng mới + tổng tiền cập nhật; sửa số lượng dòng đó → tổng tiền đổi theo; bấm xoá dòng → xác nhận → dòng biến mất.
3. Tab "Lịch sử" → thấy đủ 3 sự kiện vừa làm với nhãn tiếng Việt ("Sửa liên hệ", "Thêm dòng hàng", "Sửa dòng hàng", "Xoá dòng hàng").
4. Đăng nhập bằng tài khoản Sale khác (không phải chủ đơn) mở lại đơn trên → xác nhận không thấy nút "Sửa liên hệ" và tab "Dòng hàng" không có nút thêm/sửa/xoá.

## 8. Giả định & câu hỏi
- Không có câu hỏi nghiệp vụ mới — toàn bộ quyết định (6 trường, trạng thái áp dụng, scope) đã chốt ở Q57/M3-04a; item này chỉ là lớp giao diện chiếu theo 2 cờ `can_edit_contact`/`can_edit_lines_after_submit` đã có sẵn trên `GET /orders/{id}` (CLAUDE.md quy tắc 4 — FE không tự suy luận quyền).
- Giả định kỹ thuật: tổng quát hoá `OrderLinesSection`/`OrderLineRow`/`AddLineSheet` để dùng chung giữa chế độ `DRAFT` (endpoint `lines`) và chế độ sau-khi-gửi (endpoint `lines-after-submit`) thay vì viết 2 bộ component song song — chi tiết cách tổng quát hoá (prop/callback nào) là quyết định lúc code, không phải quyết định nghiệp vụ.
- Giả định: nút "Sửa liên hệ" đặt trong tab "Thông tin" (không phải header sticky) vì đây là sửa dữ liệu, không phải hành động chuyển trạng thái/phá huỷ như "Thu hồi"/"Huỷ đơn" — nếu chủ dự án muốn vị trí khác, nêu rõ lúc duyệt.
- Giả định: như M3-04a §8, `IN_PROGRESS`/`AWAITING_CONFIRMATION`/`REVISION` chưa tới được qua luồng thật (cần M4/M6); AC của item này chỉ cần kiểm ở `PENDING_DISPATCH`/`COMPLETED` (seed DB) — hành vi UI không đổi khi các trạng thái kia tới được qua API thật.
- Không có đề xuất thay đổi `spec/*.yaml` nào ở item này.
