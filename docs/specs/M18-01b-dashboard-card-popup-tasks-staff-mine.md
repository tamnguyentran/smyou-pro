# M18-01b — Popup chi tiết + xuất Excel cho khối "Đầu việc theo trạng thái", "Nhân sự kỹ thuật", "Việc của tôi"

- **Status:** Approved (chủ dự án, 2026-10-30)
- **Backlog:** M18-01b · **Milestone:** M18
- **Liên quan:** `M18-01a` (khung `CardDetailDialog` + `/dashboard/cards/{card}/items|export`) · spec/permissions.yaml#dashboard.read, #order.read_prices · thay hành vi drill-down của `M10-07b` (khối Nhân sự), `M10-07c` (khối Việc của tôi), `M7-02c` (khối Đầu việc) · Q85 (đếm "Chưa tiếp nhận" theo task) · Q100 (Excel = CSV UTF-8 BOM)

## 1. Mục tiêu
Là Quản lý/Quản lý kỹ thuật (hoặc Kỹ thuật viên với khối "Việc của tôi"), khi bấm một thẻ số liệu ở trang Tổng quan, tôi muốn thấy ngay popup liệt kê đúng các đầu việc/nhân viên/đơn tạo nên con số đó (và trên máy tính thì xuất ra Excel), như đã làm ở M18-01a cho khối Đơn và Điều phối.

## 2. Phạm vi
- Trong phạm vi:
  - Dùng lại nguyên khung M18-01a (component `CardDetailDialog`, endpoint `/items` + `/export`, phân trang 20, giới hạn xuất 5.000 dòng, chống CSV injection, nút "Xuất Excel" chỉ desktop ≥1024px).
  - **Khối "Đầu việc theo trạng thái"** (6 thẻ, MANAGER + TECH_LEAD): `task.NEEDS_ASSIGNEE`, `task.PENDING_ACCEPTANCE`, `task.ACCEPTED`, `task.IN_PROGRESS`, `task.DONE`, `task.CANCELLED` → dòng **đầu việc**.
  - **Khối "Nhân sự kỹ thuật"** (4 thẻ, MANAGER + TECH_LEAD): `staff.IN_PROGRESS` ("Đang làm"), `staff.NOT_STARTED` ("Chưa thực hiện"), `staff.IDLE` ("Chờ giao việc") → dòng **nhân viên** (loại dòng mới `staff`); `staff.pending_acceptance` ("Chưa tiếp nhận") → dòng **đầu việc** (`Task.status = PENDING_ACCEPTANCE`, theo task như Q85).
  - **Khối "Việc của tôi"** (6 thẻ, chỉ TECHNICIAN, chỉ dữ liệu của chính người gọi): `mine.pending` ("Chờ nhận"), `mine.active` ("Đang làm"), `mine.done_today` ("Đã xong hôm nay"), `mine.not_started` ("Chưa thực hiện"), `mine.overdue` ("Quá hạn chưa hoàn thành") → dòng **đầu việc**; `mine.awaiting_confirmation` ("Chưa hoàn tất, cần KH xác nhận") → dòng **đơn**.
  - Bấm thẻ **chỉ mở popup** (bỏ `to=` của 16 thẻ này). Bấm dòng: mã đơn link tới `/orders/{id}` như M18-01a.
- Ngoài phạm vi:
  - `M18-01c` (khối Chăm sóc khách hàng, Phản hồi – đánh giá, Top 10 khách hàng); danh sách "Việc hôm nay" (`today_tasks`) — đã là danh sách, không phải thẻ.
  - Không đổi con số trên thẻ (chỉ tách điều kiện đếm thành hàm `where` dùng chung). Không đổi trang `/dispatch/*`, `/my-tasks` (tham số URL `status`/`group`/`focus` vẫn chạy nếu gõ tay — AC-DASH-048/049 giữ nguyên).
  - Không đổi `spec/permissions.yaml`.

## 3. Acceptance Criteria

Dữ liệu mẫu: Tuấn (TECH_LEAD), An (MANAGER), Khoa & Đức & Minh (TECHNICIAN đang hoạt động), Hoa (SALE), Linh (CUSTOMER_CARE), Hà [SALE, TECHNICIAN]; `clock` cố định 2026-10-30 09:00 giờ VN.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DASH-086 | Với **mỗi** thẻ trong 16 mã thẻ ở §2, dữ liệu seed có bản ghi thuộc và không thuộc thẻ (gồm phân công `REJECTED`/`REMOVED`, phân công của chu kỳ cũ `cycle < Task.cycle`, việc `DONE` hôm qua, KTV đã nghỉ `is_active = false`) | gọi `/items` bằng vai trò thấy khối đó | `total` luôn bằng đúng số trên thẻ tương ứng ở `GET /dashboard` cùng thời điểm; `kind` đúng: `task.*`, `staff.pending_acceptance`, `mine.*` (trừ `mine.awaiting_confirmation`) → `"task"`; `staff.IN_PROGRESS\|NOT_STARTED\|IDLE` → `"staff"`; `mine.awaiting_confirmation` → `"order"` | integration (tham số hoá 16 thẻ) |
| AC-DASH-087 | Tuấn (TECH_LEAD); 4 đầu việc `IN_PROGRESS` (ĐV2610-0101…0104, hạn 30/10, 31/10, 01/11, 02/11), 0104 có 2 KTV Khoa + Minh | Tuấn gọi `.../task.IN_PROGRESS/items` | 200; `total = 4`; `task_items` sắp xếp hạn sớm trước (như M18-01a); dòng 0104 có `assignee_names = ["Khoa", "Minh"]` (chỉ phân công đang hiệu lực của chu kỳ hiện tại) | integration |
| AC-DASH-088 | 3 KTV đang hoạt động: Khoa có 1 phân công `IN_PROGRESS` + 1 `ACCEPTED`; Đức có 2 phân công `PENDING`; Minh không có phân công mở; thêm KTV Bình `is_active = false` có phân công `IN_PROGRESS` | An (MANAGER) gọi `.../staff.IN_PROGRESS/items`, `.../staff.NOT_STARTED/items`, `.../staff.IDLE/items` | lần lượt chỉ có Khoa / Đức / Minh (Bình không xuất hiện ở đâu); mỗi dòng `staff_items` có `employee_id, employee_code, full_name, phone, open_assignment_count, in_progress_assignment_count` (Khoa: 2, 1; Đức: 2, 0; Minh: 0, 0); sắp xếp theo `full_name` | integration |
| AC-DASH-089 | 1 đầu việc `PENDING_ACCEPTANCE` có 2 KTV cùng `PENDING` + 3 đầu việc `PENDING_ACCEPTANCE` 1 KTV | Tuấn gọi `.../staff.pending_acceptance/items` | `total = 4` (theo task, Q85) = `staff_summary.pending_acceptance_count`; 4 dòng đầu việc | integration |
| AC-DASH-090 | Đức (TECHNICIAN): A1 `PENDING`, A2 `ACCEPTED` quá hạn (hạn 29/10), A3 `IN_PROGRESS`, A4 `DONE` lúc 08:00 hôm nay, A5 `DONE` hôm qua, A6 `REJECTED`; Khoa có 5 phân công khác | Đức gọi lần lượt `mine.pending`, `mine.active`, `mine.not_started`, `mine.overdue`, `mine.done_today` | lần lượt: [A1]; [A2, A3]; [A2]; [A2]; [A4] — không bao giờ có việc của Khoa, A5 hay A6; mỗi dòng có thêm `assignment_status` (trạng thái phân công **của Đức**) | integration |
| AC-DASH-091 | Đức có việc trong đơn DH2610-0021 (`AWAITING_CONFIRMATION`, phân công của Đức `DONE`) và đơn DH2610-0022 (`AWAITING_CONFIRMATION`, không có phân công nào của Đức) | Đức gọi `.../mine.awaiting_confirmation/items` | `total = 1`, chỉ DH2610-0021; `total` (tiền) hiển thị số nguyên VND vì KTV có `order.read_prices` scope `assigned` | integration |
| AC-DASH-092 | Hà [SALE, TECHNICIAN] | Hà gọi `.../order.IN_PROGRESS/items` và `.../mine.active/items` | cả 2 → 200 (Hà thấy cả khối Đơn và khối Việc của tôi); `mine.active` chỉ có phân công của Hà | integration |
| AC-DASH-093 | Khoa (chỉ TECHNICIAN); Hoa (SALE); Linh (CUSTOMER_CARE) | Khoa gọi `.../task.DONE/items` và `.../staff.IDLE/items`; Hoa gọi `.../task.IN_PROGRESS/items`; Linh gọi `.../staff.IN_PROGRESS/items` | cả 4 → **404** `NOT_FOUND` (cùng luật vai trò → khối của `get_dashboard`, như AC-DASH-070) | integration |
| AC-DASH-094 | Tuấn (TECH_LEAD, không có vai trò TECHNICIAN); An (MANAGER) | gọi `.../mine.pending/items` và `.../mine.pending/export` | 404 (chỉ người có vai trò TECHNICIAN thấy khối "Việc của tôi") | integration |
| AC-DASH-095 | Tuấn; 3 KTV ở nhóm "Đang làm", SĐT của 1 KTV là `+84912345678` | gọi `GET .../staff.IN_PROGRESS/export` | 200; CSV UTF-8 BOM; `filename="tong-quan-ktv-dang-lam-2026-10-30.csv"`; tiêu đề cột: `Mã NV, Họ tên, SĐT, Số việc đang mở, Số việc đang làm`; 3 dòng; ô `+84…` được thêm `'` phía trước | integration |
| AC-DASH-096 | Đức; 2 phân công đang làm | gọi `GET .../mine.active/export` | 200; `filename="tong-quan-viec-cua-toi-dang-lam-2026-10-30.csv"`; cột: `Mã đầu việc, Đầu việc, Mã đơn, Khách hàng, Hạn, Trạng thái` (Hạn giờ VN `dd/MM/yyyy HH:mm`; Trạng thái = nhãn tiếng Việt của trạng thái phân công) — **không** có cột KTV | integration |
| AC-DASH-097 | 5.001 đầu việc `DONE` | Tuấn gọi `.../task.DONE/export`; `.../task.DONE/items?page=2` | export → 409 `EXPORT_TOO_LARGE` "Quá nhiều dòng để xuất (tối đa 5.000)."; `/items` vẫn 200, `total = 5001`, 20 dòng | integration |
| AC-DASH-098 | Tuấn ở Tổng quan desktop 1440px, 4 đầu việc `IN_PROGRESS` | bấm thẻ "Đang thực hiện" (khối Đầu việc theo trạng thái) | URL vẫn `/`; popup "Đang thực hiện (4)"; bảng cột Mã đầu việc · Đầu việc · Mã đơn · Khách hàng · KTV · Hạn; có nút "Xuất Excel"; mã đơn link `/orders/{id}`; không link tới `/dispatch/board` | component + e2e |
| AC-DASH-099 | An (MANAGER) ở Tổng quan desktop — trước đây (AC-DASH-041) thẻ khối Nhân sự là `<div>` không bấm được với An | bấm "Chờ giao việc" | popup "Chờ giao việc (1)"; bảng cột Mã NV · Họ tên · SĐT · Số việc đang mở · Số việc đang làm; dòng nhân viên **không** có link | component |
| AC-DASH-100 | Đức (TECHNICIAN) ở Tổng quan mobile 390px | bấm "Quá hạn chưa hoàn thành" | `Sheet` từ dưới, danh sách thẻ (mã đầu việc, tên đầu việc, mã đơn, hạn tô màu `urgent`, nhãn trạng thái phân công); **không** có nút "Xuất Excel"; không cuộn ngang (`scrollWidth <= clientWidth`) | component + e2e |
| AC-DASH-101 | Đức ở Tổng quan desktop | bấm "Chưa hoàn tất, cần KH xác nhận" | popup dòng đơn, cùng cột như popup đơn của M18-01a (Mã đơn · Khách hàng · SĐT · Người tạo · Ngày tạo · Tổng tiền); URL không đổi | component |
| AC-DASH-102 | Tuấn dùng bàn phím, Tab tới bất kỳ thẻ nào trong 16 thẻ | nhấn Enter | popup mở (thẻ là `<button aria-haspopup="dialog">`, có `focus-visible` ring); `Esc` đóng và trả focus về thẻ | component |
| AC-DASH-103 | Tổng quan 390px và 1440px, đăng nhập Tuấn và Đức, popup khối Nhân sự / Việc của tôi đang mở | chạy axe-core | không có vi phạm `serious`/`critical` | e2e |

**AC cũ bị thay thế** (sửa ở spec gốc, gạch ngang + trỏ về đây khi implement): ~~AC-DASH-029~~ (`M10-03`); ~~AC-DASH-040~~, ~~AC-DASH-041~~ (`M10-07b`; AC-DASH-039 là phép đếm, giữ nguyên); ~~AC-DASH-046~~, ~~AC-DASH-047~~ (`M10-07c`; AC-DASH-043/044/045/048/049 giữ nguyên); và hành vi drill-down `to=/dispatch/board?status=…` của khối Đầu việc. Test component/e2e tương ứng sửa theo hành vi mới — **thay đổi yêu cầu do chủ dự án chốt** ở M18-01, không phải làm yếu test.

## 4. API
Không thêm endpoint — mở rộng `GET /api/v1/dashboard/cards/{card}/items` và `/export` của M18-01a (capability `dashboard.read` + luật vai trò → khối).

| Thay đổi | Chi tiết |
|---|---|
| `DashboardCardItemsOut.kind` | thêm `"staff"`; thêm `staff_items?: DashboardStaffRow[]` |
| `DashboardStaffRow` (mới) | `employee_id, employee_code, full_name, phone: str \| None, open_assignment_count: int, in_progress_assignment_count: int` |
| `DashboardTaskRow` | thêm `assignment_status: str \| None` — chỉ có giá trị với thẻ `mine.*` (trạng thái phân công của người gọi), `null` với thẻ khác |

- Điều kiện lọc của từng thẻ dùng **chung một hàm `where`** với hàm đếm trong `dashboard/service.py` (tách `_task_summary`, `_staff_summary`, `_my_task_summary` như đã làm với `_order_summary`/`_dispatch_summary`). Riêng `_staff_summary` hiện nhóm KTV bằng Python → viết lại thành điều kiện SQL trên `Employee` (`EXISTS` phân công `IN_PROGRESS` / `EXISTS` phân công mở và không có `IN_PROGRESS` / không có phân công mở) và dùng điều kiện đó cho cả số lẫn danh sách.
- Thẻ `mine.*` lọc `Task` qua `EXISTS` phân công của người gọi (`employee_id = actor.id`, `cycle = Task.cycle`, trạng thái theo thẻ) — 1 dòng / đầu việc.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `TaskSummarySection`, `StaffSummarySection`, `MyTaskSummarySection`: bỏ `to`/`canViewTaskBoard`, mọi thẻ dùng `onClick` mở `CardDetailDialog` với mã thẻ tương ứng.
- `CardDetailDialog`: thêm cách hiển thị cho `kind = "staff"` (bảng desktop / thẻ mobile: họ tên, mã NV, SĐT, số việc đang mở/đang làm). Với thẻ `mine.*`: ẩn cột "KTV", thêm cột "Trạng thái" (nhãn phân công dùng lại bảng nhãn của trang "Việc của tôi": "Chờ nhận", "Đã nhận", "Đang làm", "Đã xong").
- Tiêu đề, nút, copy rỗng/lỗi/đang xuất: giữ nguyên M18-01a.
- Tên file xuất: `tong-quan-<slug>-<yyyy-mm-dd>.csv`; slug: `dv-<trạng thái>` cho khối Đầu việc (vd `dv-dang-thuc-hien`), `ktv-dang-lam` / `ktv-chua-thuc-hien` / `ktv-cho-giao-viec` / `ktv-chua-tiep-nhan`, `viec-cua-toi-<…>` cho khối Việc của tôi.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Tuấn (QLKT) trên máy tính → Tổng quan → bấm "Đang thực hiện" ở khối "Đầu việc theo trạng thái": popup liệt kê đầu việc, số dòng khớp số trên thẻ, URL không đổi.
2. Bấm "Chờ giao việc" ở khối "Nhân sự kỹ thuật": popup liệt kê KTV đang rảnh; bấm "Xuất Excel" → mở bằng Excel thấy tiếng Việt đúng.
3. Đăng nhập An (Quản lý) → bấm thẻ khối Nhân sự: popup mở được (trước đây không bấm được).
4. Đăng nhập Đức (KTV) trên điện thoại → bấm "Quá hạn chưa hoàn thành": sheet trượt lên, chỉ có việc của Đức, không có nút Excel.

## 8. Giả định & câu hỏi
- Giả định: phạm vi, hành vi "bấm thẻ chỉ mở popup", mobile không có Excel — đã chốt ở M18-01 (2026-10-30), áp y nguyên.
- Giả định: quyền xem popup = quyền thấy khối trên Tổng quan (Quản lý thấy danh sách đầu việc/KTV chỉ đọc — cùng tinh thần Q117 đã chốt).
- Giả định: thẻ `task.DONE`/`task.CANCELLED` liệt kê **toàn bộ lịch sử** (đúng như con số trên thẻ hiện nay); popup phân trang nên không nặng, nhưng xuất Excel sẽ trả 409 khi > 5.000 dòng (giới hạn M18-01a).
- **Q118, Q119 — chủ dự án đồng ý mặc định (2026-10-30).**
- **Q118:** Popup 3 thẻ "Đang làm"/"Chưa thực hiện"/"Chờ giao việc" (khối Nhân sự kỹ thuật) liệt kê **nhân viên kỹ thuật** (Mã NV · Họ tên · SĐT · Số việc đang mở · Số việc đang làm), vì con số trên thẻ là số KTV. Đề xuất mặc định: **đúng như vậy, không link** tới hồ sơ nhân viên (trang Nhân sự cần quyền riêng).
- **Q119:** Popup khối "Việc của tôi" của KTV: hiện cột "Trạng thái phân công" thay cho cột "KTV", mã đơn link `/orders/{id}` (KTV đọc được mọi đơn mình có phân công — scope `assigned`). Có cần thêm link tới trang "Việc của tôi" để KTV bấm nhận/bắt đầu ngay từ popup không? Đề xuất mặc định: **không** — popup chỉ đọc, thao tác vẫn ở trang "Việc của tôi".
