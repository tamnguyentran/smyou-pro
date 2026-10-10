# M7-02 — Dashboard theo vai trò

- **Status:** Done
- **Backlog:** M7-02 · **Milestone:** M7
- **Liên quan:** `spec/permissions.yaml#dashboard.read` (MANAGER: all, SALE: own, TECH_LEAD: all, TECHNICIAN: self — không đổi YAML ở item này); `spec/state_machines.yaml#order.states` (7 trạng thái), `#task.derived_status` (6 trạng thái, cột `tasks.status` đã lưu sẵn giá trị suy ra); `docs/product/DOMAIN_MODEL.md` §5 (Order) §8 (Task) §9 (Assignment); `frontend/src/features/home/pages/HomePage.tsx` (trang giữ chỗ bị thay ở item này, comment đã ghi "replaced by the role dashboards in M7-02"); `backend/app/modules/orders/service.py` `RULES["own"]` (`Order.created_by == actor.id`); `backend/app/modules/dispatch/service.py` `count_pending_dispatch` (mẫu đếm), `_vn_day_start_utc` (mẫu quy đổi ngày VN); `backend/app/modules/assignments/service.py` `MyAssignmentOut`/`count_pending_assignments` (mẫu định dạng đầu việc của 1 KTV); `docs/specs/M5-01-my-tasks.md` (nguồn các trường hiển thị thẻ task), `M4-01a-dispatch-task-create-api.md`/`M6-03a-revision-reopen-api.md` (mẫu badge counter trong `GET /me`, không tái dùng ở item này vì đây là trang riêng, không phải badge).

## 1. Mục tiêu
Là Sale/Quản lý kỹ thuật (QLKT)/Kỹ thuật viên (KTV)/Quản lý (Manager), khi mở trang "Tổng quan" tôi muốn thấy ngay số liệu quan trọng theo đúng việc của vai trò mình, để biết cần làm gì tiếp theo mà không phải tự đi lọc từng trang.

## 2. Phạm vi
- Trong phạm vi:
  - 1 API mới `GET /api/v1/dashboard` (capability `dashboard.read`, dùng đúng scope đã khai trong `permissions.yaml`), trả **nhiều phần** (section) tuỳ theo (các) vai trò thật của người gọi — một nhân viên có nhiều vai trò thấy nhiều phần cùng lúc:
    - `order_summary` — hiện nếu có vai trò SALE hoặc MANAGER. Đếm đơn theo trạng thái (7 trạng thái). SALE: chỉ đơn do mình tạo (`own`). MANAGER: toàn công ty (`all`).
    - `dispatch_summary` — hiện nếu có vai trò TECH_LEAD hoặc MANAGER (luôn toàn công ty, không có khái niệm "của tôi"): `pending_dispatch_count` (đơn `PENDING_DISPATCH`), `needs_assignee_count` (đầu việc `NEEDS_ASSIGNEE`), `overdue_task_count` (đầu việc đang mở — không `DONE`/`CANCELLED` — có `due_at` ở quá khứ).
    - `today_tasks` — hiện nếu có vai trò TECHNICIAN: danh sách phân công đang mở (không `REJECTED`/`REMOVED`/`DONE`) của chính người gọi, hạn hoàn thành (`due_at`) rơi vào **hôm nay hoặc đã quá hạn** (giờ Việt Nam), sắp theo `due_at` tăng dần.
  - Trang `/` (route đã có, capability `dashboard.read` đã gắn sẵn) thay `HomePage` giữ chỗ bằng nội dung thật: thẻ số liệu (mobile: xếp dọc; desktop: lưới) theo đúng (các) phần trả về.
  - Thẻ không bấm được (không điều hướng sang trang lọc) — xem "Ngoài phạm vi".
- Ngoài phạm vi (không làm ở item này):
  - Điều hướng/drill-down khi bấm vào thẻ (vd bấm số đơn `PENDING_DISPATCH` → mở `/dispatch/queue` đã lọc sẵn) — để lại cho item sau nếu cần.
  - Số liệu KPI (tỷ lệ đúng hạn, điểm KTV…) — thuộc M8.
  - Tuỳ biến/sắp xếp lại thẻ theo ý người dùng.
  - Đổi badge đếm trong `GET /me` (`pending_dispatch_count`, `pending_assignments_count`, `revision_count`) — giữ nguyên, không liên quan trang này.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-001 | Hoa (SALE) có đơn của mình: 2 `DRAFT`, 3 `PENDING_DISPATCH`, 1 `IN_PROGRESS`, 0 ở các trạng thái còn lại; có thêm 5 đơn `PENDING_DISPATCH` của An (SALE khác, không phải của Hoa) | Hoa `GET /api/v1/dashboard` | 200; `order_summary.scope = "own"`, `order_summary.counts_by_status = {DRAFT:2, PENDING_DISPATCH:3, IN_PROGRESS:1, AWAITING_CONFIRMATION:0, COMPLETED:0, REVISION:0, CANCELLED:0}` (đúng 7 khoá, không tính 5 đơn của An); không có khoá `dispatch_summary`/`today_tasks` trong response | integration |
| AC-DASH-002 | Toàn công ty có 4 đơn `PENDING_DISPATCH` (của nhiều Sale khác nhau) | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | 200; không có khoá `order_summary`; `dispatch_summary.pending_dispatch_count == 4` | integration |
| AC-DASH-003 | 3 đầu việc `status=NEEDS_ASSIGNEE` (thuộc các đơn khác nhau), 2 đầu việc trạng thái khác | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | `dispatch_summary.needs_assignee_count == 3` | integration |
| AC-DASH-004 | Task T1 `status=IN_PROGRESS`, `due_at` = hôm qua (quá hạn); Task T2 `status=ACCEPTED`, `due_at` = ngày mai (chưa quá hạn); Task T3 `status=DONE`, `due_at` = hôm qua (đã xong, không tính); Task T4 `status=CANCELLED`, `due_at` = hôm qua (đã huỷ, không tính) | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | `dispatch_summary.overdue_task_count == 1` (chỉ T1) | integration |
| AC-DASH-005 | Đức (TECHNICIAN) có phân công đang mở: A1 (task T1, `due_at` hôm nay 14:00, `status=ACCEPTED`), A2 (task T2, `due_at` hôm qua, `status=IN_PROGRESS`, quá hạn), A3 (task T3, `due_at` ngày mai, `status=PENDING`, chưa tới hôm nay — **không** vào danh sách), A4 (task T4, `due_at` hôm nay, `status=DONE` — đã xong, **không** vào danh sách) | Đức `GET /api/v1/dashboard` | 200; không có khoá `order_summary`/`dispatch_summary`; `today_tasks` có đúng 2 phần tử, sắp theo `due_at` tăng (A2 trước A1 vì quá hạn hơn); mỗi phần tử có đủ trường như `MyAssignmentOut` (`assignment_id, assignment_status, task_id, task_code, task_title, task_description, estimated_hours, due_at, priority, order_id, order_code, customer_name, customer_phone, service_address`) | integration |
| AC-DASH-006 | Đức (TECHNICIAN) không có phân công đang mở nào hạn hôm nay/quá hạn | Đức `GET /api/v1/dashboard` | 200; `today_tasks == []` (không lỗi, không thiếu khoá) | integration |
| AC-DASH-007 | An (MANAGER); toàn công ty có đơn theo 7 trạng thái (vài đơn mỗi loại, nhiều Sale khác tạo) và các số liệu điều phối như AC-DASH-002/003/004 | An `GET /api/v1/dashboard` | 200; có cả `order_summary` (`scope = "all"`, đếm đúng theo toàn bộ đơn không lọc `created_by`) **và** `dispatch_summary` (giống kết quả Tuấn thấy ở trên); không có `today_tasks` (An không có vai trò TECHNICIAN) | integration |
| AC-DASH-008 | Nhân viên có 2 vai trò SALE **và** TECH_LEAD (vd Tuấn được cấp thêm vai trò SALE) | Gọi `GET /api/v1/dashboard` | 200; response có **cả** `order_summary` (scope `own`, đơn do chính người này tạo) **và** `dispatch_summary` — không vai trò nào bị "che" bởi vai trò khác | integration |
| AC-DASH-009 | Chưa đăng nhập (không có cookie session hợp lệ) | gọi `GET /api/v1/dashboard` | 401 | integration (mẫu chung, theo `M1-02`) |
| AC-DASH-010 | Hoa (SALE) mở trang "Tổng quan" trên mobile (390px) | render | Thấy tiêu đề "Tổng quan", 1 thẻ mỗi trạng thái đơn (7 thẻ) xếp dọc, mỗi thẻ: nhãn tiếng Việt của trạng thái (từ `state_machines.yaml#order.states.*.label`) + số đếm lớn; thẻ trạng thái `0` vẫn hiện (không ẩn) | component |
| AC-DASH-011 | Tuấn (TECH_LEAD) mở trang "Tổng quan" trên desktop (1440px) | render | Lưới 3 thẻ: "Chờ điều phối", "Cần giao lại", "Quá hạn" — thẻ "Quá hạn" có tông màu `urgent` khi số > 0, tông trung tính khi = 0 | component |
| AC-DASH-012 | Đức (TECHNICIAN) mở trang "Tổng quan"; `today_tasks` rỗng | render | Trạng thái trống: icon lucide + câu "Không có việc nào đến hạn hôm nay 🎉"-kiểu trung tính (không emoji thật trong code, chỉ icon) + không có CTA (không có hành động tạo gì ở đây) | component |
| AC-DASH-013 | Đức (TECHNICIAN) mở trang "Tổng quan"; `today_tasks` có 2 phần tử, 1 quá hạn | render | Mỗi phần tử hiện như thẻ task (mã, tiêu đề, khách + địa chỉ, SĐT, hạn chót); hạn chót của phần tử quá hạn hiện màu đỏ (cùng quy tắc `text-urgent` như `M5-01`) | component |
| AC-DASH-014 | An (MANAGER) mở trang "Tổng quan" | render | Thấy cả khối "Đơn theo trạng thái" (7 thẻ, toàn công ty) và khối "Điều phối" (3 thẻ) trên cùng trang, có tiêu đề phụ phân nhóm rõ ràng | component |
| AC-DASH-015 | Bất kỳ vai trò, API trả lỗi mạng/5xx | render | Trang hiện trạng thái lỗi chung (component `StatusPage`/lỗi đã dùng ở các trang khác), có nút "Tải lại" | component |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/dashboard | dashboard.read | — | `DashboardOut` (xem dưới) | 401 |

`DashboardOut` — mọi khoá đều **tuỳ chọn** (`null`/vắng mặt nếu vai trò không phù hợp, không bao giờ trả lỗi vì "thiếu vai trò"):
```jsonc
{
  "order_summary": {                 // null nếu không có vai trò SALE/MANAGER
    "scope": "own" | "all",          // "all" nếu có vai trò MANAGER, ngược lại "own"
    "counts_by_status": {            // đủ 7 khoá, giá trị 0 nếu không có đơn
      "DRAFT": 0, "PENDING_DISPATCH": 0, "IN_PROGRESS": 0,
      "AWAITING_CONFIRMATION": 0, "COMPLETED": 0, "REVISION": 0, "CANCELLED": 0
    }
  },
  "dispatch_summary": {               // null nếu không có vai trò TECH_LEAD/MANAGER
    "pending_dispatch_count": 0,
    "needs_assignee_count": 0,
    "overdue_task_count": 0
  },
  "today_tasks": [ /* MyAssignmentOut[] — null nếu không có vai trò TECHNICIAN; [] nếu có vai trò nhưng rỗng */ ]
}
```
Thứ tự ưu tiên khi nhiều vai trò áp dụng cho cùng 1 khoá: chỉ `order_summary.scope` có xung đột (SALE+MANAGER) → MANAGER thắng (`all`). `dispatch_summary` không có khoá "của tôi" nên không xung đột.

## 5. Dữ liệu / Migration
Không có bảng/cột mới. Toàn bộ số liệu tính trực tiếp từ `orders.status`, `tasks.status`, `tasks.due_at`, `assignments.status`/`employee_id` hiện có.

## 6. UI
- Route `/` (menu `dashboard`, đã gắn `dashboard.read`): thay nội dung `HomePage` hiện tại (chào tên) bằng:
  - Mobile (<768px): các khối xếp dọc theo thứ tự `order_summary` → `dispatch_summary` → `today_tasks` (chỉ render khối có dữ liệu); mỗi khối có tiêu đề phụ (`text-sm font-semibold text-muted`); thẻ số liệu dạng lưới 2 cột; thẻ task (today_tasks) dạng card đầy chiều ngang như `M5-01`.
  - Desktop (≥1024px): mỗi khối số liệu thành lưới 3–4 cột (`grid-cols-3`/`grid-cols-4` tuỳ số thẻ); `today_tasks` giữ dạng danh sách card dọc (không bảng — chỉ 1 người, danh sách ngắn).
  - Thẻ số liệu: nhãn tiếng Việt (nhãn trạng thái từ `state_machines.yaml`, hoặc nhãn cố định "Chờ điều phối"/"Cần giao lại"/"Quá hạn") + số lớn (`text-2xl font-bold`); thẻ `overdue_task_count`/`needs_assignee_count` > 0 dùng tông màu `urgent` (viền/số), còn lại tông trung tính — không dùng màu đỏ cho thẻ bằng 0.
  - Trống (`today_tasks == []`): icon lucide `CalendarClock` màu muted + "Không có việc nào đến hạn hôm nay."
  - Lỗi tải API: `StatusPage` lỗi chung (giống trang khác), nút "Tải lại".
  - Tải: skeleton khối hình chữ nhật theo đúng số thẻ dự kiến theo vai trò đang đăng nhập (biết trước từ `GET /me` roles, không cần đợi `GET /api/v1/dashboard` để biết hiện khối nào).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Hoa (SALE) → mở "Tổng quan" → thấy 7 thẻ trạng thái đơn, số khớp với số đơn do Hoa tạo (đối chiếu trang "Đơn hàng" lọc theo trạng thái).
2. Đăng nhập Tuấn (TECH_LEAD) → mở "Tổng quan" → thấy 3 thẻ "Chờ điều phối"/"Cần giao lại"/"Quá hạn", số "Chờ điều phối" khớp số đơn ở `/dispatch/queue`.
3. Đăng nhập Đức (TECHNICIAN), có 1 đầu việc hạn hôm nay chưa làm → mở "Tổng quan" → thấy đúng đầu việc đó trong danh sách.
4. Đăng nhập An (MANAGER) → mở "Tổng quan" → thấy cả 7 thẻ đơn (toàn công ty, không chỉ của An) và 3 thẻ điều phối trên cùng trang.

## 8. Giả định & câu hỏi
- Giả định: "việc hôm nay" của KTV gồm cả đầu việc **đã quá hạn** (không chỉ đúng hạn hôm nay) — vì KTV cần thấy việc trễ để xử lý trước, không nên giấu đi. Nếu sai, dễ sửa thành chỉ lọc đúng ngày hôm nay.
- Giả định: `order_summary` đếm đủ 7 trạng thái kể cả `DRAFT`/`CANCELLED` (Sale cũng cần thấy đơn nháp chưa gửi và đơn đã huỷ của mình) — không lọc bớt trạng thái nào.
- Giả định: "quá hạn" (`overdue_task_count`, và lọc `today_tasks`) so `due_at` với thời điểm hiện tại theo giờ máy chủ (UTC), quy đổi hiển thị/ranh giới "hôm nay" theo giờ Việt Nam (giống `_vn_day_start_utc` đã dùng ở `M4-03a`) — không có giờ hành chính đặc biệt (đã chốt ở Q14/archive: so theo giờ đồng hồ, không trừ Chủ nhật/lễ).
- Không có câu hỏi mới cần chốt — toàn bộ dựa trên scope/role đã có sẵn trong `permissions.yaml`, không đổi quy tắc nghiệp vụ nào.
