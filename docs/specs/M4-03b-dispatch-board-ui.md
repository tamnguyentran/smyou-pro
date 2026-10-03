# M4-03b — Bảng đầu việc: giao diện

- **Status:** Approved
- **Backlog:** M4-03b (phần giao diện, sau `M4-03a-dispatch-board-api.md`) · **Milestone:** M4
- **Liên quan:** `spec/permissions.yaml` (menu `dispatch-board` → `/dispatch/board`, capability thừa kế từ mục cha `task.manage` — giống `DispatchQueuePage`); `spec/state_machines.yaml#task.states` (6 trạng thái + nhãn + màu — thứ tự cột Kanban); `docs/design/UI_GUIDELINES.md` §5 ("Bảng đầu việc — Kanban theo trạng thái task (desktop), danh sách lọc theo trạng thái (mobile). Task `NEEDS_ASSIGNEE` nổi đỏ đầu cột.") §4 (bottom nav mục `dispatch-board` theo vai trò) §6 (`ChipGroup`, `Skeleton`, `EmptyState`); `M4-03a-dispatch-board-api.md` (`GET /api/v1/tasks`); `frontend/src/features/dispatch/taskStatus.ts` (nhãn/màu trạng thái, tái dùng); `frontend/src/features/dispatch/api.ts` (`useActiveTechnicians`, tái dùng cho ô lọc KTV); `frontend/src/components/ui/Chip.tsx` (`ChipGroup`, đã dùng cho lọc trạng thái đơn ở M3-06 và VAT — tái dùng cho lọc ưu tiên); `frontend/src/features/audit/pages/AuditPage.tsx` (mẫu 2 ô `<input type="date">` cho `occurred_from`/`occurred_to` — tái dùng tên biến cho `due_from`/`due_to`)

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi muốn xem toàn bộ đầu việc của công ty theo dạng Kanban (desktop) hoặc danh sách lọc (mobile), lọc theo kỹ thuật viên/hạn hoàn thành/độ ưu tiên — để biết việc nào đang kẹt (`NEEDS_ASSIGNEE`) và ai đang rảnh/bận mà không phải mở từng đơn.

## 2. Phạm vi
- **Trong phạm vi:**
  - Trang `/dispatch/board` (route đã khai trong menu — `dispatch-board`, nhãn "Bảng đầu việc", icon `KanbanSquare`). Capability vào trang: `task.manage` — giống `DispatchQueuePage` (cùng mục cha menu, không hiện mục/trang với vai trò khác dù họ có `task.read`, nhất quán với cách menu điều phối đang ẩn với MANAGER).
  - Hook `useTaskBoard(filters)` gọi `GET /api/v1/tasks` với `status`/`priority`/`assignee_id`/`due_from`/`due_to` hiện có.
  - Thanh lọc (desktop: hàng ngang trên board; mobile: xếp dọc trên danh sách, trong `Sheet`/panel gấp lại được nếu quá dài):
    - **Ưu tiên:** `ChipGroup` ("Tất cả" + 4 giá trị, dùng lại `taskStatus`-style mapping nhãn ưu tiên đã có ở `TaskCreateSheet`).
    - **KTV:** `<select>` "Tất cả KTV" + danh sách từ `useActiveTechnicians` (đang hoạt động — giống `AssigneePicker`).
    - **Hạn:** 2 ô `<input type="date">` "Từ ngày"/"Đến ngày" (mẫu `AuditPage`), map sang `due_from`/`due_to`.
    - Nút "Xoá lọc" khi có ≥1 lọc đang áp dụng.
  - **Desktop (≥1024px):** Kanban 6 cột theo đúng thứ tự `spec/state_machines.yaml#task.states` (`NEEDS_ASSIGNEE, PENDING_ACCEPTANCE, ACCEPTED, IN_PROGRESS, DONE, CANCELLED`); mỗi cột: tiêu đề = nhãn trạng thái + số lượng; cột `NEEDS_ASSIGNEE` viền/tiêu đề tông `urgent` (nổi đỏ — đúng UI_GUIDELINES). Cột cuộn dọc độc lập khi dài; board cuộn ngang nếu không đủ `1024px` cho 6 cột (vẫn trong vùng nội dung, không cuộn trang).
  - **Mobile (<768px):** danh sách thẻ xếp dọc, lọc **thêm** theo trạng thái bằng `ChipGroup` ngang trên cùng (dùng lại mẫu lọc trạng thái đơn của M3-06) vì không có cột để phân biệt bằng mắt; thẻ hiện mã task, tiêu đề, mã đơn, badge trạng thái, badge ưu tiên, hạn hoàn thành, tên người được giao (hoặc "Chưa có ai" khi `assignees=[]`).
  - Mỗi thẻ/card (cả 2 layout) bấm được cả thẻ → điều hướng `/orders/{order_id}` (tab "Đầu việc" sẽ tự mở task đó — tái dùng `TaskEditSheet` đã có ở M4-02b, **không** làm sheet sửa task mới ở đây).
  - Trạng thái tải (skeleton dạng cột/thẻ), trống (không có task nào khớp lọc), lỗi (+ nút "Thử lại").
- **Ngoài phạm vi:**
  - Kéo-thả đổi cột (đổi trạng thái task chỉ qua lệnh ở M4-02/M5, không qua kéo-thả — rule #4 CLAUDE.md).
  - Sửa/huỷ/thêm-gỡ người ngay trên board (mở `TaskEditSheet` qua trang chi tiết đơn, đã có từ M4-02b).
  - Phân trang/"xem thêm" (theo giả định không phân trang của M4-03a).
  - Đếm/ badge số đầu việc trên mục menu `dispatch-board` (không có trong `spec/permissions.yaml` hiện tại).

## 3. Acceptance Criteria
> Fixture tiếp nối M4-03a: Tuấn (TECH_LEAD, `task.manage`). "Đơn D" có T1 (`PENDING_ACCEPTANCE`, `HIGH`, giao Khoa), T2 (`IN_PROGRESS`, `NORMAL`, giao Khoa+Minh). "Đơn N" có T3 (`NEEDS_ASSIGNEE`, `URGENT`). "Đơn O" có T4 (`DONE`, `LOW`, giao Minh). "Đơn D" có T5 (`CANCELLED`).

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DSP-082 | Tuấn mở `/dispatch/board` ở 1440px | — | `GET /api/v1/tasks` (không lọc) được gọi đúng 1 lần; 6 cột hiện đúng thứ tự `Cần giao lại, Chờ tiếp nhận, Đã tiếp nhận, Đang thực hiện, Hoàn thành, Đã huỷ`; cột "Cần giao lại" có T3, tiêu đề/viền tông đỏ (`urgent`); cột "Chờ tiếp nhận" có T1; "Đang thực hiện" có T2; "Hoàn thành" có T4; "Đã huỷ" có T5 | component |
| AC-DSP-083 | Như trên | Chọn ưu tiên "URGENT" ở `ChipGroup` | Gọi lại `GET /api/v1/tasks?priority=URGENT`; chỉ cột "Cần giao lại" còn T3, 5 cột khác trống (hiện `EmptyState` gọn trong cột, không phải toàn trang) | component |
| AC-DSP-084 | Như trên | Chọn KTV "Khoa" ở ô lọc | Gọi `GET /api/v1/tasks?assignee_id={Khoa.id}`; chỉ T1 (cột "Chờ tiếp nhận") và T2 (cột "Đang thực hiện") còn lại | component |
| AC-DSP-085 | Như trên | Nhập "Từ ngày"/"Đến ngày" chỉ trùng ngày hạn của T2 | Gọi `GET /api/v1/tasks?due_from=…&due_to=…`; chỉ T2 còn lại; bấm "Xoá lọc" → về trạng thái không lọc, gọi lại không tham số | component |
| AC-DSP-086 | Board đang lọc theo 1 vài điều kiện | Bấm vào thẻ T2 | Điều hướng sang `/orders/{Đơn D.id}` (không mở sheet nào ngay trên board) | component |
| AC-DSP-087 | Tuấn mở `/dispatch/board` ở 390px (mobile) | — | Hiện danh sách thẻ xếp dọc (không phải Kanban cột); `ChipGroup` lọc theo **trạng thái** nằm trên cùng, mặc định "Tất cả"; chọn "Cần giao lại" → chỉ còn thẻ T3; không cuộn ngang trang | component |
| AC-DSP-088 | `GET /api/v1/tasks` đang tải | — | Hiện skeleton đúng hình (6 khối cột desktop / khối thẻ mobile), `aria-busy="true"` | component |
| AC-DSP-089 | `GET /api/v1/tasks` lỗi (mạng/server) | — | `EmptyState` báo "Không tải được bảng đầu việc." + nút "Thử lại"; bấm → gọi lại | component |
| AC-DSP-090 | Không có task nào khớp bộ lọc hiện tại (ví dụ ưu tiên hiếm) | — | Mỗi cột (desktop) / toàn danh sách (mobile) hiện `EmptyState` nhẹ "Không có đầu việc phù hợp." — không nhầm với lỗi tải | component |
| AC-DSP-091 | Người dùng không có `task.manage` (ví dụ Hoa — SALE, hoặc An — MANAGER) truy cập trực tiếp URL `/dispatch/board` | — | Trang 403 (`ForbiddenPage`) — giống `DispatchQueuePage`, không gọi `GET /api/v1/tasks` | component |
| AC-DSP-092 | Màn `/dispatch/board` ở 390px | — | Mọi nút lọc/thẻ ≥44px chiều cao chạm; không cuộn ngang (axe-core không có vi phạm `serious`/`critical`) | e2e |

## 4. API
Không có API mới — dùng `GET /api/v1/tasks` của `M4-03a-dispatch-board-api.md`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- **Desktop:** `flex gap-4 overflow-x-auto` 6 cột `min-w-72`, mỗi cột `flex flex-col` tiêu đề sticky + danh sách thẻ cuộn dọc riêng (`max-h` theo viewport). Thẻ: `rounded-xl border border-line bg-card p-3`, mã task + badge ưu tiên ở hàng đầu, tiêu đề, mã đơn (link ngầm — cả thẻ bấm được), hạn hoàn thành (`dd/MM/yyyy HH:mm`), tên người được giao (chip nhỏ mỗi người) hoặc "Chưa có ai".
- **Mobile:** thẻ full-width xếp dọc `space-y-3`, cùng nội dung thẻ như desktop; `ChipGroup` trạng thái cuộn ngang nếu cần, không đẩy nội dung.
- Copy: toast không cần (trang chỉ đọc); lỗi tải: "Không tải được bảng đầu việc."; trống: "Không có đầu việc phù hợp."

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Đăng nhập Tuấn (TECH_LEAD) → vào "Điều phối kỹ thuật" → "Bảng đầu việc".
2. Thấy các cột Kanban, cột "Cần giao lại" nổi đỏ nếu có task chưa giao.
3. Lọc theo 1 kỹ thuật viên → chỉ còn task của người đó ở các cột.
4. Bấm vào 1 thẻ → mở đúng đơn chứa task đó.
5. Thu nhỏ màn hình xuống điện thoại → thấy danh sách thẻ + lọc theo trạng thái thay cho Kanban.

## 8. Giả định & câu hỏi
- **Giả định (điều hướng khi bấm thẻ):** mở trang chi tiết đơn (`/orders/{order_id}`), không dựng sheet sửa task riêng trên board — tránh trùng `TaskEditSheet` đã có (M4-02b). Người dùng tự mở tab "Đầu việc" và bấm đúng task nếu cần sửa — chấp nhận thêm 1 bước bấm để không nhân bản logic sửa task.
- **Giả định (màu hạn hoàn thành trên thẻ):** chỉ áp dụng quy tắc tô đỏ cho **cột** `NEEDS_ASSIGNEE` như UI_GUIDELINES §5 ghi rõ; **không** tô đỏ riêng hạn quá hạn trên từng thẻ ở bảng này (quy tắc "đỏ nếu <24h/quá hạn" trong UI_GUIDELINES §5 chỉ ghi cho màn "Việc của tôi" của KTV, không ghi cho "Bảng đầu việc") — nếu chủ dự án muốn thêm, cần quyết định riêng (không tự suy rộng quy tắc).
