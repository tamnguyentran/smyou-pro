# M11-02b — Lan style thẻ (bỏ viền, p-5) ra màn hình chi tiết đơn hàng

- **Status:** Approved
- **Backlog:** M11-02b · **Milestone:** M11
- **Liên quan:** `docs/design/UI_GUIDELINES.md` §1.1 (nguyên tắc card không viền, trừ bảng/input/thẻ tô màu trạng thái — đã chốt ở M11-01), `docs/specs/M11-02a-ui-card-style-list-pages.md` (mẫu đã duyệt, cùng khuôn mẫu). Không đụng `spec/*.yaml`, không đổi API/DB/phân quyền.

## 1. Mục tiêu
Là chủ dự án, tôi muốn các thẻ trong màn hình chi tiết đơn hàng (`/orders/:id` — các tab Thông tin, Đầu việc, Lịch sử, Tệp đính kèm) có cùng style "nổi bằng bóng mờ, không viền" như 5 trang danh sách đã sửa ở M11-02a, để toàn màn hình chi tiết nhất quán với phần còn lại của app.

## 2. Phạm vi
- Trong phạm vi — bỏ `border border-line`, giữ `shadow-card`/`hover:shadow-card-hover`, tăng `p-4` → `p-5` (trừ chỗ ghi riêng) ở đúng 5 vị trí:
  1. `frontend/src/features/orders/components/OrderDetailTabs.tsx` dòng ~219 — `<header>` sticky (mã đơn, badge trạng thái, tên khách, nút hành động).
  2. `frontend/src/features/orders/components/OrderInfoTab.tsx` dòng ~41 — khung `<dl>` thông tin đơn (dùng chung cho mobile và desktop, không có bảng riêng).
  3. `frontend/src/features/orders/components/OrderHistoryTab.tsx` dòng ~77 — mỗi `<li>` timeline lịch sử (dùng chung cho mọi viewport).
  4. `frontend/src/features/dispatch/components/OrderTasksTab.tsx` dòng ~113 — nút thẻ đầu việc mobile (giữ nguyên `<table>` desktop dòng ~55, đúng ngoại lệ "bảng").
  5. `frontend/src/features/orders/components/ConfirmationAttachmentsTab.tsx` dòng ~26 — thẻ ảnh phiếu xác nhận (`AttachmentCard`, lưới 2/4 cột dùng chung mọi viewport); **giữ `p-2`** (không đổi thành `p-5`) vì thẻ là khung ảnh vuông khít, không phải thẻ danh sách có nội dung chữ như 4 vị trí trên — xem giả định ở §8.
- **Không đụng**:
  - `<table>` desktop của `OrderTasksTab` (dòng ~55) — giữ `border border-line` theo ngoại lệ "bảng" ở UI_GUIDELINES §1.1.
  - Nút tab chuyển panel (`role="tab"` pill, `OrderDetailTabs.tsx` dòng ~292-295) — là bộ chọn dạng segmented control, không phải thẻ nội dung.
  - Label nút tải ảnh lên (`ConfirmationAttachmentsTab.tsx` dòng ~86) — là control dạng nút (giống `Button variant="secondary"` toàn app, cũng giữ `border border-line`), không phải thẻ.
  - Badge trạng thái, `Alert`, thanh progress tải ảnh.
- Ngoài phạm vi (làm ở item sau): điều phối (`DispatchQueueList`, `WorkloadList`), Việc của tôi (`MyAssignmentList`), KPI (`KpiRows`), Nhật ký (`AuditEventList`) → `M11-02c`; 3 trang form đơn lẻ → `M11-02d`.

## 3. Acceptance Criteria
> Thuần UI, không đổi API/quyền/trạng thái — không có AC 403/404/409/422. Kiểm chứng bằng class CSS render ra + test không-hồi-quy hiện có (component, e2e, lint).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-016 | `OrderDetailTabs` render đơn, bất kỳ viewport | render | `<header>` gốc có `shadow-card`, `p-5`; **không** có class `border`/`border-line`; nội dung (mã đơn, badge, tên khách, nút hành động) và hành vi nút giữ nguyên (không hồi quy AC-ORD-1xx liên quan thu hồi/huỷ/hoàn tất/chỉnh sửa) | component |
| AC-UI-017 | `OrderDetailTabs`, nút chuyển tab (`role="tab"`) | render | pill chọn tab **vẫn giữ** `border`/`border-line` khi không active (không đổi — không phải thẻ) | component (regression) |
| AC-UI-018 | `OrderInfoTab` render thông tin đơn, bất kỳ viewport | render | khung `<dl>` gốc có `shadow-card`, `p-5` (`lg:p-6` giữ nguyên); không còn `border`/`border-line`; nội dung từng dòng không đổi | component |
| AC-UI-019 | `OrderHistoryTab` render ≥1 sự kiện lịch sử, bất kỳ viewport | render | mỗi `<li>` timeline có `shadow-card`, `p-5`; không còn `border`/`border-line`; thứ tự và nội dung timeline không đổi | component |
| AC-UI-020 | `OrderTasksTab`, viewport mobile (< 1024px) | render | nút thẻ đầu việc gốc có `shadow-card`, `p-5`; không còn `border`/`border-line`; bấm vẫn mở `TaskEditSheet` đúng 1 lần (không hồi quy AC-DSP-028/036/058) | component |
| AC-UI-021 | `OrderTasksTab`, viewport desktop (≥ 1024px) | render | `<table data-testid="order-tasks">` gốc **vẫn giữ** `border border-line` (không đổi) | component (regression) |
| AC-UI-022 | `ConfirmationAttachmentsTab` render ≥1 ảnh phiếu xác nhận, bất kỳ viewport | render | `AttachmentCard` gốc có `shadow-card`; không còn `border`/`border-line`; vẫn giữ `p-2`; bấm vẫn mở ảnh gốc ở tab mới (không hồi quy AC-CMP-01x) | component |
| AC-UI-023 | `ConfirmationAttachmentsTab`, label nút "Tải ảnh phiếu xác nhận" khi `canUpload` | render | label **vẫn giữ** `border border-line` (không đổi — là control dạng nút) | component (regression) |
| AC-UI-024 | Trang chi tiết đơn ở 390px và 1440px, đủ 4 tab (e2e hiện có liên quan `/orders/:id`) | chạy lại sau khi sửa | không có vi phạm axe-core `serious`/`critical` mới; không hồi quy điều hướng tab/thu hồi/huỷ/hoàn tất/tạo-sửa đầu việc/tải ảnh đã có | e2e |
| AC-UI-025 | `scripts/check_no_raw_colors` | chạy sau khi sửa 5 file trên | 0 vi phạm mới | lint |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Mỗi vị trí chỉ đổi 1 class string của thẻ, theo đúng khuôn mẫu M11-01/M11-02a: bỏ `border border-line`, giữ nguyên `shadow-card`/`hover:shadow-card-hover`, `p-4` → `p-5` — trừ `AttachmentCard` giữ `p-2` (ảnh vuông khít, không phải thẻ nội dung chữ).
- Không đổi bố cục bên trong thẻ, không đổi copy, không đổi màu chữ/icon, không đổi hành vi bấm/điều hướng/mở sheet.
- `<table>` desktop của `OrderTasksTab`, nút tab pill, và label nút tải ảnh giữ nguyên hoàn toàn — nằm trong ngoại lệ "bảng"/"nút điều khiển" ở UI_GUIDELINES §1.1.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Mở chi tiết 1 đơn trên điện thoại (390px) — khung tiêu đề (mã đơn, trạng thái, tên khách, nút hành động) không còn viền kẻ, có bóng mờ nhẹ; nút chuyển tab vẫn có viền như cũ.
2. Tab "Thông tin" — khung thông tin đơn bỏ viền, bóng mờ nhẹ hơn trước.
3. Tab "Đầu việc" — mỗi thẻ đầu việc bỏ viền; bấm vào vẫn mở sheet sửa đầu việc như cũ.
4. Tab "Lịch sử" — mỗi dòng lịch sử bỏ viền.
5. Tab "Tệp đính kèm" — thẻ ảnh phiếu xác nhận bỏ viền ngoài khung ảnh; nút "Tải ảnh phiếu xác nhận" vẫn có viền như cũ. Mở lại cùng màn hình trên máy tính (1440px) — mọi thẻ trên vẫn không viền (không có bảng desktop riêng ở các tab này, trừ Đầu việc — bảng đầu việc vẫn giữ viền như cũ).

## 8. Giả định & câu hỏi
- Giả định: khác với M11-02a (có `<table>` desktop riêng cho cả 5 trang), ở đây chỉ `OrderTasksTab` có cặp bảng-desktop/thẻ-mobile; `OrderInfoTab`, `OrderHistoryTab`, `OrderDetailTabs` header dùng đúng 1 khối UI cho mọi viewport nên áp style bỏ viền cho mọi kích thước màn hình, không tách theo breakpoint.
- Giả định: `AttachmentCard` (`ConfirmationAttachmentsTab`) giữ nguyên `p-2` thay vì đổi thành `p-5` như các thẻ khác, vì đây là khung ảnh vuông lấp đầy bởi `<img>` (không có nội dung chữ cần khoảng trắng rộng hơn); tăng padding sẽ làm ảnh bị thu nhỏ bất thường trong lưới 2/4 cột. Nếu chủ dự án muốn đồng bộ padding tuyệt đối (`p-5`) bất kể loại thẻ, sẽ sửa lại AC-UI-022.
- Giả định: label nút "Tải ảnh phiếu xác nhận" không phải là "thẻ" cần bỏ viền — nó dùng đúng style `Button variant="secondary"` (`border border-line bg-card`) đang áp dụng toàn app cho nút phụ, nằm trong ngoại lệ "input/nút điều khiển" ở UI_GUIDELINES §1.1, không đổi ở item này.
- Không có câu hỏi mới cần chủ dự án quyết — nguyên tắc đã chốt ở M11-01, item này áp dụng lại đúng khuôn mẫu cho vùng chi tiết đơn hàng.
