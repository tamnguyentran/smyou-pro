# M5-03 — Bắt đầu / Hoàn thành đầu việc

- **Status:** Approved
- **Backlog:** M5-03 · **Milestone:** M5
- **Liên quan:** `spec/state_machines.yaml#assignment` (transitions `start` ACCEPTED→IN_PROGRESS, `complete` IN_PROGRESS→DONE; guards `order_in_dispatchable_state`/`task_not_cancelled` cho `start`, chỉ `task_not_cancelled` cho `complete`); `spec/state_machines.yaml#order` (transition `all_tasks_done` IN_PROGRESS/REVISION→AWAITING_CONFIRMATION, guards `has_active_tasks`/`all_active_tasks_done`/`revision_has_work_if_revision`); `spec/permissions.yaml` (`assignment.respond: { TECHNICIAN: self }` — capability đã có, dùng lại); `backend/app/modules/workflow/guards.py` (2 guard `has_active_tasks`/`all_active_tasks_done` còn `PENDING_GUARDS` gắn nhãn M5-03 — item này implement, chuyển sang `GUARDS`); `backend/app/modules/assignments/service.py` (`accept_assignment`/`reject_assignment` — mẫu lock order theo `version`, derive lại `task.status`, bump `order.version` 1 lần/lệnh); `docs/product/DOMAIN_MODEL.md` §9 (cột `actual_hours`, `completion_note` đã có trên `assignments`, chưa dùng); `docs/product/WORKFLOWS.md` §2 (gợi ý hàm dùng chung `reevaluate_order(order)` — item này là nơi đầu tiên cần nó thật sự chạy, vì trước M5-03 không task nào đạt `DONE`); `docs/specs/M5-02-accept-reject-assignment.md` (trang `/my-tasks`, tab "Đang làm" đã mở sẵn, `MyAssignmentOut`).

## 1. Mục tiêu
Là kỹ thuật viên, tôi muốn **bắt đầu làm** một đầu việc đã tiếp nhận và **báo hoàn thành** (kèm ghi chú/giờ thực tế tuỳ chọn) khi xong — để Quản lý kỹ thuật thấy đúng tiến độ, và khi mọi đầu việc của đơn đều xong thì đơn tự chuyển sang chờ khách xác nhận.

## 2. Phạm vi
- **Trong phạm vi:**
  - `POST /api/v1/assignments/{id}/start` — body `{ version }` (version của **đơn hàng**). Chuyển phân công `ACCEPTED → IN_PROGRESS`, `started_at = now`.
  - `POST /api/v1/assignments/{id}/complete` — body `{ version, completion_note?, actual_hours? }`. Chuyển phân công `IN_PROGRESS → DONE` (trạng thái cuối), `done_at = now`, lưu `completion_note`/`actual_hours` nếu có.
  - Cả 2 lệnh chỉ tác động phân công **của chính người gọi**, cùng quy tắc 404 "không phân biệt không tồn tại vs không phải của mình" như `accept`/`reject` (M5-02).
  - Sau mỗi lệnh, `task.status` tính lại từ toàn bộ phân công đang hoạt động của task (như M5-02).
  - **Lệnh `complete` là lệnh đầu tiên có thể đưa một task tới `DONE`** → sau khi derive lại task, nếu đơn đang `IN_PROGRESS` thì kiểm tra thêm 2 guard của transition hệ thống `order.all_tasks_done` (`has_active_tasks`, `all_active_tasks_done`); nếu cả 2 đạt → đơn chuyển `IN_PROGRESS → AWAITING_CONFIRMATION`, ghi 1 `audit_events` riêng (`entity_type=ORDER, actor_id=null, action=all_tasks_done`), giống mẫu `start_dispatch` (system transition, không actor). `order.version` vẫn chỉ tăng **1 lần** cho cả lệnh (như `accept`/`reject`).
    - Đơn đang `REVISION` **không** được tự chuyển `all_tasks_done` ở item này — guard thứ 3 của transition (`revision_has_work_if_revision`) còn `PENDING_GUARDS` (M6-03); xử lý giống cách `cancel_task` đã bỏ qua `fire_order_reevaluate` cho tới khi guard cần có mặt (§8).
  - Thêm 2 trường `completion_note: str | null`, `actual_hours: number | null` vào `MyAssignmentOut` để tab "Đã xong" hiển thị lại nếu cần (không bắt buộc UI dùng ngay ở item này, nhưng tránh phải sửa response lần nữa).
  - UI `/my-tasks`, tab **Đang làm**:
    - Thẻ/dòng có assignment `ACCEPTED` → nút **"Bắt đầu"**, gọi thẳng API (không `ConfirmDialog` — không phải hành động phá huỷ, giống "Tiếp nhận" ở M5-02).
    - Thẻ/dòng có assignment `IN_PROGRESS` → nút **"Báo hoàn thành"**, mở `Sheet` có `Textarea` "Ghi chú" (tuỳ chọn) + input số "Giờ thực tế" (tuỳ chọn, step 0.25) — mẫu `RejectAssignmentSheet.tsx` nhưng không trường nào bắt buộc.
  - Sau khi 1 trong 2 lệnh thành công: toast tiếng Việt, danh sách "Việc của tôi" tải lại (thẻ `complete` biến mất khỏi "Đang làm", xuất hiện ở "Đã xong").
  - `STALE_VERSION`: giống mẫu M5-02 ("Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại").
- **Ngoài phạm vi:**
  - **Ảnh công việc** ("ảnh công việc" trong tên backlog M5-03): chưa có hạ tầng tải/lưu ảnh nào trong code (`task.upload_photo` chỉ là capability khai trong `permissions.yaml`, chưa có module/route) — `M6-01` mới xây pipeline chung (nén client, kiểm magic bytes, lưu an toàn). Xây riêng một đường tải ảnh hẹp cho `TASK_PHOTO` ở item này rồi xây lại cho `CUSTOMER_CONFIRMATION` ở `M6-01` là trùng việc. Đề xuất: item này chỉ làm `completion_note`/`actual_hours`; ảnh công việc chuyển sang làm sau khi `M6-01` có pipeline chung (tái dùng cho cả 2 loại `kind`) — **cần chủ dự án quyết** (Q72, §8).
  - Đơn đang `REVISION` tự chuyển `all_tasks_done` — `M6-03` (guard `revision_has_work_if_revision`).
  - `notify_tech_leads`/`notify_order_owner` (effect của `all_tasks_done`) và `notify_tech_leads_if_task_done` (effect của `complete`) — module Thông báo chưa xây (`M7-01`), bỏ qua giống Q60 (M5-02 đã làm tương tự với `notify_tech_leads` của `reject`), chỉ ghi `audit_events`.
  - `fire_order_reevaluate` của `dispatch/service.py:cancel_task`/`assignments/service.py:reject_assignment` **không** được retrofit để gọi hàm đánh giá đơn mới của item này — hành vi hiện tại của 2 lệnh đó không đổi (huỷ/từ chối không bao giờ tự đưa task tới `DONE` nên không ảnh hưởng `all_tasks_done`).

## 3. Acceptance Criteria
> Dữ liệu mẫu (tiếp theo M5-02): **Trần Minh Khoa** `NV014` [TECHNICIAN]; **Lê Anh Tuấn** `NV015` [TECHNICIAN]; đơn **DH2610-0012** `IN_PROGRESS`, `version=3`; task **DH2610-0012-T1** "Lắp 4 camera ngoài trời" `estimated_hours=4`.

### `POST /api/v1/assignments/{id}/start`
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ASG-042 | T1 chỉ giao Khoa, phân công `ACCEPTED`, đơn `version=3` | Khoa `POST /assignments/{id}/start { version: 3 }` | 200; phân công → `IN_PROGRESS`, `started_at`=now; **task T1 → `IN_PROGRESS`**; đơn `version → 4`; 1 `audit_events` (`entity_type=ASSIGNMENT, action=start, from=ACCEPTED, to=IN_PROGRESS`) | integration |
| AC-ASG-043 | T1 giao Khoa (`ACCEPTED`) và Tuấn (`PENDING`) | Khoa start phân công của mình | 200; phân công Khoa → `IN_PROGRESS`; **task T1 → `IN_PROGRESS`** (rule "có người IN_PROGRESS/DONE" ưu tiên trước rule "còn người PENDING") | integration |
| AC-ASG-044 | Phân công của Khoa còn `PENDING` (chưa tiếp nhận) | Khoa start | 409 `INVALID_TRANSITION` | integration |
| AC-ASG-045 | Phân công trên thuộc Khoa | Tuấn gọi start lên phân công của Khoa | 404 `NOT_FOUND` | integration |
| AC-ASG-046 | Đơn thật `version=3`, Khoa gửi `version: 2` | Khoa start | 409 `STALE_VERSION`; phân công không đổi | integration |
| AC-ASG-047 | Task T1 `cancelled_at` đã set nhưng seed trực tiếp 1 phân công `ACCEPTED` còn sót (kịch bản phòng thủ) | Khoa start | 409 `GUARD_FAILED` guard=`task_not_cancelled` | integration |
| AC-ASG-048 | Đơn seed trực tiếp `COMPLETED`/`CANCELLED` nhưng còn 1 phân công `ACCEPTED` (kịch bản phòng thủ) | Khoa start | 409 `GUARD_FAILED` guard=`order_in_dispatchable_state` | integration |
| AC-ASG-049 | — | Hoa (SALE) / An (MANAGER) / Tuấn-TECH_LEAD gọi start bất kỳ | cả 3: 403 `FORBIDDEN` | integration |
| AC-ASG-050 | — | route `POST /assignments/{id}/start` | khai đúng 1 capability `assignment.respond`; nằm trong ma trận RBAC route thật | generated |

### `POST /api/v1/assignments/{id}/complete`
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ASG-051 | T1 chỉ giao Khoa, `IN_PROGRESS`, đơn `version=3`, T1 là task duy nhất chưa huỷ của đơn | Khoa `POST /assignments/{id}/complete { version: 3, completion_note: "Đã lắp xong 4 camera, đã kiểm tra ghi hình", actual_hours: 3.5 }` | 200; phân công → `DONE`, `done_at`=now, lưu đúng `completion_note`/`actual_hours`; **task T1 → `DONE`**; guard `has_active_tasks`+`all_active_tasks_done` đạt → **đơn `IN_PROGRESS → AWAITING_CONFIRMATION`**; đơn `version → 4` (tăng 1 lần); 2 `audit_events` (`ASSIGNMENT action=complete from=IN_PROGRESS to=DONE`, `ORDER actor_id=null action=all_tasks_done from=IN_PROGRESS to=AWAITING_CONFIRMATION`) | integration |
| AC-ASG-052 | T1 giao Khoa (`IN_PROGRESS`) và Tuấn (`PENDING`) | Khoa complete phân công của mình (không `completion_note`/`actual_hours`) | 200; phân công Khoa → `DONE`; **task T1 vẫn `IN_PROGRESS`** (Tuấn còn `PENDING` → chưa "tất cả `DONE`"); đơn **không** chuyển trạng thái (vẫn `IN_PROGRESS`), chỉ 1 `audit_events` | integration |
| AC-ASG-053 | Đơn có 2 task chưa huỷ: T1 (assignment khác, đang `IN_PROGRESS`) và T2 (chỉ giao Khoa, `IN_PROGRESS`, là assignment duy nhất) | Khoa complete assignment của T2 | 200; task T2 → `DONE`; guard `all_active_tasks_done` **không đạt** (T1 chưa `DONE`) → đơn vẫn `IN_PROGRESS`, không có `audit_events` nào cho `ORDER` | integration |
| AC-ASG-054 | Đơn có T1 đã `cancelled_at` set (huỷ) và T2 (chỉ giao Khoa, `IN_PROGRESS`, là assignment duy nhất, task duy nhất chưa huỷ) | Khoa complete assignment của T2 | 200; task T2 → `DONE`; T1 (đã huỷ) không tính vào `all_active_tasks_done`/`has_active_tasks` → cả 2 guard đạt → đơn → `AWAITING_CONFIRMATION` | integration |
| AC-ASG-055 | như AC-ASG-051, gửi `actual_hours: -1` | Khoa complete | 422 `VALIDATION_ERROR`; phân công không đổi | integration |
| AC-ASG-056 | Phân công trên thuộc Khoa | Tuấn gọi complete lên phân công của Khoa | 404 `NOT_FOUND` | integration |
| AC-ASG-057 | Phân công của Khoa còn `ACCEPTED` (chưa `start`) | Khoa complete | 409 `INVALID_TRANSITION` | integration |
| AC-ASG-058 | Đơn thật `version=3`, Khoa gửi `version: 99` | Khoa complete | 409 `STALE_VERSION`; phân công không đổi | integration |
| AC-ASG-059 | Task T1 `cancelled_at` đã set nhưng seed trực tiếp 1 phân công `IN_PROGRESS` còn sót (kịch bản phòng thủ) | Khoa complete | 409 `GUARD_FAILED` guard=`task_not_cancelled` | integration |
| AC-ASG-060 | — | Hoa (SALE) / An (MANAGER) / Tuấn-TECH_LEAD gọi complete bất kỳ | cả 3: 403 `FORBIDDEN` | integration |
| AC-ASG-061 | — | route `POST /assignments/{id}/complete` | khai đúng 1 capability `assignment.respond`; nằm trong ma trận RBAC route thật | generated |

### Trang `/my-tasks` — tab "Đang làm"
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ASG-062 | Khoa có 1 phân công `ACCEPTED` và 1 `IN_PROGRESS` (cả 2 ở tab Đang làm) | mở `/my-tasks`, tab Đang làm | thẻ `ACCEPTED` có nút "Bắt đầu" (icon `PlayCircle`); thẻ `IN_PROGRESS` có nút "Báo hoàn thành" (icon `BadgeCheck`) thay vì "Bắt đầu"; cả 2 nút ≥44px | component |
| AC-ASG-063 | thẻ `ACCEPTED` ở AC-ASG-062 | bấm "Bắt đầu" | nút chuyển trạng thái đang gọi (disabled); thành công → gọi `POST .../start` đúng `version`, toast "Đã bắt đầu đầu việc.", danh sách tải lại, thẻ đổi nhãn trạng thái "Đang thực hiện" và nút đổi thành "Báo hoàn thành" | component |
| AC-ASG-064 | thẻ `IN_PROGRESS` ở AC-ASG-062 | bấm "Báo hoàn thành" | mở `Sheet` "Báo hoàn thành đầu việc {mã task}?": `Textarea` "Ghi chú" (tuỳ chọn) + input số "Giờ thực tế" (tuỳ chọn, step 0.25); nút "Xác nhận hoàn thành" **không** disabled khi cả 2 trường trống (tuỳ chọn, khác sheet từ chối) | component |
| AC-ASG-065 | sheet đang mở ở AC-ASG-064, để trống cả 2 trường | bấm "Xác nhận hoàn thành" | gọi `POST .../complete` với `version` và không gửi (hoặc gửi null) `completion_note`/`actual_hours`; thành công → đóng sheet, toast "Đã báo hoàn thành đầu việc.", thẻ biến mất khỏi "Đang làm" (sang "Đã xong") | component |
| AC-ASG-066 | API trả `STALE_VERSION` cho 1 trong 2 hành động | bấm Bắt đầu hoặc Xác nhận hoàn thành | hiện "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" gọi lại `GET /assignments/me` | component |
| AC-ASG-067 | Khoa có ≥1 phân công `ACCEPTED` và ≥1 `IN_PROGRESS` | e2e mobile 390px: mở `/my-tasks`, tab Đang làm, bắt đầu 1 thẻ rồi báo hoàn thành 1 thẻ khác | không cuộn ngang; axe 0 vi phạm serious/critical; cả 2 thao tác thành công, thẻ chuyển tab đúng | e2e |
| AC-ASG-068 | như trên | e2e desktop 1440px | bảng hiện đúng nút theo trạng thái trong cột thao tác, cả 2 thao tác hoạt động, axe 0 vi phạm serious/critical | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/assignments/{id}/start | assignment.respond | `{ version }` | `MyAssignmentOut` (đã cập nhật) | 404, 409 (`INVALID_TRANSITION`, `GUARD_FAILED`, `STALE_VERSION`) |
| POST | /api/v1/assignments/{id}/complete | assignment.respond | `{ version, completion_note?, actual_hours? }` | `MyAssignmentOut` (đã cập nhật) | 404, 409, 422 |

`MyAssignmentOut` (M5-01/M5-02) thêm 2 trường: `completion_note: string \| null`, `actual_hours: number \| null`.

**Thứ tự kiểm tra** (giống M5-02 §4): (1) phân công tồn tại **và** thuộc actor → 404; (2) `order.version` khớp body → 409 `STALE_VERSION`; (3) phân công đang ở trạng thái cho phép lệnh (`ACCEPTED` cho `start`, `IN_PROGRESS` cho `complete`) → 409 `INVALID_TRANSITION`; (4) guard của lệnh (`order_in_dispatchable_state`/`task_not_cancelled` cho `start`, chỉ `task_not_cancelled` cho `complete`) → 409 `GUARD_FAILED`; (5) sau khi áp dụng, nếu `complete` làm task đạt `DONE` và đơn đang `IN_PROGRESS`: kiểm 2 guard hệ thống `has_active_tasks`/`all_active_tasks_done` → đạt cả 2 thì chuyển đơn `all_tasks_done` (không có lỗi trả về cho actor nếu không đạt — chỉ đơn giản là đơn không đổi trạng thái).

## 5. Dữ liệu / Migration
Không có — dùng lại cột đã có của bảng `assignments` (`started_at`, `done_at`, `actual_hours`, `completion_note`).

## 6. UI
- Tab **Đang làm** của `/my-tasks`: thẻ (mobile)/dòng (desktop) hiện 1 trong 2 nút tuỳ `assignment_status`: "Bắt đầu" (`ACCEPTED`) hoặc "Báo hoàn thành" (`IN_PROGRESS`), vùng chạm ≥44px.
- "Bắt đầu": gọi thẳng API, không `ConfirmDialog` (không phải hành động phá huỷ).
- Sheet "Báo hoàn thành đầu việc {mã task}?": `Textarea` "Ghi chú" (tuỳ chọn) + input số "Giờ thực tế" (tuỳ chọn, step 0.25, placeholder = `estimated_hours` của task để tham khảo) + nút "Xác nhận hoàn thành" (luôn bật trừ khi đang gọi).
- Toast: "Đã bắt đầu đầu việc." / "Đã báo hoàn thành đầu việc."; `STALE_VERSION` dùng mẫu `Alert` + nút "Tải lại" như M5-02.
- Icon: nút "Bắt đầu" `PlayCircle`, nút "Báo hoàn thành" `BadgeCheck` (theo `UI_GUIDELINES.md` §7).

## 7. Kịch bản UAT thủ công
1. Đăng nhập bằng kỹ thuật viên có 1 đầu việc đã tiếp nhận (tab "Đang làm").
2. Bấm "Bắt đầu" → nhãn trạng thái đổi "Đang thực hiện", nút đổi thành "Báo hoàn thành".
3. Bấm "Báo hoàn thành" → nhập ghi chú + giờ thực tế (tuỳ chọn) → xác nhận → thẻ biến mất khỏi "Đang làm", xuất hiện ở "Đã xong".
4. Nếu đó là đầu việc cuối cùng của đơn → mở trang chi tiết đơn (nếu có quyền) kiểm tra đơn đã chuyển "Chờ khách xác nhận".

## 8. Giả định & câu hỏi
- Giả định: `version` trong body vẫn là **version của đơn hàng** (Order = aggregate root, Q62), giống M5-02.
- Giả định: lệnh `complete` tự đánh giá `order.all_tasks_done` **chỉ khi đơn đang `IN_PROGRESS`** — không áp dụng cho đơn `REVISION`, vì guard thứ 3 của transition đó (`revision_has_work_if_revision`) còn `PENDING_GUARDS` (`M6-03`) và gọi guard chưa implement sẽ lỗi; đơn ở `REVISION` khi mọi task xong sẽ do `M6-03` xử lý. Cùng cách xử lý `dispatch/service.py:cancel_task` đã ghi chú cho `fire_order_reevaluate`.
- Giả định: `actual_hours` chỉ cần validate `≥ 0` (422 nếu âm) — không có guard nghiệp vụ nào trong `spec/state_machines.yaml` áp cho trường này (khác `estimated_hours_positive` của `task.create`), nên không thêm giới hạn trên/step bắt buộc. Nếu chủ dự án muốn áp cùng quy tắc `estimated_hours_positive` (0–200, step 0.25) cho `actual_hours`, cần xác nhận riêng.
- **Q72 (mới, đã thêm vào `OPEN_QUESTIONS.md`):** "Ảnh công việc" nằm trong tên backlog M5-03 nhưng chưa có hạ tầng tải ảnh nào trong code; `M6-01` mới xây pipeline chung (nén, kiểm magic bytes, lưu an toàn) cho ảnh phiếu xác nhận. Đề xuất mặc định: item này **không** làm ảnh công việc — dời sang sau `M6-01`, dùng lại đúng pipeline đó cho `kind=TASK_PHOTO` (thêm 1 item nhỏ riêng), tránh xây 2 lần. Cần chủ dự án quyết có đồng ý dời không, hoặc muốn M5-03 làm luôn một đường tải ảnh tối giản riêng.
