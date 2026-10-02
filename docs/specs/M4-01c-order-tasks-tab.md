# M4-01c — Tab "Đầu việc" trên trang chi tiết đơn

- **Status:** Done
- **Backlog:** M4-01c (tách từ M4-01b — Q64) · **Milestone:** M4
- **Liên quan:** `spec/state_machines.yaml#task.derived_status` + `#task.states` (6 trạng thái task + nhãn + màu — **nguồn sự thật** cho badge) và `#task.commands[create].guards[order_in_dispatchable_state]` (`PENDING_DISPATCH`/`IN_PROGRESS`/`REVISION` — `backend/app/modules/workflow/guards.py:35`); `spec/permissions.yaml` (`order.read` để xem danh sách task — Q61; `task.manage` để hiện nút "Tạo đầu việc"); `M4-01a-dispatch-task-create-api.md` (API dùng ở item này: `GET /orders/{id}/tasks` → `TaskSummary`, `POST /orders/{id}/tasks`); `M4-01b-dispatch-task-create-ui.md` (`TaskCreateSheet` + `AssigneePicker` + `useCreateTask` — dùng lại nguyên, cùng các AC panel tạo task của item đó); `M3-03b-order-list-detail-ui.md` (`OrderDetailTabs`: header sticky + thanh tab pill, mẫu loading/empty/error của `OrderHistoryTab`); `docs/design/UI_GUIDELINES.md` §5 hàng "Chi tiết đơn" (thứ tự tab: Thông tin · Dòng hàng · **Đầu việc** · Tệp đính kèm · Lịch sử) + §6 (`Badge`, `EmptyState`, vùng chạm ≥44px)

## 1. Mục tiêu
Là người theo dõi một đơn (Kinh doanh, Quản lý, Quản lý kỹ thuật, kỹ thuật viên được giao), tôi muốn mở trang chi tiết đơn là thấy ngay đơn đó có những đầu việc nào, ai làm, trạng thái tới đâu; và nếu tôi là Quản lý kỹ thuật thì tạo thêm đầu việc được ngay tại đây, không phải quay về hàng đợi điều phối.

## 2. Phạm vi
Phần giao diện cuối của M4-01 (API xong ở M4-01a, hàng đợi + panel tạo task xong ở M4-01b). Ước lượng ~175 dòng non-test (`OrderTasksTab` ~110, `taskStatus.ts` ~25, hook `useOrderTasks` ~15, nối vào `OrderDetailTabs` ~20, nới kiểu prop của `TaskCreateSheet` ~5) → **không cần tách tiếp**.

- **Trong phạm vi:**
  - Thêm tab **"Đầu việc"** vào `OrderDetailTabs` (`/orders/:id` khi `status != DRAFT`), đặt **giữa "Dòng hàng" và "Lịch sử"** theo UI_GUIDELINES §5; chỉ gọi `GET /orders/{id}/tasks` khi tab được mở (lazy).
  - Danh sách task của đơn: mã task, tiêu đề, badge trạng thái, số giờ ước tính, hạn hoàn thành, tên những người được giao. Bảng (desktop) / thẻ (mobile). Thứ tự y như API trả (`created_at asc`, T1 → T2 → …), FE **không** tự sắp lại.
  - `taskStatus.ts`: `TASK_STATUS_LABEL` + `TASK_STATUS_TONE` chép đúng từ `spec/state_machines.yaml#task.states` (mẫu `orderStatus.ts`), kèm nhánh phòng thủ `neutral` + hiện mã gốc cho trạng thái lạ (như `OrderHistoryTab`).
  - Trạng thái tải (skeleton `aria-busy`), trống (`EmptyState`), lỗi (thông báo + nút "Thử lại").
  - Nút **"Tạo đầu việc"** trong tab, chỉ hiện khi người dùng có capability `task.manage` **và** đơn đang ở trạng thái điều phối được (`PENDING_DISPATCH`/`IN_PROGRESS`/`REVISION` — Q65); bấm → mở lại đúng `TaskCreateSheet` của M4-01b. Tạo xong → toast, sheet đóng, danh sách task + chi tiết đơn (badge trạng thái ở header) tự làm mới.
  - Nới kiểu prop `order` của `TaskCreateSheet` từ `OrderSummary` sang hình dạng tối thiểu nó thật sự dùng (`{ id, code, priority }`) để nhận được cả `Order` (chi tiết) — `OrderDetail` không có `created_by_name` nên không gán được vào `OrderSummary`.
- **Ngoài phạm vi:**
  - Số đếm task trên nhãn tab (phải nạp danh sách trước khi mở tab) — để M4-03.
  - Mở chi tiết 1 task, sửa/huỷ task, thêm/gỡ người giao, `NEEDS_ASSIGNEE` (M4-02); bảng/Kanban đầu việc toàn công ty, lọc theo KTV/hạn/ưu tiên (M4-03).
  - Tab "Tệp đính kèm" (M6); nút "Huỷ đơn khi đang chạy" (`cancel_active`, M4-02).
  - Chọn `order_line_ids` khi tạo task (M4-02, như M4-01b).
  - Sửa `spec/*.yaml` — item này không cần.

## 3. Acceptance Criteria
> Fixture tiếp nối M4-01a/M4-01b: Tuấn (TECH_LEAD, có `task.manage` + `order.read` scope `all`), Hoa (SALE, chủ đơn, **không** có `task.manage`), An (MANAGER, không có `task.manage` — Q05), Khoa + Minh (TECHNICIAN đang hoạt động), Lan (TECHNICIAN, không liên quan đơn). "Đơn D" `IN_PROGRESS` có 2 task: `T1` = `{code:"{Đơn D.code}-T1", title:"Lắp đặt 4 camera tầng 1", status:"PENDING_ACCEPTANCE", estimated_hours:"4.00", due_at:"2026-10-05T09:00:00+07:00", priority:"HIGH", assignees:[Khoa, Minh]}`, `T2` = `{code:"…-T2", title:"Kiểm tra đầu ghi", status:"IN_PROGRESS", estimated_hours:"0.25", due_at:"2026-10-06T14:30:00+07:00", priority:"NORMAL", assignees:[Khoa]}`.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DSP-028 | Tuấn đã đăng nhập, "Đơn D" `IN_PROGRESS` với T1 + T2, desktop 1440px | mở `/orders/{Đơn D.id}` | thanh tab có đúng 4 tab theo thứ tự **Thông tin · Dòng hàng · Đầu việc · Lịch sử**; tab mặc định vẫn "Thông tin" và **chưa** gọi `GET /orders/{id}/tasks`; bấm "Đầu việc" → gọi `GET /orders/{Đơn D.id}/tasks` đúng 1 lần; hiện 2 dòng theo thứ tự API trả (T1 trước T2): mã task, tiêu đề, badge trạng thái, "4 giờ" / "0,25 giờ", hạn `05/10/2026 09:00` / `06/10/2026 14:30` (giờ VN), người được giao "Trần Đăng Khoa, Lê Quang Minh" / "Trần Đăng Khoa" | component + e2e |
| AC-DSP-029 | Tab "Đầu việc" của một đơn có 6 task, mỗi task một trạng thái | mở tab | badge đúng nhãn + tone của `spec/state_machines.yaml#task.states`: `NEEDS_ASSIGNEE`→"Cần giao lại" tone `urgent`; `PENDING_ACCEPTANCE`→"Chờ tiếp nhận" `todo`; `ACCEPTED`→"Đã tiếp nhận" `review`; `IN_PROGRESS`→"Đang thực hiện" `in_progress`; `DONE`→"Hoàn thành" `completed`; `CANCELLED`→"Đã huỷ" `todo`; API trả `status="FOO"` lạ → badge tone `neutral` hiện nguyên `FOO`, không crash trang | component |
| AC-DSP-030 | Tuấn mở tab "Đầu việc" của "Đơn L" (`PENDING_DISPATCH`, chưa có task nào) | mở tab | `EmptyState` icon `ClipboardList` + "Chưa có đầu việc nào." + dòng phụ "Quản lý kỹ thuật tạo đầu việc để giao cho kỹ thuật viên."; trong lúc đang tải hiện skeleton (`aria-busy`), không spinner toàn trang; `GET /orders/{id}/tasks` trả 500 → "Không tải được danh sách đầu việc." + nút "Thử lại" gọi lại đúng 1 lần | component |
| AC-DSP-031 | "Đơn D" `IN_PROGRESS` | so sánh nút "Tạo đầu việc" trong tab theo vai trò và trạng thái đơn | Tuấn (`task.manage`) → thấy nút; Hoa (SALE) và An (MANAGER) → **không** thấy nút nhưng vẫn xem đủ danh sách task; Tuấn mở đơn `PENDING_DISPATCH` → thấy nút (Q65), đơn `REVISION` → thấy nút; Tuấn mở đơn `AWAITING_CONFIRMATION` / `COMPLETED` / `CANCELLED` → **không** thấy nút (ngoài `order_in_dispatchable_state`) | component |
| AC-DSP-032 | Tuấn ở tab "Đầu việc" của "Đơn D" (`IN_PROGRESS`, `version=N`), đã có T1 + T2 | bấm "Tạo đầu việc", điền `title="Nghiệm thu với khách"`, `estimated_hours=1,5`, `due_at=08/10/2026 08:00`, ưu tiên để mặc định, chọn Khoa | `Sheet` "Tạo đầu việc — {Đơn D.code}" mở (đúng panel M4-01b: 6 ô, ưu tiên chọn sẵn theo ưu tiên của đơn, focus ở ô "Tiêu đề đầu việc"); submit → `POST /orders/{Đơn D.id}/tasks` với `{version:N, estimated_hours:1.5, due_at:"2026-10-08T08:00:00+07:00", assignee_ids:[Khoa.id]}`; 200 → sheet đóng, toast "Đã tạo đầu việc {task.code} và giao cho 1 kỹ thuật viên."; danh sách task refetch → 3 dòng, `…-T3` ở cuối | component + e2e |
| AC-DSP-033 | Tuấn ở tab "Đầu việc" của "Đơn L" (`PENDING_DISPATCH`), tạo đầu việc đầu tiên thành công | sau khi sheet đóng | badge ở header đơn đổi từ "Chờ điều phối" sang "Đang thực hiện" (chi tiết đơn refetch sau lệnh), nút "Thu hồi"/"Huỷ đơn" biến mất (`allowed_commands` mới rỗng), danh sách task hiện 1 dòng `…-T1` badge "Chờ tiếp nhận" | component + e2e |
| AC-DSP-034 | Tuấn mở sheet tạo đầu việc từ tab "Đầu việc" của "Đơn D" (`version=N` đang nằm trong cache của trang chi tiết); Hoa vừa sửa liên hệ đơn này ở tab khác (`version` → `N+1`) | bấm "Tạo đầu việc" | 409 `STALE_VERSION` → banner đỏ "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" trong sheet; bấm "Tải lại" → nạp lại `GET /orders/{id}` (cùng cache key với trang chi tiết, không sinh query thứ hai), dữ liệu đã nhập **được giữ**; bấm "Tạo đầu việc" lần nữa → gửi `version=N+1` → 200 | component |
| AC-DSP-035 | Khoa (TECHNICIAN) được giao T1 + T2 của "Đơn D"; Lan (TECHNICIAN) không liên quan đơn này | mỗi người mở `/orders/{Đơn D.id}` | Khoa: 200, thấy tab "Đầu việc" với đủ 2 task (capability `order.read` scope `assigned` — Q61), **không** có nút "Tạo đầu việc"; Lan: trang 404 chuẩn của app (API 404), không gọi `GET /orders/{id}/tasks` | component + e2e |
| AC-DSP-036 | Tuấn ở tab "Đầu việc" của "Đơn D", iPhone 13 (390px) và 1440px | so sánh layout | mobile: mỗi task là 1 thẻ xếp dọc (mã + badge trạng thái ở hàng trên, tiêu đề, rồi số giờ · hạn · người được giao có nhãn), nút "Tạo đầu việc" `w-full`, thanh tab cuộn ngang trong khung chứ không tràn trang; desktop: bảng cột **Mã · Tiêu đề · Trạng thái · Số giờ · Hạn hoàn thành · Người được giao**, nút "Tạo đầu việc" ở trên-phải vùng tab; cả hai: vùng chạm ≥44px, không cuộn ngang toàn trang ở 360px; ảnh chụp 390px + 1440px lưu `reports/screenshots/` | component + e2e |
| AC-DSP-037 | Tuấn ở tab "Đầu việc" (có task) và khi sheet tạo đầu việc đang mở trên trang chi tiết đơn | chạy axe-core | không vi phạm `serious`/`critical` ở cả hai trạng thái; bảng task có `<caption>`/`aria-label` tiếng Việt; badge trạng thái có chữ (không chỉ màu); nút chỉ có icon có `aria-label` tiếng Việt | e2e (`@a11y`) |

## 4. API
Không có route mới — dùng lại M4-01a:

| Method | Path | Capability | Dùng để |
|---|---|---|---|
| GET | /api/v1/orders/{order_id}/tasks | order.read | danh sách task của đơn, item = `TaskSummary` `{id, code, title, status, estimated_hours, due_at, priority, assignees:[{employee_id, full_name}]}` (AC-DSP-028) |
| POST | /api/v1/orders/{order_id}/tasks | task.manage | tạo thêm đầu việc từ tab (AC-DSP-032) — qua `useCreateTask` của M4-01b |
| GET | /api/v1/orders/{order_id} | order.read | `version` + `status` + `priority` cho sheet và header (đã có ở trang chi tiết) |
| GET | /api/v1/me | — | `capabilities` để quyết định hiện nút "Tạo đầu việc" (AC-DSP-031) |

Ghi chú: `estimated_hours` trong `TaskSummary` là **string** (numeric của Postgres) → hiển thị qua `Intl.NumberFormat('vi-VN')` sau khi `Number(...)` ("4 giờ", "0,25 giờ"), không in nguyên `"4.00"`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `features/dispatch/api.ts`: thêm `useOrderTasks(orderId, enabled)` — `enabled=false` khi tab chưa mở (AC-DSP-028 lazy); khoá cache `["order-tasks", orderId]`; `useCreateTask` thêm `invalidateQueries(["order-tasks", task.order_id])` để danh sách tự làm mới (AC-DSP-032/033).
- `features/dispatch/taskStatus.ts` mới: `TASK_STATUS_LABEL` / `TASK_STATUS_TONE` (6 trạng thái, chép từ `spec/state_machines.yaml#task.states`, có comment trỏ về nguồn như `orderStatus.ts`).
- `features/dispatch/components/OrderTasksTab.tsx` mới: nhận `{ order }`, tự lo loading/empty/error, nút "Tạo đầu việc" + mở `TaskCreateSheet`. `OrderDetailTabs` (trong `features/orders`) chỉ thêm 1 tab vào `TABS` và render component này — tái dùng `Badge`, `Button`, `EmptyState` đã có, không viết component UI cơ bản mới.
- Icon (UI_GUIDELINES §7): tab/empty state `ClipboardList`, số giờ `Timer`, hạn chót `CalendarClock`, người được giao `Users`, nút tạo `Plus`.
- Copy tiếng Việt chính xác: nhãn tab "Đầu việc"; cột "Mã", "Tiêu đề", "Trạng thái", "Số giờ", "Hạn hoàn thành", "Người được giao"; nút "Tạo đầu việc"; empty "Chưa có đầu việc nào." + "Quản lý kỹ thuật tạo đầu việc để giao cho kỹ thuật viên."; lỗi "Không tải được danh sách đầu việc." + nút "Thử lại". Các câu trong sheet tạo đầu việc giữ nguyên của M4-01b.
- Định dạng: số giờ `Intl.NumberFormat('vi-VN')` + " giờ"; hạn hoàn thành `formatDateTime` (`dd/MM/yyyy HH:mm`, `Asia/Ho_Chi_Minh`); người được giao nối bằng ", ".

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập Kinh doanh, gửi 1 đơn → `Chờ điều phối`.
2. Đăng nhập Quản lý kỹ thuật, mở `/orders/{mã đơn}` → tab "Đầu việc": thấy "Chưa có đầu việc nào." và nút "Tạo đầu việc".
3. Bấm "Tạo đầu việc", chọn 2 kỹ thuật viên, đặt hạn ngày mai → tạo. Thấy toast, badge ở header đổi thành "Đang thực hiện", danh sách hiện task `…-T1` badge "Chờ tiếp nhận".
4. Tạo thêm 1 đầu việc nữa → thấy 2 dòng đúng thứ tự T1, T2.
5. Đăng nhập lại bằng Kinh doanh (chủ đơn), mở cùng đơn → tab "Đầu việc" xem được 2 đầu việc nhưng **không** có nút "Tạo đầu việc". Thử trên điện thoại (390px): tab cuộn ngang được, mỗi đầu việc là 1 thẻ.

## 8. Giả định & câu hỏi
- Giả định: tab "Đầu việc" hiện với **mọi** vai trò xem được đơn (capability `order.read`, đúng Q61) và ở **mọi** trạng thái đơn khác `DRAFT` — trang `/orders/:id` khi `DRAFT` vẫn là `DraftOrderForm` (M3-02b) nên không có tab nào ở đó.
- Giả định: thứ tự tab theo UI_GUIDELINES §5 (Thông tin · Dòng hàng · Đầu việc · Tệp đính kèm · Lịch sử) → chèn "Đầu việc" trước "Lịch sử"; "Tệp đính kèm" vẫn chưa có (M6).
- Giả định: nút "Tạo đầu việc" ẩn/hiện dựa trên `"task.manage" in me.capabilities` (mẫu `DispatchQueuePage`) + trạng thái đơn; server vẫn là nơi chặn thật (403/409) — FE không tự suy luận kết quả cuối (CLAUDE.md quy tắc 4/5).
- Giả định: không thêm AC mới cho các guard 409 của lệnh tạo task (`at_least_one_assignee`, `estimated_hours_positive`, `due_at_not_in_past`, `assignees_are_active_technicians`) và kiểm client-side của form — các AC validation/guard của M4-01b đã chứng minh ở `TaskCreateSheet`, item này dùng lại nguyên component. AC-DSP-034 vẫn kiểm lại riêng `STALE_VERSION` vì ở ngữ cảnh mới `version` đến từ cache của trang chi tiết (rủi ro thật, không chỉ lặp lại M4-01b).
- **Câu hỏi mới — Q65 (đề xuất: hiện nút "Tạo đầu việc" cho cả đơn `PENDING_DISPATCH`)**: `BACKLOG.md` ghi M4-01c có nút "Tạo đầu việc" cho đơn `IN_PROGRESS`/`REVISION`, nhưng guard `order_in_dispatchable_state` cho phép cả `PENDING_DISPATCH`, và ẩn nút ở chính trạng thái "chờ điều phối" thì khó hiểu với người dùng (Quản lý kỹ thuật đang mở đơn đó mà phải quay về `/dispatch/queue` mới tạo được). *Đề xuất:* nút hiện khi `status ∈ {PENDING_DISPATCH, IN_PROGRESS, REVISION}` — khớp đúng guard của server, một nguồn quy tắc duy nhất.
