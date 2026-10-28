# M16-10 — Màn tạo/sửa đơn nháp: bố cục lưới chuẩn theo breakpoint

- **Status:** Approved (2026-10-26, chủ dự án yêu cầu trực tiếp trong phiên)
- **Backlog:** M16-10 · **Milestone:** M16
- **Liên quan:** `docs/specs/M3-02b-draft-orders-ui.md` (AC-ORD-038 giữ nguyên). Thuần UI — không đổi API/DB/quyền.

## 1. Mục tiêu
Màn `/orders/new` và đơn nháp `/orders/{id}` hiển thị theo lưới chuẩn (giống form khách hàng: `grid gap-4`, 2 cột, ô dài chiếm cả dòng) cho smartphone, tablet và desktop.

## 2. Phạm vi
- `DraftOrderForm.tsx`, `CustomerPicker.tsx`, `OrderLinesSection.tsx`.
- **Smartphone (< 768px):** 1 cột; Section "Thông tin đơn" vẫn thu gọn được; nút "Lưu nháp" vẫn dính đáy.
- **Tablet (768–1279px):** ô nhập "Thông tin đơn" xếp lưới 2 cột theo bề rộng khung chứa (container query `@lg` ≥ 512px): Nhóm SP/DV | Ngày hẹn; Tên KH | SĐT (khách lẻ); Địa chỉ, Mô tả, Độ ưu tiên, ô tìm khách chiếm cả dòng.
- **Desktop (≥ 1280px):** khung 3 cột — "Thông tin đơn" 2/3 (thẻ), "Tổng tiền" 1/3 bên phải (dính khi cuộn); 1024–1279px giữ khung 2 cột như AC-ORD-038.
- **Dòng hàng:** thẻ lưới 2 cột (mobile) / 6 cột (tablet) / 12 cột (desktop): tên chiếm cả dòng; SL, Đơn giá, VAT, Giảm giá, Người nhận doanh số chia đủ 1 dòng; hàng cuối: Tặng kèm, tổng dòng, nút xoá căn phải.
- **Thêm khách hàng ngay trong màn tạo đơn** (chủ dự án 2026-10-26): nút "Thêm khách hàng" cạnh ô tìm khách mở lại `CustomerFormSheet` của màn Quản lý khách hàng (cả khách cá nhân và công ty); tạo xong tự chọn vào đơn. Chỉ hiện khi có `customer.manage` (server vẫn kiểm quyền ở `POST /customers`). Nút "+ Khách lẻ" (nhập tên/SĐT không lưu danh bạ) giữ nguyên.
- Ngoài phạm vi: đổi logic lưu đơn.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-046 | Hoa mở `/orders/new` | render | Khung `draft-order-layout` có `lg:grid-cols-2` và `xl:grid-cols-3`; khối "Thông tin đơn" là container (`@container`) với lưới `@lg:grid-cols-2`; Địa chỉ thi công, Mô tả công việc nằm trong ô `col-span-full` | component |
| AC-UI-047 | Đơn nháp có 1 dòng hàng | render | Thẻ dòng hàng có lưới `grid-cols-2 md:grid-cols-6 lg:grid-cols-12`; tên hàng và hàng thao tác (tổng dòng, xoá) chiếm `col-span-full` | component |
| AC-UI-048 | Đơn nháp có 1 dòng hàng (VAT 0%) | gõ "8" vào ô "VAT (%)" rồi rời ô | Ô VAT là ô nhập số (như "Số lượng"), không còn chip 0/8/10%/Khác; gửi `vat_rate: 8`, tổng dòng cập nhật theo response; nhập 150 → "VAT phải trong khoảng 0-100." | component (AC-ORD-028) |
| AC-UI-049 | Hoa (SALE, có `customer.manage`) ở `/orders/new` | bấm "Thêm khách hàng" | Mở đúng modal "Thêm khách hàng" của màn Quản lý khách hàng (`CustomerFormSheet`, chọn được loại Công ty/Cá nhân); lưu thành công → modal đóng, khách mới được chọn sẵn vào đơn (ô "Tìm khách hàng" hiện tên khách) | component |
| AC-UI-050 | Người dùng không có `customer.manage` | mở `/orders/new` | Không có nút "Thêm khách hàng" | component |
| AC-UI-051 | Mọi ô nhập số (`NumberField`; `TextField` có `inputMode` numeric/decimal) và giá trị số chỉ đọc trên dòng hàng | render | Căn phải (`text-right`, `tabular-nums`); SĐT (`inputMode="tel"`) và ô chữ giữ căn trái | component |

Không cuộn ngang / axe / ảnh 390px + 1440px tiếp tục được chứng minh bởi e2e AC-ORD-039 hiện có.

## 4. API / 5. Dữ liệu
Không có.

## 6. Giả định
Không có quy tắc nghiệp vụ mới.
