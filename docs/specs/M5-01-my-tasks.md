# M5-01 — Việc của tôi (danh sách, thẻ, gọi/bản đồ)

- **Status:** Approved
- **Backlog:** M5-01 · **Milestone:** M5
- **Liên quan:** `spec/state_machines.yaml#assignment` (6 trạng thái; `cycle`; chỉ `PENDING`/`ACCEPTED`/`IN_PROGRESS`/`DONE` còn là "việc của tôi", `REJECTED`/`REMOVED` là terminal và ẩn); `spec/permissions.yaml` (`assignment.respond: { TECHNICIAN: self }` — capability đã có, dùng luôn cho cả đọc, không sửa YAML; menu `my-work` → `/my-tasks`, badge `pending_assignments_count`); `docs/product/DOMAIN_MODEL.md` §8 (Task) §9 (Assignment) §5 (Order — `customer_name`/`customer_phone`/`service_address` snapshot); `docs/design/UI_GUIDELINES.md` §3 (desktop ≥1024px) §4 (mobile <768px) dòng "Việc của tôi | KTV | Tab: Chờ nhận / Đang làm / Đã xong…"; `docs/specs/M1-02-authz-scope-me.md` AC-AUTH-032 (đăng ký bộ đếm `pending_assignments_count` — hiện là bộ đếm **thử** chỉ trong test, M5-01 thay bằng bộ đếm thật); `docs/architecture/ARCHITECTURE.md` §86 ("Lệnh là POST có tên": `POST /assignments/{id}/reject`… — router `assignments` mới mở ở item này, M5-02/M5-03 thêm các lệnh); `M4-03a-dispatch-board-api.md` (mẫu `TaskBoardItem`, join Order cho `order_code`)

## 1. Mục tiêu
Là kỹ thuật viên, tôi muốn xem danh sách đầu việc được giao cho **chính tôi** (nhóm theo tình trạng tiếp nhận của tôi), gọi điện cho khách hoặc mở bản đồ tới địa chỉ thi công ngay từ thẻ — để biết hôm nay phải làm gì và tới đâu, không cần hỏi thêm Quản lý kỹ thuật.

## 2. Phạm vi
- **Trong phạm vi:**
  - `GET /api/v1/assignments/me` (route mới, router `assignments_router` tiền tố `/api/v1/assignments` — mở sẵn cho M5-02/M5-03 thêm `POST /assignments/{id}/accept|reject|start|complete`): trả toàn bộ phân công **của chính người gọi** đang ở trạng thái `PENDING`/`ACCEPTED`/`IN_PROGRESS`/`DONE`, kèm thông tin task (mã, tiêu đề, mô tả, giờ ước tính, hạn chót, ưu tiên) và đơn (mã đơn, tên khách, SĐT khách, địa chỉ thi công) để hiển thị thẻ không cần gọi API khác.
  - Trạng thái hiển thị là **trạng thái phân công của chính người đó** (`assignment.status`), không phải trạng thái suy ra của task — một task nhiều người có thể có người đã `DONE` khi người khác còn `IN_PROGRESS`; mỗi người thấy đúng tiến độ phần của mình (giống nguyên tắc AC-DSP-095 ở M4-04 nhưng theo hướng ngược — từ KTV nhìn ra, không phải từ QLKT nhìn vào).
  - Chỉ phân công ở **chu kỳ hiện tại của task** (`assignment.cycle == task.cycle`); phân công chu kỳ trước (đã đóng băng khi task mở lại) không hiện — tránh một `DONE` cũ của lần làm trước lẫn vào danh sách đang hoạt động.
  - Sắp theo `due_at` tăng dần (hạn gần nhất lên trước) trong toàn bộ danh sách; FE tự nhóm theo tab.
  - Trang `/my-tasks` (đang là trang giữ chỗ "đang phát triển" — `frontend/src/app/routes.tsx`, menu `my-work`): 3 tab **Chờ nhận** (`PENDING`) / **Đang làm** (`ACCEPTED` + `IN_PROGRESS`) / **Đã xong** (`DONE`); mỗi tab danh sách thẻ (mobile) / bảng (desktop ≥1024px). Thẻ: mã task, tiêu đề, tên khách + địa chỉ (chạm/bấm mở Google Maps ở tab mới), SĐT (chạm/bấm `tel:`), hạn chót (đỏ nếu còn <24h hoặc đã quá hạn), số giờ ước tính.
  - Badge menu `pending_assignments_count` (đã khai trong `spec/permissions.yaml`, hiện chỉ có bộ đếm **thử** trong test theo M1-02) — đăng ký bộ đếm thật: đếm phân công `PENDING` của chính người gọi.
  - Tải/rỗng (riêng theo từng tab, không gộp)/lỗi + nút "Thử lại" đúng mẫu đã dùng ở các trang khác.
- **Ngoài phạm vi:**
  - Nút hành động **Tiếp nhận**/**Từ chối**/**Bắt đầu**/**Hoàn thành** và các lệnh `POST /assignments/{id}/...` tương ứng — M5-02 (tiếp nhận/từ chối) và M5-03 (bắt đầu/hoàn thành).
  - Lọc theo khoảng ngày, đổi tiêu chí sắp xếp qua UI, tìm kiếm — chưa cần, danh sách của 1 người thường nhỏ.
  - Vuốt thẻ (swipe gesture) — UI_GUIDELINES ghi "vuốt là tuỳ chọn, luôn có nút"; nút hành động thuộc M5-02/M5-03 nên vuốt cũng để item đó.
  - Phân công `REJECTED`/`REMOVED` hoặc của chu kỳ trước — không hiện ở màn này (xem giả định §8 nếu cần xem lịch sử, đó là màn KPI/báo cáo khác).

## 3. Acceptance Criteria
> Dữ liệu mẫu: **Trần Minh Khoa** `NV014` [TECHNICIAN]; **Lê Anh Tuấn** `NV015` [TECHNICIAN]; đơn **DH2610-0012** khách "Công ty TNHH Phát Đạt", `customer_phone="0932068787"`, `service_address="45 Nguyễn Trãi, P. Bến Thành, Q.1, TP.HCM"`, đang `IN_PROGRESS`; task **DH2610-0012-T1** "Lắp 4 camera ngoài trời", `estimated_hours=3.5`.

### `GET /api/v1/assignments/me`
| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-ASG-001 | Khoa có 4 phân công hợp lệ (cùng/khác task, chu kỳ hiện tại): T1 `PENDING` hạn 2026-10-09, T2 `ACCEPTED` hạn 2026-10-08, T3 `IN_PROGRESS` hạn 2026-10-10, T4 `DONE` hạn 2026-10-07 — T4 được giao cho cả Khoa và Tuấn, Tuấn đã `DONE` nhưng Khoa còn `IN_PROGRESS` thực tế không, ở đây giả định Khoa cũng `DONE` T4 | Khoa `GET /api/v1/assignments/me` | 200; `items` 4 phần tử sắp theo `due_at` tăng dần (T4→T2→T1→T3); mỗi phần tử có `assignment_id, assignment_status, task_id, task_code, task_title, task_description, estimated_hours, due_at, priority, order_id, order_code, customer_name, customer_phone, service_address`; `assignment_status` của T4 = `DONE` đúng phần của Khoa dù task T4 có thể hiện `status` chung khác nếu người khác chưa xong | integration |
| AC-ASG-002 | Khoa có thêm 1 phân công `REJECTED` (đã từ chối task khác) và 1 `REMOVED` (đã bị gỡ) | Khoa `GET /api/v1/assignments/me` | 200; 2 phân công đó **không** có trong `items` | integration |
| AC-ASG-003 | 4 phân công ở AC-ASG-001 là của Khoa; Tuấn có phân công riêng trên task khác | Tuấn `GET /api/v1/assignments/me` | 200; `items` chỉ gồm phân công của Tuấn, không thấy phân công nào của Khoa (không có tham số nào để truy vấn người khác — không có vector IDOR) | integration |
| AC-ASG-004 | Task T5 chu kỳ 1: Khoa `DONE`; QLKT mở lại (`reopen`) → T5 chu kỳ 2, tạo phân công `PENDING` mới cho Khoa | Khoa `GET /api/v1/assignments/me` | 200; `items` có đúng 1 phân công cho T5 — cái `PENDING` của chu kỳ 2; phân công `DONE` của chu kỳ 1 (đã đóng băng) không xuất hiện | integration |
| AC-ASG-005 | — | Hoa (SALE) / An (MANAGER) / Tuấn (TECH_LEAD) gọi `GET /api/v1/assignments/me` | cả 3: 403 `FORBIDDEN` "Bạn không có quyền thực hiện thao tác này." (không ai trong 3 vai trò này giữ `assignment.respond`) | integration |
| AC-ASG-006 | — | route mới `GET /api/v1/assignments/me` | khai đúng 1 capability `assignment.respond`; nằm trong ma trận RBAC route thật | generated |
| AC-ASG-007 | Khoa có 2 phân công `PENDING`; Tuấn có 0 phân công `PENDING` (chỉ có `ACCEPTED`) | cả 2 `GET /api/v1/me` | Khoa: `counters.pending_assignments_count == 2`; Tuấn: `counters.pending_assignments_count == 0` (khoá vẫn có mặt vì Tuấn giữ `assignment.respond`, giá trị 0); thay thế bộ đếm thử của M1-02 (AC-AUTH-032) bằng bộ đếm thật trong `COUNTERS` registry ở `main.py` | integration |

### Trang `/my-tasks`
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ASG-008 | Khoa có phân công ở cả 3 nhóm: `PENDING`, `ACCEPTED`, `IN_PROGRESS`, `DONE` | mở `/my-tasks` | 3 tab **Chờ nhận** (chỉ `PENDING`) / **Đang làm** (`ACCEPTED` + `IN_PROGRESS`, gộp) / **Đã xong** (chỉ `DONE`); mỗi tab chỉ hiện đúng nhóm của mình, đếm đúng số lượng | component |
| AC-ASG-009 | 1 phân công như dữ liệu mẫu ở §3 | mở tab chứa phân công đó | thẻ hiện: mã `DH2610-0012-T1`, tiêu đề "Lắp 4 camera ngoài trời", "Công ty TNHH Phát Đạt" + địa chỉ, SĐT `0932 06 8787` định dạng hiển thị, hạn chót, "3.5 giờ" | component |
| AC-ASG-010 | thẻ ở AC-ASG-009 | bấm vào địa chỉ / bấm vào SĐT | địa chỉ: mở tab mới tới Google Maps với địa chỉ đã mã hoá URL đúng `service_address`; SĐT: link `tel:0932068787` | component |
| AC-ASG-011 | 3 thẻ: hạn đã qua (quá hạn), hạn còn 5 giờ (<24h), hạn còn 3 ngày | hiện danh sách | thẻ 1 và 2: nhãn hạn chót màu đỏ (`text-urgent` hoặc tương đương token UI_GUIDELINES); thẻ 3: màu trung tính | component |
| AC-ASG-012 | Khoa không có phân công nào ở tab "Đang làm" | mở tab đó | hiện trạng thái rỗng tiếng Việt phù hợp (vd "Không có đầu việc nào đang làm."), không hiện bảng/thẻ trống | component |
| AC-ASG-013 | API `GET /api/v1/assignments/me` đang tải / trả lỗi 500 | mở `/my-tasks` | đang tải: khung chờ (skeleton); lỗi: thông báo tiếng Việt + nút "Thử lại" gọi lại đúng API | component |
| AC-ASG-014 | cùng dữ liệu AC-ASG-008 | mở ở viewport <768px / ≥1024px | <768px: mỗi tab hiện danh sách thẻ xếp dọc; ≥1024px: mỗi tab hiện bảng (Mã · Tiêu đề · Khách & địa chỉ · Hạn chót · Giờ ước tính), vẫn bấm gọi/bản đồ được | component |
| AC-ASG-015 | Khoa đăng nhập, có ≥1 phân công mỗi nhóm | e2e mobile 390px: mở `/my-tasks`, chuyển 3 tab, bấm địa chỉ/SĐT | không cuộn ngang; axe 0 vi phạm serious/critical; link `tel:`/maps đúng `href` (không thực sự điều hướng trong test) | e2e |
| AC-ASG-016 | như trên | e2e desktop 1440px: mở `/my-tasks` | bảng hiện đúng, chuyển tab hoạt động, axe 0 vi phạm serious/critical | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/assignments/me | assignment.respond | — | `MyAssignmentsOut { items: MyAssignmentOut[] }` | — |

`MyAssignmentOut`: `assignment_id, assignment_status (PENDING\|ACCEPTED\|IN_PROGRESS\|DONE), task_id, task_code, task_title, task_description, estimated_hours, due_at, priority, order_id, order_code, customer_name, customer_phone, service_address`.

## 5. Dữ liệu / Migration
Không có — dùng lại bảng `assignments`/`tasks`/`orders` đã có.

## 6. UI
- `/my-tasks`: 3 tab cố định trên cùng (Chờ nhận / Đang làm / Đã xong), mỗi tab là danh sách độc lập (tải/rỗng/lỗi riêng).
- Mobile (<768px): thẻ xếp dọc, vùng chạm ≥44px cho link gọi/bản đồ.
- Desktop (≥1024px): bảng — cột Mã · Tiêu đề · Khách & địa chỉ · Hạn chót · Giờ ước tính; địa chỉ/SĐT trong bảng vẫn là link bấm được.
- Copy tiếng Việt: tên tab "Chờ nhận", "Đang làm", "Đã xong"; rỗng "Không có đầu việc nào [đang chờ tiếp nhận|đang làm|đã hoàn thành]."; lỗi "Không tải được danh sách đầu việc." + nút "Thử lại".
- Icon theo UI_GUIDELINES: hạn chót `CalendarClock`, số giờ `Timer`, địa chỉ `MapPin`, gọi `Phone`.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Đăng nhập bằng một kỹ thuật viên đang có đầu việc được giao.
2. Mở "Việc của tôi" từ thanh điều hướng dưới (mobile) — thấy 3 tab, tab "Chờ nhận" có số đúng badge trên menu.
3. Bấm vào địa chỉ của 1 thẻ → Google Maps mở đúng địa chỉ thi công.
4. Bấm vào SĐT của 1 thẻ → ứng dụng gọi điện mở với đúng số khách.
5. Thu nhỏ/mở rộng trình duyệt qua 1024px — chuyển từ thẻ sang bảng, dữ liệu không đổi.

## 8. Giả định & câu hỏi
- Giả định: tab "Đang làm" gộp cả `ACCEPTED` và `IN_PROGRESS` vì UI_GUIDELINES chỉ liệt kê 3 tab cho 4 trạng thái còn hoạt động của assignment — nút hành động khác nhau (Bắt đầu vs Hoàn thành, thêm ở M5-02/M5-03) vẫn đủ để người dùng biết việc nào cần làm tiếp dù cùng tab.
- Giả định: chỉ hiện phân công của **chu kỳ hiện tại** của task (ẩn phân công chu kỳ trước đã đóng băng sau khi `reopen`) — tránh một việc "Đã xong" cũ từ lần làm trước còn nằm trong danh sách đang hoạt động của người đó; xem lịch sử đầy đủ (mọi chu kỳ) thuộc màn KPI/báo cáo (M7), không phải ở đây.
- Câu hỏi mới: **Q71** — Phân công `DONE` có nên tự rời khỏi tab "Đã xong" sau một khoảng thời gian (vd 7 ngày) để tránh tab phình to theo thời gian, hay giữ nguyên vô thời hạn cho tới khi task bị huỷ/mở lại? Giả định mặc định: giữ nguyên vô thời hạn (danh sách của 1 người không lớn, dọn dẹp để sau nếu cần).

