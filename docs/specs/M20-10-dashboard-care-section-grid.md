# M20-10 — Tổng quan: mục "Chăm sóc khách hàng" — thẻ cao đều, không thẻ lẻ hàng trên điện thoại

- **Status:** Approved (chủ dự án 2026-11-01, kèm đổi nhãn "KH đã gọi")
- **Backlog:** M20-10 · **Milestone:** M20
- **Liên quan:** M16-03 (khối CSKH, AC-DASH-064/065), M18-01c (popup thẻ, AC-DASH-116/117), M20-01 (lưới 4 thẻ — phát hiện khi review, `reports/review-M20-01.md`). Không đổi `spec/*.yaml`.

## 1. Mục tiêu
Là Quản lý / CSKH / QLKT, tôi muốn 3 thẻ của mục "Chăm sóc khách hàng (tháng này)" **cao bằng nhau** (hiện thẻ "Khách hàng đã chăm sóc" — đổi nhãn thành "KH đã gọi" — cao hơn vì có dòng "Hôm nay: n") và trên điện thoại **không còn thẻ "Đơn hàng phải sửa" nằm lẻ một mình** ở hàng 2, để mục này gọn và đều như các mục khác.

## 2. Phạm vi
- Trong phạm vi:
  - `CskhStatsSection` (`frontend/src/features/dashboard/components/`): lưới mobile đổi thành thẻ 1 "KH đã gọi" chiếm trọn hàng 1 (`col-span-2`), 2 thẻ còn lại chung hàng 2; từ `md:` giữ 3 cột/1 hàng.
  - `StatTile`/`TileButton`: thẻ lấp đầy chiều cao ô lưới (`h-full`) để các thẻ cùng hàng cao bằng nhau. Thay đổi này dùng chung — các mục khác cũng hưởng (thẻ cùng hàng cao đều), không đổi nội dung.
  - **Đổi nhãn** "Khách hàng đã chăm sóc" → **"KH đã gọi"** (chủ dự án yêu cầu 2026-11-01) ở: thẻ, tiêu đề popup (`CskhStatsSection`) và tiêu đề thẻ ở backend `dashboard/cards.py` (dùng cho tiêu đề popup/Excel). Cập nhật các test cũ đang khẳng định nhãn cũ (AC-DASH-064/065 `dashboard.test.tsx`, AC-DASH-116 `cardDetailDialog.test.tsx` + `e2e/dashboard-drilldown.spec.ts`) và chú thích OpenAPI — đây là đổi spec có chủ đích, không phải làm yếu test.
- Ngoài phạm vi: thứ tự thẻ, nhãn 2 thẻ còn lại, số liệu, API (ngoài chuỗi tiêu đề), quyền, cột/nội dung popup, slug tên file Excel (`cskh-kh-da-cham-soc` giữ nguyên), skeleton loading, các mục khác (Đơn hàng, Đầu việc, Phản hồi, Top 10…).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-070 | Quản lý Nguyễn Văn An đăng nhập; dashboard có `care_summary = {today: 2, month: 8}`, `care_staff_count = 3`, `orders_needing_revision_count = 1` | mở Tổng quan | lưới mục "Chăm sóc khách hàng (tháng này)" có `grid-cols-2` và `md:grid-cols-3`; thẻ "KH đã gọi" có `col-span-2` và `md:col-span-1`; vẫn đủ 3 thẻ theo thứ tự cũ (KH đã gọi · NV đã gọi điện CSKH · Đơn hàng phải sửa), thẻ 1 vẫn có dòng "Hôm nay: 2" | component |
| AC-UI-071 | CSKH Trần Thị Lan, cùng dữ liệu, viewport 390px | mở Tổng quan | thẻ "KH đã gọi" một mình hàng 1, rộng bằng cả lưới; "NV đã gọi điện CSKH" và "Đơn hàng phải sửa" cùng `top` ở hàng 2, rộng bằng nhau và **cao bằng nhau** (chênh ≤ 1px); không thẻ nào lẻ một nửa hàng; mỗi thẻ cao ≥ 44px; không cuộn ngang | e2e (mobile) |
| AC-UI-072 | Quản lý An, cùng dữ liệu, viewport 1440px (và 768px) | mở Tổng quan | 3 thẻ cùng `top` (1 hàng), rộng bằng nhau và **cao bằng nhau** (chênh ≤ 1px) dù chỉ thẻ 1 có dòng "Hôm nay: 2"; nhãn "NV đã gọi điện CSKH" không bị cắt/tràn; không cuộn ngang | e2e (desktop) |
| AC-UI-073 | QLKT Phạm Văn Tuấn, viewport 1440px, mục "Điều phối" (4 thẻ, M20-01) | mở Tổng quan | hồi quy: 4 thẻ vẫn 1 hàng, cùng chiều cao; thêm `h-full` không làm thẻ nào cao/thấp bất thường so với trước | e2e (desktop) |
| AC-UI-074 | Như AC-UI-070 | bấm thẻ "Đơn hàng phải sửa"; bấm "KH đã gọi" | vẫn mở popup "Đơn hàng phải sửa (1)" và "KH đã gọi (8)" như M18-01c; vùng bấm phủ cả chiều cao thẻ | component |
| AC-UI-075 | Như AC-UI-070 | mở Tổng quan; mở popup thẻ đầu; `GET /api/v1/dashboard/cards/care.customers/items` | trang **không còn** chuỗi "Khách hàng đã chăm sóc"; thẻ hiện nhãn "KH đã gọi"; popup tên "KH đã gọi (8)"; response items có `label = "KH đã gọi"`; tiêu đề mục "Chăm sóc khách hàng (tháng này)" giữ nguyên | component + integration |

## 4. API
Không đổi.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `CskhStatsSection`: giữ `grid grid-cols-2 gap-3 md:grid-cols-3`; StatTile "KH đã gọi" nhận thêm class `col-span-2 md:col-span-1` (StatTile thêm prop `className` áp lên phần tử ngoài cùng — `<button>`/`<Link>`/`<div>`).
- `StatTile`/`TileButton`: phần tử ngoài cùng và khối nội dung bên trong có `h-full` → thẻ kéo giãn theo ô lưới (grid mặc định `align-items: stretch`).
- Không đổi màu/tone/copy. Screenshot 390px + 1440px vào `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Quản lý hoặc CSKH, mở Tổng quan trên máy tính → mục "Chăm sóc khách hàng" 3 thẻ trên 1 hàng, cao bằng nhau.
2. Mở trên điện thoại (~390px) → hàng 1: "KH đã gọi" rộng cả hàng; hàng 2: 2 thẻ còn lại cao bằng nhau, không thẻ lẻ.
3. Bấm từng thẻ → popup chi tiết vẫn mở như trước.

## 8. Giả định & câu hỏi
- Giả định G1 (bố cục mobile): thẻ "KH đã gọi" (chỉ số chính, có 2 số tháng/hôm nay) chiếm trọn hàng 1, 2 thẻ còn lại chung hàng 2. Phương án khác đã cân nhắc: 3 thẻ/1 hàng trên điện thoại (ô hẹp ~110px, nhãn "NV đã gọi điện CSKH"/"Đơn hàng phải sửa" xuống 2–3 dòng) hoặc 3 thẻ xếp dọc 1 cột (tốn chỗ, lệch với các mục 2 cột khác) — không chọn.
- Giả định G2: "cao đều" áp dụng cho thẻ **cùng hàng**; `h-full` đặt ở `StatTile` dùng chung nên các mục khác cũng được cao đều — không có lý do để khác.
- Không có câu hỏi nghiệp vụ mới (thuần bố cục UI).
