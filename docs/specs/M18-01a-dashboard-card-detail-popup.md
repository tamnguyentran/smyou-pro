# M18-01a — Bấm thẻ Tổng quan mở popup danh sách chi tiết + xuất Excel (khung chung, khối "Đơn theo trạng thái" & "Điều phối")

- **Status:** Done (reviewed 2026-10-30 — reports/review-M18-01a.md)
- **Backlog:** M18-01a · **Milestone:** M18
- **Liên quan:** spec/permissions.yaml#dashboard.read, #order.read_prices · thay hành vi drill-down của `M10-03`, `M10-07a`, `M10-07b` (chỉ phần khối Đơn + Điều phối) · Q100 (định dạng "Excel" = CSV UTF-8 BOM)

## 1. Mục tiêu
Là Sale/Quản lý/Quản lý kỹ thuật, khi bấm một thẻ số liệu ở trang "Tổng quan", tôi muốn thấy ngay một popup liệt kê đúng các đơn/đầu việc tạo nên con số đó (và trên máy tính thì xuất được ra Excel), để không phải rời trang Tổng quan rồi tự lọc lại.

## 2. Phạm vi
- Trong phạm vi (chủ dự án chốt 2026-10-30):
  - **Khung dùng chung**: component popup `CardDetailDialog` (danh sách + phân trang + nút "Xuất Excel" chỉ desktop ≥1024px) và endpoint chung `GET /api/v1/dashboard/cards/{card}/items` + `/export` (CSV UTF-8 BOM, Q100).
  - Áp cho **khối "Đơn theo trạng thái"** (8 thẻ: 7 trạng thái + "Quá hạn") và **khối "Điều phối"** (4 thẻ: "Chờ điều phối", "Đang thực hiện", "Cần giao lại", "Quá hạn").
  - Bấm thẻ **chỉ mở popup**, không chuyển trang nữa (bỏ `to=` của 12 thẻ này). Mobile vẫn mở popup nhưng **không** có nút "Xuất Excel".
- Ngoài phạm vi:
  - `M18-01b`: khối "Đầu việc theo trạng thái", "Nhân sự kỹ thuật", "Việc của tôi" (KTV).
  - `M18-01c`: khối "Chăm sóc khách hàng", "Phản hồi – đánh giá", "Top 10 khách hàng".
  - Không đổi cách đếm số trên thẻ (`dashboard/service.py` giữ nguyên), không đổi trang `/orders`, `/dispatch/*` (tham số URL `status`/`overdue`/`mine` vẫn chạy nếu gõ tay).
  - Không đổi `spec/permissions.yaml` (dùng lại `dashboard.read` + luật "vai trò nào thấy khối nào" đã có ở `get_dashboard`).

## 3. Acceptance Criteria

Mã thẻ (`card`) dùng trong API: `order.DRAFT`, `order.PENDING_DISPATCH`, `order.IN_PROGRESS`, `order.AWAITING_CONFIRMATION`, `order.COMPLETED`, `order.REVISION`, `order.CANCELLED` (đúng 7 trạng thái của `ORDER_STATUS_ORDER`), `order.overdue`, `dispatch.pending_dispatch`, `dispatch.in_progress`, `dispatch.needs_assignee`, `dispatch.overdue_tasks`.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DASH-066 | Hoa (SALE, scope "own"); Hoa tạo 3 đơn `PENDING_DISPATCH` (DH2610-0011…0013), An tạo thêm 5 đơn `PENDING_DISPATCH` | Hoa gọi `GET /api/v1/dashboard/cards/order.PENDING_DISPATCH/items` | 200; `total = 3` (bằng đúng `order_summary.counts_by_status.PENDING_DISPATCH` của Hoa); `items` chỉ có 3 đơn của Hoa, sắp xếp mới tạo trước; mỗi dòng có `order_id, order_code, customer_name, customer_phone, created_by_name, status, created_at, total` | integration |
| AC-DASH-067 | An (MANAGER, scope "all"), cùng dữ liệu AC-DASH-066 | An gọi `.../order.PENDING_DISPATCH/items` | 200; `total = 8`, có cả đơn của Hoa và An | integration |
| AC-DASH-068 | Với **mỗi** thẻ trong 12 mã thẻ, dữ liệu seed có đơn/đầu việc thuộc và không thuộc thẻ (gồm đầu việc quá hạn của đơn `COMPLETED`/`CANCELLED` không được tính như `_order_summary`) | gọi `/items` bằng vai trò thấy khối đó | `total` luôn bằng đúng số trên thẻ tương ứng ở `GET /dashboard` cùng thời điểm (`clock` cố định); thẻ `order.*`/`dispatch.pending_dispatch`/`dispatch.in_progress` trả dòng **đơn**, thẻ `dispatch.needs_assignee`/`dispatch.overdue_tasks` trả dòng **đầu việc** (`task_id, task_code, task_title, order_id, order_code, customer_name, assignee_names, due_at, status`) | integration (tham số hoá 12 thẻ) |
| AC-DASH-069 | 45 đơn `COMPLETED`, An (MANAGER) | gọi `.../order.COMPLETED/items?page=3&page_size=20` | 200; `total = 45`, `items` có 5 dòng (41–45); `page_size` > 100 → 422 | integration |
| AC-DASH-070 | Khoa (chỉ TECHNICIAN); Linh (chỉ CUSTOMER_CARE) | Khoa gọi `.../order.DRAFT/items`; Khoa gọi `.../dispatch.overdue_tasks/items`; Linh gọi `.../order.DRAFT/items` | cả 3 → **404** `NOT_FOUND` (vai trò không thấy khối đó trên Tổng quan nên thẻ "không tồn tại" với họ, cùng luật vai trò của `get_dashboard`) | integration |
| AC-DASH-071 | Hoa (SALE) — Sale không thấy khối "Điều phối" | gọi `.../dispatch.pending_dispatch/items` | 404 | integration |
| AC-DASH-072 | Người dùng chưa đăng nhập; An gọi mã thẻ lạ `order.FOO` | gọi `/items` | chưa đăng nhập → 401; mã lạ → 404 | integration |
| AC-DASH-073 | Hà [SALE, TECHNICIAN] (scope "own" vì không có MANAGER) | gọi `.../order.IN_PROGRESS/items` | chỉ thấy đơn do Hà tạo — giống hệt `order_summary` của Hà | integration |
| AC-DASH-074 | Tuấn (TECH_LEAD) — có `order.read_prices`; giả lập actor có `dashboard.read` cho khối đơn nhưng **không** có `order.read_prices` | gọi `/items` thẻ đơn | Tuấn: `total` (tiền) là số nguyên VND; actor không có `order.read_prices`: trường `total` là `null`, cột "Tổng tiền" không có trong CSV | integration |
| AC-DASH-075 | An (MANAGER), 3 đơn `IN_PROGRESS`, 1 đơn tên khách bắt đầu bằng `=HYPERLINK(` | gọi `GET .../dispatch.in_progress/export` | 200; `Content-Type: text/csv; charset=utf-8`; nội dung bắt đầu bằng BOM `﻿`; `Content-Disposition` `attachment; filename="tong-quan-dang-thuc-hien-2026-10-30.csv"` (ngày theo `Asia/Ho_Chi_Minh`); dòng tiêu đề tiếng Việt; **toàn bộ** 3 dòng (không phân trang); ô bắt đầu bằng `= + - @` được thêm `'` phía trước (chống CSV injection, như `revenue_report`); thời gian hiển thị giờ VN `dd/MM/yyyy HH:mm` | integration |
| AC-DASH-076 | Khoa (TECHNICIAN) | gọi `.../order.DRAFT/export` | 404 (cùng luật AC-DASH-070) | integration |
| AC-DASH-077 | Hoa (SALE) ở Tổng quan, desktop 1440px | bấm thẻ "Chờ điều phối" | **Không** chuyển trang (URL vẫn `/`); popup mở, tiêu đề "Chờ điều phối (3)"; bảng cột: Mã đơn · Khách hàng · SĐT · Người tạo · Ngày tạo · Tổng tiền; có nút "Xuất Excel"; mã đơn là link tới `/orders/{id}` | component + e2e |
| AC-DASH-078 | Hoa ở Tổng quan, mobile 390px | bấm thẻ "Chờ điều phối" | popup dạng sheet từ dưới (component `Sheet` sẵn có), danh sách dạng thẻ (mã đơn, khách hàng, ngày tạo), **không** có nút "Xuất Excel"; không cuộn ngang (`scrollWidth <= clientWidth`) | component + e2e |
| AC-DASH-079 | Tuấn (TECH_LEAD) ở Tổng quan desktop | bấm "Quá hạn" (khối Điều phối) | popup "Đầu việc quá hạn (n)" cột: Mã đầu việc · Đầu việc · Mã đơn · Khách hàng · KTV · Hạn (giờ VN); hạn tô màu `urgent` | component |
| AC-DASH-080 | An (MANAGER) ở Tổng quan — trước đây (M10-07b) thẻ "Cần giao lại"/"Quá hạn" không bấm được với An vì An không có `task.manage` | bấm "Cần giao lại" | popup mở được và hiện danh sách đầu việc (chỉ đọc); mã đơn link tới `/orders/{id}`, **không** có link tới `/dispatch/board` (Q117) | component |
| AC-DASH-081 | Popup đang mở trên desktop | bấm "Xuất Excel" | gọi `/export` đúng mã thẻ; trình duyệt tải file; trong lúc tải nút hiện "Đang xuất…" và bị vô hiệu; lỗi mạng → toast "Không xuất được file, vui lòng thử lại." | component |
| AC-DASH-082 | Popup mở; API `/items` đang tải / trả `total = 0` / lỗi 500 | render | đang tải: skeleton 3 dòng; rỗng: `EmptyState` "Không có dữ liệu" và nút "Xuất Excel" bị ẩn; lỗi: "Không tải được danh sách." + nút "Thử lại" | component |
| AC-DASH-083 | Popup mở, `total = 45` | bấm trang 2 / nhấn `Esc` / bấm nút "Đóng" (icon X, vùng chạm ≥44px) | phân trang dùng `Pagination` sẵn có (20 dòng/trang); `Esc` hoặc "Đóng" đóng popup, focus trả về đúng thẻ vừa bấm | component |
| AC-DASH-084 | Hoa dùng bàn phím, Tab tới thẻ "Chờ điều phối" | nhấn Enter | popup mở (thẻ là `<button>`, có `focus-visible` ring, `aria-haspopup="dialog"`); thay ~~AC-DASH-030~~ (Enter giờ mở popup, không điều hướng) | component |
| AC-DASH-085 | Trang Tổng quan 390px và 1440px, popup đang mở | chạy axe-core | không có vi phạm `serious`/`critical`; popup có `role="dialog"`, `aria-modal`, tiêu đề làm `aria-labelledby` | e2e |

**AC cũ bị thay thế** (sửa ở spec gốc, gạch ngang + trỏ về đây khi implement): ~~AC-DASH-022~~, ~~AC-DASH-023~~, ~~AC-DASH-026~~, ~~AC-DASH-027~~, ~~AC-DASH-030~~ (`M10-03`); ~~AC-DASH-028~~ (thẻ không bấm được → nay mở popup); ~~AC-DASH-038~~ (`M10-07b`; AC-DASH-037 là phép đếm backend, vẫn giữ) và thẻ "Quá hạn" của `M10-07a`. Các test component/e2e tương ứng sửa theo hành vi mới — đây là **thay đổi yêu cầu do chủ dự án chốt**, không phải làm yếu test.

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/dashboard/cards/{card}/items | dashboard.read (+ luật vai trò → khối như `get_dashboard`) | query `page` (≥1, mặc định 1), `page_size` (1–100, mặc định 20) | `DashboardCardItemsOut { card, label, kind: "order" \| "task", total, page, page_size, order_items?: DashboardOrderRow[], task_items?: DashboardTaskRow[] }` | 401, 404, 422 |
| GET | /api/v1/dashboard/cards/{card}/export | như trên | — | CSV UTF-8 BOM, toàn bộ dòng (giới hạn 5.000 dòng; vượt → 409 `EXPORT_TOO_LARGE` "Quá nhiều dòng để xuất (tối đa 5.000).") | 401, 404, 409 |

- Lọc của từng thẻ phải dùng **chung một hàm điều kiện** với hàm đếm trong `dashboard/service.py` (tách `_order_summary`/`_dispatch_summary` thành điều kiện `where` dùng lại) để số và danh sách không bao giờ lệch.
- `DashboardOrderRow.total`: `int | None` — `null` khi actor không có `order.read_prices`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `StatTile`: thêm prop `onClick` (render `<button type="button">`, giữ nguyên style/tone, `min-h-11`); bỏ `to` ở 12 thẻ thuộc phạm vi. Thẻ ngoài phạm vi (M18-01b/c) giữ nguyên như hiện tại.
- `CardDetailDialog` (mới, `features/dashboard/components/`): desktop ≥1024px (`useMediaQuery("(min-width: 1024px)", true)` như `RevenueTable`) → dialog giữa màn, rộng tối đa `max-w-4xl`, bảng; <1024px → `Sheet` từ dưới, danh sách thẻ.
- Tiêu đề: `<Nhãn thẻ> (<total>)`. Nút: "Xuất Excel" (icon `lucide-react` `FileSpreadsheet`, chỉ desktop, ẩn khi rỗng), "Đóng" (icon `X`).
- Copy: rỗng "Không có dữ liệu"; lỗi tải "Không tải được danh sách." + "Thử lại"; lỗi xuất "Không xuất được file, vui lòng thử lại."; đang xuất "Đang xuất…".
- Tiền: `formatCurrency` (đã có); thời gian: `Asia/Ho_Chi_Minh`.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Hoa (Sale) trên máy tính → Tổng quan → bấm "Chờ điều phối": popup hiện đúng các đơn của Hoa, số dòng khớp số trên thẻ, URL không đổi.
2. Bấm "Xuất Excel" → mở file bằng Excel: tiếng Việt có dấu đúng, đủ dòng.
3. Bấm mã đơn trong popup → mở chi tiết đơn.
4. Mở cùng trang trên điện thoại → bấm thẻ: sheet trượt lên, không có nút "Xuất Excel".
5. Đăng nhập An (Quản lý) → bấm "Cần giao lại" (khối Điều phối): popup hiện danh sách đầu việc dù An không vào được Bảng đầu việc.

## 8. Giả định & câu hỏi
- Đã chốt (chủ dự án, 2026-10-30): phạm vi = trang Tổng quan; bấm thẻ **chỉ mở popup** (bỏ chuyển trang); mobile có popup nhưng không có Excel; tách theo khối thành M18-01a/b/c.
- Giả định: "Excel" = CSV UTF-8 BOM (Q100 đã chốt cho mọi báo cáo); không thêm thư viện `.xlsx`.
- Giả định: popup 20 dòng/trang; xuất tối đa 5.000 dòng (đủ xa so với quy mô SMYou; chặn file quá lớn).
- Giả định: hàng trong popup có mã đơn link tới `/orders/{id}` (bấm **thẻ** không chuyển trang, nhưng bấm **dòng** thì được) — mọi vai trò thấy khối Đơn/Điều phối đều có `order.read` scope "all".
- **Q117 (chủ dự án đồng ý mặc định, 2026-10-30):** Quản lý (MANAGER) không có `task.manage` nên trước đây không bấm được "Cần giao lại"/"Quá hạn". Với popup, An sẽ **xem được danh sách đầu việc** (chỉ đọc: mã, tên đầu việc, KTV, hạn) — mở rộng nhẹ những gì Quản lý thấy. Đề xuất mặc định: **cho xem** (Quản lý đã thấy con số, xem danh sách chỉ đọc là hợp lý; không có thao tác điều phối nào trong popup).
