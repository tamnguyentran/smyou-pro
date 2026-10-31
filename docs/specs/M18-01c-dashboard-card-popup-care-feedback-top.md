# M18-01c — Popup chi tiết + xuất Excel cho khối "Chăm sóc khách hàng", "Phản hồi – đánh giá", "Top 10 khách hàng"

- **Status:** Done (reviewed 2026-10-31 — reports/review-M18-01c.md)
- **Backlog:** M18-01c · **Milestone:** M18
- **Liên quan:** `M18-01a` (khung `CardDetailDialog` + `/dashboard/cards/{card}/items|export`), `M18-01b` · `M16-03` (khối CSKH, AC-DASH-060…065), `M15-04` (Top 10 + Phản hồi, AC-DASH-054…059) · spec/permissions.yaml#dashboard.read, #order.read_prices · Q94 (khối khách hàng tính toàn công ty, tháng hiện tại) · Q100 (Excel = CSV UTF-8 BOM)

## 1. Mục tiêu
Là Quản lý / Quản lý kỹ thuật / Sale / CSKH, khi bấm một thẻ số liệu (hoặc một khách hàng trong Top 10) ở khối khách hàng trên trang Tổng quan, tôi muốn thấy ngay popup liệt kê đúng các đơn/nhân viên tạo nên con số đó (và trên máy tính thì xuất ra Excel), như M18-01a/b đã làm cho các khối khác.

## 2. Phạm vi
- Trong phạm vi:
  - Dùng lại nguyên khung M18-01a (component `CardDetailDialog`, endpoint `/items` + `/export`, phân trang 20, `page_size` ≤ 100, giới hạn xuất 5.000 dòng, chống CSV injection, nút "Xuất Excel" chỉ desktop ≥1024px, mobile dùng `Sheet`).
  - **Khối "Chăm sóc khách hàng (tháng này)"** (3 thẻ):
    - `care.customers` — "Khách hàng đã chăm sóc": đơn có `csat_recorded_at` trong **tháng này** (giờ VN) — khớp số lớn trên thẻ (`care_summary.month`) → dòng **phản hồi** (loại dòng mới `feedback`). Cả ô (gồm dòng "Hôm nay: n") là 1 nút; popup liệt kê theo tháng (Q120).
    - `care.staff` — "NV đã gọi điện CSKH": nhân viên đã ghi phản hồi cho ≥1 đơn trong tháng → dòng **nhân viên CSKH** (loại dòng mới `care_staff`).
    - `care.revision_orders` — "Đơn hàng phải sửa": đơn có ≥1 `order_revisions.requested_at` trong tháng → dòng **đơn** (như M18-01a).
  - **Khối "Phản hồi – đánh giá từ khách hàng (tháng này)"** (5 thẻ): `feedback.5` … `feedback.1` — đơn `COMPLETED`, `completed_at` trong tháng, `csat_rating = n` → dòng **phản hồi**.
  - **Khối "Top 10 khách hàng (tháng này)"**: mỗi khách hàng trong bảng/thẻ có nút mở popup `top.{customer_id}` — các đơn `COMPLETED` trong tháng của khách đó → dòng **đơn** (Q121).
  - Bấm dòng: mã đơn link tới `/orders/{id}` như M18-01a; dòng nhân viên CSKH không có link.
- Ngoài phạm vi:
  - Không đổi con số trên thẻ (chỉ tách điều kiện đếm thành hàm `where` dùng chung). Không đổi trang `/customer-care/*`, `/orders`.
  - Không đổi `spec/permissions.yaml`, không thêm migration.
  - Không thêm bộ lọc ngày (vẫn "tháng này" cố định — Q94).

## 3. Acceptance Criteria

Dữ liệu mẫu: An (MANAGER), Tuấn (TECH_LEAD), Hoa (SALE), Linh & Mai (CUSTOMER_CARE), Khoa (TECHNICIAN); khách Công ty TNHH Minh Phát (KH0012), Nhà sách Hoàng Gia (KH0031); `clock` cố định 2026-10-30 09:00 giờ VN (tháng này = 01/10–31/10/2026 giờ VN).

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DASH-104 | Với **mỗi** mã thẻ `care.customers`, `care.staff`, `care.revision_orders`, `feedback.1`…`feedback.5`, và `top.{id}` của từng khách trong Top 10; dữ liệu seed có bản ghi thuộc và không thuộc thẻ (ghi phản hồi 30/09 23:30 giờ VN, đơn hoàn tất tháng trước nhưng ghi phản hồi tháng này, đơn có 2 lần yêu cầu sửa trong tháng, đơn khách lẻ không có `customer_id`) | An gọi `/items` | `total` luôn bằng đúng số tương ứng ở `GET /dashboard` cùng thời điểm (`care_summary.month`, `care_staff_count`, `orders_needing_revision_count`, `feedback_summary["n"]`, `top_customers[i].order_count`); `kind`: `care.customers`, `feedback.*` → `"feedback"`; `care.staff` → `"care_staff"`; `care.revision_orders`, `top.*` → `"order"` | integration (tham số hoá) |
| AC-DASH-105 | 3 đơn được ghi phản hồi trong tháng: DH2610-0041 (5★, "Lắp camera gọn gàng", Linh ghi 28/10 14:05), DH2610-0042 (3★, không bình luận, Mai ghi 30/10 08:10), DH2609-0090 (hoàn tất 29/09, 4★, Linh ghi 02/10); thêm DH2609-0088 ghi phản hồi 30/09 23:30 giờ VN | An gọi `.../care.customers/items` | 200; `total = 3` (không có DH2609-0088); `feedback_items` sắp xếp thời điểm ghi mới nhất trước: 0042, 0041, 0090; mỗi dòng có `order_id, order_code, customer_name, customer_phone, csat_rating, csat_comment, recorded_by_name, recorded_at, completed_at` | integration |
| AC-DASH-106 | Linh ghi phản hồi 4 đơn trong tháng, Mai 1 đơn, Hoa (SALE) 0 đơn; Linh có 1 đơn ghi tháng 9 | Tuấn gọi `.../care.staff/items` | 200; `total = 2`; `care_staff_items`: Linh (`care_count = 4`), Mai (`care_count = 1`) — sắp xếp `care_count` giảm dần rồi `full_name`; mỗi dòng có `employee_id, employee_code, full_name, care_count, last_recorded_at`; **không** có SĐT | integration |
| AC-DASH-107 | DH2610-0050 có 2 yêu cầu sửa (05/10, 20/10), DH2610-0051 có 1 yêu cầu sửa 15/10, DH2609-0070 có yêu cầu sửa 28/09 | Hoa (SALE) gọi `.../care.revision_orders/items` | 200; `total = 2` (theo đơn, không theo số lần); dòng đơn cùng cấu trúc `DashboardOrderRow` M18-01a; Hoa thấy cả đơn **không** do Hoa tạo (khối khách hàng tính toàn công ty — Q94), `total` (tiền) là số nguyên VND | integration |
| AC-DASH-108 | Trong tháng: 3 đơn `COMPLETED` 5★, 1 đơn 2★, 1 đơn hoàn tất chưa có đánh giá; 1 đơn 5★ hoàn tất tháng 9 | Linh (CSKH) gọi `.../feedback.5/items`, `.../feedback.2/items`, `.../feedback.4/items` | lần lượt `total` 3 / 1 / 0 (popup rỗng vẫn 200); dòng `feedback_items` như AC-DASH-105 | integration |
| AC-DASH-109 | Minh Phát (KH0012) có 3 đơn `COMPLETED` tháng này (tổng 18.500.000 ₫) + 1 đơn `COMPLETED` tháng 9 + 1 đơn `IN_PROGRESS` | An gọi `.../top.{id Minh Phát}/items` | 200; `label = "Công ty TNHH Minh Phát (KH0012)"`; `total = 3`; tổng `total` các dòng = 18.500.000 = `top_customers[...].total_revenue`; sắp xếp ngày tạo mới nhất trước (như M18-01a) | integration |
| AC-DASH-110 | `top.` + chuỗi không phải UUID; `top.` + UUID khách không tồn tại | An gọi `/items` | cả 2 → 404 `NOT_FOUND` | integration |
| AC-DASH-111 | Linh (CUSTOMER_CARE — **không** có `order.read_prices`) | gọi `.../top.{id Minh Phát}/items`, `.../care.revision_orders/items`, `.../top.{id}/export` | `/items` 200 nhưng `total` (tiền) của mọi dòng là `null`; CSV **không có** cột "Tổng tiền" (fail-closed như AC-DASH-074) — xem Q122 | integration |
| AC-DASH-112 | Khoa (chỉ TECHNICIAN) | gọi `.../care.customers/items`, `.../feedback.5/items`, `.../top.{id}/items`, `.../care.staff/export` | cả 4 → **404** `NOT_FOUND` (cùng luật vai trò → khối của `get_dashboard`, như AC-DASH-070); chưa đăng nhập → 401 | integration |
| AC-DASH-113 | An; 2 phản hồi 5★, 1 phản hồi có bình luận `=HYPERLINK("x")` | gọi `GET .../feedback.5/export` | 200; CSV UTF-8 BOM; `filename="tong-quan-danh-gia-5-sao-2026-10-30.csv"`; cột: `Mã đơn, Khách hàng, SĐT, Số sao, Nhận xét, Người ghi nhận, Thời điểm ghi nhận, Ngày hoàn tất` (thời gian giờ VN `dd/MM/yyyy HH:mm`); ô bình luận được thêm `'` phía trước | integration |
| AC-DASH-114 | Tuấn | gọi `.../care.staff/export` và `.../top.{id Minh Phát}/export` | lần lượt `filename="tong-quan-cskh-nv-goi-dien-2026-10-30.csv"` cột `Mã NV, Họ tên, Số KH đã chăm sóc, Lần ghi gần nhất`; `filename="tong-quan-top-kh-kh0012-2026-10-30.csv"` cột như CSV đơn M18-01a | integration |
| AC-DASH-115 | An gọi `.../care.customers/items?page_size=101`; 5.001 đơn ghi phản hồi trong tháng | gọi `/items` và `/export` | `page_size=101` → 422; export → 409 `EXPORT_TOO_LARGE` "Quá nhiều dòng để xuất (tối đa 5.000)." | integration |
| AC-DASH-116 | Linh ở Tổng quan desktop 1440px, 3 KH đã chăm sóc tháng này | bấm ô "Khách hàng đã chăm sóc" | URL vẫn `/`; popup "Khách hàng đã chăm sóc (3)"; bảng cột Mã đơn · Khách hàng · SĐT · Số sao · Nhận xét · Người ghi nhận · Thời điểm ghi nhận; có nút "Xuất Excel"; mã đơn link `/orders/{id}` | component + e2e |
| AC-DASH-117 | An ở Tổng quan desktop | bấm "NV đã gọi điện CSKH"; bấm "Đơn hàng phải sửa" | popup "NV đã gọi điện CSKH (2)" cột Mã NV · Họ tên · Số KH đã chăm sóc · Lần ghi gần nhất, dòng **không** có link; popup "Đơn hàng phải sửa (2)" cùng cột popup đơn M18-01a | component |
| AC-DASH-118 | An ở Tổng quan desktop | bấm thẻ "2★" (khối Phản hồi) | popup "Đánh giá 2★ (1)" cột như AC-DASH-116; thẻ giữ nguyên tông màu theo mức sao (1–2★ `urgent`) | component |
| AC-DASH-119 | An ở Tổng quan desktop, Top 10 có Minh Phát | bấm mã "KH0012" trong bảng Top 10 | popup "Công ty TNHH Minh Phát (KH0012) (3)" liệt kê 3 đơn; có nút "Xuất Excel"; các cột khác của bảng Top 10 không đổi | component + e2e |
| AC-DASH-120 | Linh ở Tổng quan mobile 390px | bấm "4★"; bấm thẻ khách Nhà sách Hoàng Gia trong Top 10 | `Sheet` từ dưới, danh sách dạng thẻ (mã đơn, khách hàng, số sao + nhận xét rút gọn 2 dòng / ngày tạo); **không** có nút "Xuất Excel"; không cuộn ngang (`scrollWidth <= clientWidth`) | component + e2e |
| AC-DASH-121 | Tuấn dùng bàn phím, Tab tới bất kỳ thẻ nào trong 8 thẻ hoặc nút khách hàng Top 10 | nhấn Enter | popup mở (là `<button aria-haspopup="dialog">`, có `focus-visible` ring, vùng chạm ≥ 44px); `Esc` đóng và trả focus về nút | component |
| AC-DASH-122 | Tổng quan 390px và 1440px, đăng nhập Linh, popup khối CSKH / Phản hồi / Top 10 đang mở | chạy axe-core | không có vi phạm `serious`/`critical` | e2e |

**AC cũ bị ảnh hưởng:** AC-DASH-054…065 (M15-04, M16-03) giữ nguyên về số liệu và giao diện; thẻ được bọc trong `<button>` (ô màu/thẻ bên trong giữ nguyên) nên test cũ chạy nguyên, không phải sửa.

## 4. API
Không thêm endpoint — mở rộng `GET /api/v1/dashboard/cards/{card}/items` và `/export` của M18-01a (capability `dashboard.read` + luật vai trò → khối: chỉ `MANAGER`/`TECH_LEAD`/`SALE`/`CUSTOMER_CARE`, như `_DASHBOARD_ROLES_FOR_CUSTOMER_SECTIONS`).

| Thay đổi | Chi tiết |
|---|---|
| `DashboardCardItemsOut.kind` | thêm `"feedback"`, `"care_staff"`; thêm `feedback_items?: DashboardFeedbackRow[]`, `care_staff_items?: DashboardCareStaffRow[]` |
| `DashboardFeedbackRow` (mới) | `order_id, order_code, customer_name, customer_phone: str \| None, csat_rating: int, csat_comment: str \| None, recorded_by_name: str \| None, recorded_at: datetime, completed_at: datetime \| None` |
| `DashboardCareStaffRow` (mới) | `employee_id, employee_code, full_name, care_count: int, last_recorded_at: datetime` |
| Mã thẻ động `top.{customer_id}` | `label` = `"<tên KH> (<mã KH>)"`; không phải UUID / khách không tồn tại → 404 |

- Điều kiện lọc của từng thẻ dùng **chung một hàm `where`** với hàm đếm trong `dashboard/service.py` (tách `care_where(now)`, `feedback_where(now)`, `top_customer_where(now, customer_id)` từ `_care_summary`, `_care_staff_count`, `_orders_needing_revision_count`, `_feedback_summary`, `_top_customers`).
- `care.staff`: điều kiện trên `Employee` (`EXISTS` đơn có `csat_recorded_by = Employee.id` và `csat_recorded_at` trong tháng).
- `care.revision_orders`: `EXISTS order_revisions` trong tháng → 1 dòng / đơn.
- Giá tiền: giữ `_show_prices` hiện tại (`order.read_prices` scope `all`) — CSKH thấy `null`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `CskhStatsSection`, `FeedbackSummarySection`: mọi thẻ thành nút mở `CardDetailDialog` (ô "Khách hàng đã chăm sóc" giữ bố cục 2 số; thẻ sao giữ tông màu theo mức).
- `TopCustomersSection`: mã KH (desktop) / cả thẻ (mobile) là nút mở `CardDetailDialog` với `top.{customer_id}`.
- `CardDetailDialog`: thêm hiển thị cho `kind = "feedback"` (bảng desktop / thẻ mobile; số sao dạng `n★`, nhận xét rút gọn `line-clamp-2`, "—" nếu trống) và `kind = "care_staff"` (Mã NV · Họ tên · Số KH đã chăm sóc · Lần ghi gần nhất).
- Tiêu đề popup: nhãn thẻ + `(total)`; thẻ sao: "Đánh giá n★". Copy rỗng/lỗi/đang xuất: giữ nguyên M18-01a.
- Tên file xuất `tong-quan-<slug>-<yyyy-mm-dd>.csv`; slug: `cskh-kh-da-cham-soc`, `cskh-nv-goi-dien`, `cskh-don-phai-sua`, `danh-gia-<n>-sao`, `top-kh-<mã KH viết thường>`.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Linh (CSKH) trên máy tính → Tổng quan → bấm "Khách hàng đã chăm sóc": popup liệt kê các đơn đã ghi phản hồi tháng này, số dòng khớp số trên thẻ, URL không đổi; bấm "Xuất Excel" → mở bằng Excel thấy tiếng Việt đúng.
2. Bấm thẻ "1★": thấy đúng các đơn bị chấm 1 sao kèm nhận xét.
3. Đăng nhập An (Quản lý) → bấm mã khách hàng đầu bảng Top 10: popup các đơn hoàn tất tháng này, tổng tiền cộng lại bằng cột Doanh thu.
4. Trên điện thoại → bấm "Đơn hàng phải sửa": sheet trượt lên, không có nút Excel.

## 8. Giả định & câu hỏi
- Giả định: hành vi "bấm thẻ chỉ mở popup", mobile không có Excel, quyền xem popup = quyền thấy khối — đã chốt ở M18-01, áp y nguyên.
- Giả định: "Khách hàng đã chăm sóc" / "NV đã gọi điện CSKH" vẫn là số **proxy** theo `csat_recorded_at`/`csat_recorded_by` như M16-03 — popup liệt kê đúng các đơn/NV đó.
- **Q120, Q121, Q122 — chủ dự án đồng ý mặc định (2026-10-30).**
- **Q120:** Ô "Khách hàng đã chăm sóc" hiện 2 số (tháng / hôm nay). Đề xuất mặc định: **bấm cả ô → popup theo tháng** (số lớn); danh sách có cột "Thời điểm ghi nhận" nên lọc được hôm nay khi xuất Excel. Không tách thẻ "hôm nay" riêng.
- **Q121:** Top 10 là bảng, không phải thẻ. Đề xuất mặc định: **bấm mã KH → popup các đơn `COMPLETED` tháng này của khách đó** (khớp cột Số đơn/Doanh thu). Không thêm nút "Xuất Excel cả bảng Top 10" (bảng chỉ 10 dòng).
- **Q122:** Bảng Top 10 hiện cột Doanh thu cho **cả CSKH** (M15-04, toàn công ty), nhưng CSKH không có `order.read_prices`. Popup đơn theo luật giá hiện có sẽ ẩn tổng tiền từng đơn với CSKH. Đề xuất mặc định: **ẩn (fail-closed)**, giữ cột Doanh thu tổng ở bảng như cũ — nếu muốn CSKH thấy tiền từng đơn thì cần đổi `order.read_prices` (ngoài phạm vi).
