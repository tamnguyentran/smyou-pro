# M4-04 — Lịch & tải việc theo nhân viên

- **Status:** Done
- **Backlog:** M4-04 · **Milestone:** M4
- **Liên quan:** `spec/state_machines.yaml#task` (`derived_status`; hiệu ứng `remove_open_assignments` của lệnh `cancel` — đảm bảo task đã huỷ không còn phân công nào ở trạng thái mở) `#assignment` (6 trạng thái: `PENDING, ACCEPTED, REJECTED, IN_PROGRESS, DONE, REMOVED`); `spec/permissions.yaml` (`task.read`: `MANAGER: all, TECH_LEAD: all, TECHNICIAN: assigned` — capability đã có, không sửa YAML; menu `dispatch-load` → `/dispatch/workload`, capability thừa kế từ mục cha `task.manage`, giống `dispatch-queue`/`dispatch-board`); `docs/product/DOMAIN_MODEL.md` §8 (Task) §9 (Assignment); `docs/design/UI_GUIDELINES.md` §5 ("Lịch & tải việc — theo nhân viên: tổng giờ ước tính task đang mở, hạn chót gần nhất — giúp chọn người khi giao"); `M4-03a-dispatch-board-api.md` (`tasks_router` tiền tố `/api/v1/tasks`, `TaskReader = require("task.read")`, `_INACTIVE_ASSIGNMENT_STATUSES`); `M4-01b-dispatch-task-create-ui.md` (`useActiveTechnicians` — chỉ KTV `is_active=true`, tái dùng tiêu chí cho danh sách người ở màn này); `frontend/src/features/employees/components/EmployeeList.tsx` (mẫu bảng desktop / thẻ mobile tái dùng)

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi muốn xem tổng số đầu việc đang mở và tổng giờ ước tính còn lại của từng kỹ thuật viên — để biết ai đang rảnh/bận trước khi mở panel giao việc.

## 2. Phạm vi
- **Trong phạm vi:**
  - `GET /api/v1/tasks/workload` (mới, trên `tasks_router` đã có — `prefix=/api/v1/tasks`): với mỗi kỹ thuật viên **đang hoạt động** (`role=TECHNICIAN`, `is_active=true` — cùng tiêu chí `useActiveTechnicians`), trả `open_task_count` (số đầu việc đang có phân công mở của người đó), `total_estimated_hours` (tổng `estimated_hours` của các đầu việc đó), `nearest_due_at` (hạn gần nhất trong số đó, `null` nếu không có đầu việc nào đang mở).
  - "Đang mở" tính theo **phân công của chính người đó**, không theo `derived_status` của cả task: chỉ đếm phân công ở trạng thái `PENDING`/`ACCEPTED`/`IN_PROGRESS`. Một task nhiều người có thể có người đã `DONE` phần mình khi người khác chưa — phần đã `DONE` không tính vào tải của người đó (xem AC-DSP-095).
  - Capability `task.read` (đã có), `TaskReader` dùng lại nguyên như `GET /api/v1/tasks` (M4-03a). Mặc định sắp theo `total_estimated_hours` tăng dần, cùng giờ thì theo `full_name` (A→Z, `localeCompare` tiếng Việt).
  - Trang `/dispatch/workload` (đang là trang giữ chỗ "đang phát triển" — xem `frontend/src/app/routes.tsx` dòng 34–46 — nay thành trang thật): bảng (desktop ≥1024px: Tên KTV · Số đầu việc đang mở · Tổng giờ ước tính · Hạn gần nhất) / thẻ xếp dọc (mobile), tải/rỗng/lỗi đúng mẫu đã dùng ở các trang QLKT khác.
- **Ngoài phạm vi:**
  - Lọc theo khoảng ngày, đổi tiêu chí sắp xếp qua UI, hoặc liên kết sang Bảng đầu việc đã lọc theo người (đáng làm sau, cần đồng bộ state qua URL ở `TaskBoardPage` — việc riêng).
  - Kỹ thuật viên đã bị khoá (`is_active=false`) nhưng còn phân công treo (Q69 chưa chốt) — không hiện ở màn này, xem giả định §8.
  - Sửa `GET /api/v1/tasks` (M4-03a) hoặc `TaskBoardPage` (M4-03b) — không đổi hành vi cũ.

## 3. Acceptance Criteria
> Fixture: Tuấn (TECH_LEAD, `task.manage`+`task.read` scope `all`), An (MANAGER, `task.read` scope `all`, không có `task.manage`), Hoa (SALE, không có `task.read`). Khoa, Minh, Dũng (TECHNICIAN đang hoạt động); Lan (TECHNICIAN đã bị khoá, `is_active=false`).
> Task T1 (`estimated_hours=3.0`, `due_at=2026-10-05T09:00+07:00`): Khoa `PENDING`.
> Task T2 (`estimated_hours=5.0`, `due_at=2026-10-06T09:00+07:00`): Khoa `ACCEPTED` + Minh `IN_PROGRESS`.
> Task T3 (`estimated_hours=4.0`, `due_at=2026-10-07T09:00+07:00`): Khoa `DONE` (đã xong phần mình) + Minh `IN_PROGRESS` (task vẫn `derived_status=IN_PROGRESS` vì còn người chưa xong — xem `spec/state_machines.yaml#task.derived_status`).
> Task T4 (`estimated_hours=2.0`, đã huỷ, `derived_status=CANCELLED`): Khoa từng được giao, phân công đã chuyển `REMOVED` do hiệu ứng `remove_open_assignments` của lệnh `cancel`.
> Task T5 (`estimated_hours=1.5`, `due_at=2026-10-03T09:00+07:00`): Lan `PENDING` còn treo (giữ nguyên theo giả định hiện tại của Q69 — khoá nhân viên không tự gỡ phân công).
> Dũng: chưa có phân công nào.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DSP-093 | Như fixture trên | Tuấn `GET /api/v1/tasks/workload` | 200 `{items}` đúng 3 dòng theo thứ tự Dũng, Khoa, Minh (tăng dần theo tổng giờ: 0, 8.0, 9.0); Lan **không** xuất hiện (không hoạt động) | integration |
| AC-DSP-094 | Như trên | — (kiểm riêng dòng Khoa trong response trên) | `open_task_count=2`, `total_estimated_hours=8.0` (= T1+T2, **không** cộng T4 đã huỷ), `nearest_due_at="2026-10-05T09:00:00+07:00"` (T1 — gần hơn T2) | integration |
| AC-DSP-095 | Như trên | — (kiểm riêng dòng Minh trong response trên) | `open_task_count=2`, `total_estimated_hours=9.0` (= T2+T3), `nearest_due_at="2026-10-06T09:00:00+07:00"`; **T3 được tính cho Minh** dù Khoa đã `DONE` phần của mình trên cùng task — tải tính theo phân công của từng người, không theo `derived_status` của task | integration |
| AC-DSP-096 | Dũng chưa có phân công nào | — (kiểm riêng dòng Dũng trong response trên) | `open_task_count=0`, `total_estimated_hours=0`, `nearest_due_at=null` | integration |
| AC-DSP-097 | Như fixture trên | An (MANAGER) `GET /api/v1/tasks/workload` | 200, cùng 3 dòng/số liệu như Tuấn (scope `all` áp dụng cho cả MANAGER) | integration |
| AC-DSP-098 | Như trên | Hoa (SALE, không có `task.read`) `GET /api/v1/tasks/workload` | 403 `FORBIDDEN` | integration |
| AC-DSP-099 | Như trên | Khoa (TECHNICIAN) `GET /api/v1/tasks/workload` | 200 `{items}` **chỉ 1 dòng** — chính Khoa (`open_task_count=2`, `total_estimated_hours=8.0`); theo giả định Q70: scope `assigned` áp cho endpoint tổng hợp = chỉ thấy dòng của chính mình, không thấy Minh/Dũng | integration |
| AC-DSP-100 | — | route `GET /api/v1/tasks/workload` | khai đúng 1 capability (`task.read`); nằm trong ma trận RBAC route thật (test sinh tự động) | generated |
| AC-DSP-101 | Như fixture trên (Tuấn đăng nhập) | Mở `/dispatch/workload` ở desktop (≥1024px) | Thấy bảng 4 cột đúng thứ tự/số liệu AC-DSP-093; dòng Dũng hiện "—" ở cột "Hạn gần nhất" (không phải "Invalid Date"/trống) | component |
| AC-DSP-102 | Như trên | Mở `/dispatch/workload` ở mobile (<768px) | Thấy thẻ xếp dọc, đúng thứ tự/số liệu AC-DSP-093, không phải bảng ngang | component |
| AC-DSP-103 | `GET /api/v1/tasks/workload` đang chạy (chưa trả lời) | Mở trang | Hiện Skeleton đúng hình khung bảng/thẻ, không spinner toàn trang | component |
| AC-DSP-104 | `GET /api/v1/tasks/workload` trả lỗi (500/mất mạng) | Mở trang | Hiện thông báo lỗi tiếng Việt + nút "Thử lại"; bấm "Thử lại" → gọi lại API | component |
| AC-DSP-105 | Không có kỹ thuật viên nào đang hoạt động (`{items: []}`) | Mở trang | `EmptyState`: icon + câu hướng dẫn tiếng Việt, không có bảng/thẻ rỗng | component |
| AC-DSP-106 | Như fixture trên | @screenshot, @a11y ở 390px và 1440px | Không cuộn ngang ở 360px; 0 vi phạm axe mức serious/critical | e2e |
| AC-DSP-107 | Tuấn đăng nhập | Vào menu "Điều phối kỹ thuật" → "Lịch & tải việc" | Điều hướng tới trang thật ở trên (**không** còn là trang giữ chỗ "đang phát triển") | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/tasks/workload | task.read | (không có query param) | `{items}` (item = `EmployeeWorkload`: `employee_id, full_name, open_task_count, total_estimated_hours, nearest_due_at`) | 403 |

## 5. Dữ liệu / Migration
Không có. Chỉ 1 route đọc mới, tổng hợp từ `employees`/`tasks`/`assignments` đã có.

## 6. UI
- Trang `/dispatch/workload`: bỏ khai báo giữ chỗ ở `frontend/src/app/routes.tsx`, thêm `WorkloadPage` thật (giống cách M4-03b thay `/dispatch/board`).
- **Desktop (≥1024px):** bảng, mẫu `EmployeeList.tsx` — cột "Tên KTV" · "Số đầu việc đang mở" · "Tổng giờ ước tính" (format số thường, không phải tiền) · "Hạn gần nhất" (`dd/MM/yyyy HH:mm`, "—" nếu `null`).
- **Mobile (<768px):** thẻ xếp dọc, cùng 4 trường, nhãn rõ ràng (giống mẫu thẻ `DispatchQueuePage`).
- Tải: Skeleton đúng khung bảng/thẻ. Lỗi: thông báo + nút "Thử lại" (gọi lại query). Rỗng: `EmptyState` icon `UserCog`-nhóm hoặc tương tự + "Chưa có kỹ thuật viên nào đang hoạt động."
- Icon: menu đã định nghĩa `CalendarRange` (không đổi); cột "Hạn gần nhất" dùng icon `CalendarClock`, "Tổng giờ ước tính" dùng icon `Timer` (đúng bộ icon UI_GUIDELINES §7).

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Đăng nhập Tuấn (QLKT) → menu "Điều phối kỹ thuật" → "Lịch & tải việc".
2. Thấy danh sách kỹ thuật viên đang hoạt động, sắp theo tổng giờ ước tính tăng dần (người rảnh nhất ở trên).
3. Người có đầu việc đang mở hiện đúng số đầu việc, tổng giờ, hạn gần nhất.
4. Người chưa được giao gì hiện 0 đầu việc, 0 giờ, "—" ở hạn gần nhất.
5. Thu nhỏ cửa sổ xuống khổ điện thoại → kiểm thẻ xếp dọc, không cuộn ngang.

## 8. Giả định & câu hỏi
- **Giả định (chỉ KTV đang hoạt động):** dùng đúng tiêu chí `useActiveTechnicians` (`role=TECHNICIAN`, `is_active=true`) — nhất quán với các picker giao việc đã có (M4-01b). KTV bị khoá nhưng còn phân công treo (Q69 chưa chốt) không hiện ở màn này; nếu Q69 chốt theo hướng khác, màn này cần xem lại cùng lúc.
- **Giả định (đơn vị tính "đang mở" theo người, không theo task):** đếm theo trạng thái phân công của chính người đó (`PENDING`/`ACCEPTED`/`IN_PROGRESS`), không theo `derived_status` suy ra của cả task — vì 1 task nhiều người có thể có người đã xong phần mình trong khi người khác chưa (AC-DSP-095). Đây cũng là lý do không cần lọc riêng theo `task.status != CANCELLED`: hiệu ứng `remove_open_assignments` của lệnh `cancel` đã đảm bảo task huỷ không còn phân công nào ở trạng thái mở.
- **Giả định (thứ tự mặc định):** tăng dần theo tổng giờ ước tính, cùng giờ thì theo tên — giúp thấy ngay người rảnh nhất. Chưa có ô đổi tiêu chí sắp xếp ở UI (ngoài phạm vi §2); đổi sau là thay đổi tương thích xuôi, không cần hỏi trước.
- **Câu hỏi mới Q70:** `task.read` cấp cho TECHNICIAN phạm vi `assigned` (task họ từng có phân công) — áp dụng cho endpoint **tổng hợp theo người** này nghĩa là gì, vì "assigned" vốn là quy tắc lọc *task*, không phải lọc *nhân viên nào xuất hiện trong danh sách tổng hợp*? Giả định mặc định (đang dùng ở AC-DSP-099): chỉ trả về đúng 1 dòng — dòng của chính người gọi — không mở rộng thành "all". Màn hình thực tế chỉ hiện trên menu của TECH_LEAD (capability trang là `task.manage`); giả định này chỉ ảnh hưởng nếu có người gọi API trực tiếp.
