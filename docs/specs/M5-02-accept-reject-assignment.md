# M5-02 — Tiếp nhận / Từ chối (lý do)

- **Status:** Done
- **Backlog:** M5-02 · **Milestone:** M5
- **Liên quan:** `spec/state_machines.yaml#assignment` (transitions `accept` PENDING→ACCEPTED, `reject` PENDING→REJECTED, guards `order_in_dispatchable_state`/`task_not_cancelled`/`reject_reason_code_present`/`reject_reason_text_present`; `reject_reason_codes` BUSY/SICK/SKILL/DISTANCE/OTHER); `spec/permissions.yaml` (`assignment.respond: { TECHNICIAN: self }` — capability đã có, dùng lại, không sửa YAML); `backend/app/modules/workflow/guards.py` (2 guard còn `PENDING_GUARDS` gắn nhãn M5-02 — item này implement và chuyển sang `GUARDS`); `backend/app/modules/dispatch/service.py` (`remove_assignee`/`add_assignee` — mẫu derive lại `task.status` sau khi đổi 1 assignment, `_check_assignment_transition`); `docs/architecture/ARCHITECTURE.md` §86 (lệnh POST có tên, body luôn có `version`, `orders.version` là aggregate root — Q62 archive); `docs/design/UI_GUIDELINES.md` §6 ("từ chối" nằm trong nhóm hành động cần `ConfirmDialog`/sheet nêu rõ hậu quả, "Tiếp nhận" không thuộc nhóm đó); `docs/specs/M5-01-my-tasks.md` (trang `/my-tasks`, 3 tab, `MyAssignmentOut`, router `assignments` đã mở sẵn).

## 1. Mục tiêu
Là kỹ thuật viên, tôi muốn **tiếp nhận** hoặc **từ chối kèm lý do** một đầu việc đang ở tab "Chờ nhận" ngay trên "Việc của tôi" — để Quản lý kỹ thuật biết ai thực sự đang làm việc đó mà không cần hỏi qua điện thoại.

## 2. Phạm vi
- **Trong phạm vi:**
  - `POST /api/v1/assignments/{id}/accept` — body `{ version }` (version của **đơn hàng**, Order là aggregate root — Q62). Chuyển phân công `PENDING → ACCEPTED`.
  - `POST /api/v1/assignments/{id}/reject` — body `{ version, reason_code, reason_text }`. Chuyển phân công `PENDING → REJECTED` (trạng thái cuối, không hoàn tác).
  - Cả 2 lệnh chỉ tác động phân công **của chính người gọi** (`assignment.employee_id == actor.id`) — phân công không tồn tại hoặc không phải của người gọi trả lời giống hệt nhau: 404 (không lộ thông tin phân công của người khác, giống nguyên tắc AC-ASG-003 ở M5-01).
  - Sau khi đổi 1 phân công, `task.status` được tính lại từ toàn bộ phân công đang hoạt động của task đó (giống `add_assignee`/`remove_assignee` ở `dispatch/service.py`) — vd phân công cuối cùng còn `PENDING` bị từ chối → task về `NEEDS_ASSIGNEE`.
  - Thêm trường `order_version` vào `MyAssignmentOut` (bổ sung không phá vỡ hợp đồng cũ của M5-01) để FE có `version` cần gửi khi gọi 2 lệnh trên mà không phải gọi thêm API.
  - UI `/my-tasks`, tab **Chờ nhận**: mỗi thẻ/dòng có 2 nút **Tiếp nhận** và **Từ chối**.
    - **Tiếp nhận**: gọi thẳng API (không phải hành động phá huỷ — UI_GUIDELINES §6 không liệt "tiếp nhận" vào nhóm cần `ConfirmDialog`), nút hiện trạng thái đang gọi.
    - **Từ chối**: mở `Sheet` chọn 1 trong 5 lý do (nhãn tiếng Việt theo `spec/state_machines.yaml#reject_reason_codes`) + ô nhập lý do chi tiết bắt buộc ≥5 ký tự (mẫu `CancelTaskSheet.tsx`), nút "Xác nhận từ chối" disabled tới khi hợp lệ.
  - Sau khi 1 trong 2 lệnh thành công: đóng sheet (nếu có), toast tiếng Việt, danh sách "Việc của tôi" và badge `pending_assignments_count` tải lại.
  - `STALE_VERSION`: thông báo "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" (mẫu `CancelTaskSheet.tsx` nhánh `staleVersion`).
- **Ngoài phạm vi:**
  - **Bắt đầu**/**Hoàn thành** (`start`/`complete`) — M5-03.
  - Thông báo thật cho Quản lý kỹ thuật khi bị từ chối (`notify_tech_leads`) — module Thông báo chưa xây (M7-01), bỏ qua giống cách M4-01/M4-02 đã xử lý (Q60) — chỉ ghi `audit_events`.
  - `fire_order_reevaluate` không có tác dụng thật ở item này: guard `has_active_tasks`/`all_active_tasks_done` mà nó cần vẫn `PENDING_GUARDS` (M5-03, `complete` chưa tồn tại nên không task nào đạt `DONE` qua lệnh này) — cùng cách xử lý `cancel_task` đã ghi chú trong code.

## 3. Acceptance Criteria
> Dữ liệu mẫu (tiếp theo M5-01): **Trần Minh Khoa** `NV014` [TECHNICIAN]; **Lê Anh Tuấn** `NV015` [TECHNICIAN]; đơn **DH2610-0012** đang `IN_PROGRESS`, `version=3`; task **DH2610-0012-T1** "Lắp 4 camera ngoài trời" `cycle=1`.

### `POST /api/v1/assignments/{id}/accept`
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ASG-017 | T1 chỉ giao cho Khoa, phân công `PENDING`, `due_at` tương lai; đơn `version=3` | Khoa `POST /assignments/{id}/accept { version: 3 }` | 200; phân công → `ACCEPTED`, `accepted_at` = now; **task T1 → `ACCEPTED`** (phân công hoạt động duy nhất đã accept); đơn `version → 4`; 1 `audit_events` (`entity_type=ASSIGNMENT, action=accept, from=PENDING, to=ACCEPTED`) | integration |
| AC-ASG-018 | T1 giao cho cả Khoa và Tuấn, cả 2 `PENDING` | Khoa accept phân công của mình | 200; phân công của Khoa → `ACCEPTED`; **task T1 vẫn `PENDING_ACCEPTANCE`** (phân công của Tuấn còn `PENDING`) | integration |
| AC-ASG-019 | Phân công trên thuộc Khoa | Tuấn gọi `POST /assignments/{id của Khoa}/accept { version: 3 }` | 404 `NOT_FOUND` — giống hệt response khi id không tồn tại (không lộ phân công có thật của người khác) | integration |
| AC-ASG-020 | Phân công của Khoa đã `ACCEPTED` từ trước | Khoa accept lại cùng phân công | 409 `INVALID_TRANSITION` "Phân công đang ở trạng thái không cho phép thao tác này." | integration |
| AC-ASG-021 | Đơn thật đang `version=3`, Khoa gửi `version: 2` | Khoa accept | 409 `STALE_VERSION` "Thông tin đã bị người khác thay đổi. Vui lòng tải lại."; phân công không đổi | integration |
| AC-ASG-022 | Task T1 đã `cancelled_at` set (huỷ) nhưng seed trực tiếp 1 phân công `PENDING` còn sót (kịch bản phòng thủ, guard `task_not_cancelled`) | Khoa accept | 409 `GUARD_FAILED` guard=`task_not_cancelled` | integration |
| AC-ASG-023 | Đơn seed trực tiếp ở trạng thái `COMPLETED`/`CANCELLED` nhưng còn 1 phân công `PENDING` (kịch bản phòng thủ, guard `order_in_dispatchable_state`) | Khoa accept | 409 `GUARD_FAILED` guard=`order_in_dispatchable_state` | integration |
| AC-ASG-024 | — | Hoa (SALE) / An (MANAGER) / Tuấn-TECH_LEAD gọi accept bất kỳ | cả 3: 403 `FORBIDDEN` (không vai trò nào giữ `assignment.respond`) | integration |
| AC-ASG-025 | — | route `POST /assignments/{id}/accept` | khai đúng 1 capability `assignment.respond`; nằm trong ma trận RBAC route thật | generated |

### `POST /api/v1/assignments/{id}/reject`
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ASG-026 | T1 chỉ giao cho Khoa, `PENDING`, đơn `version=3` | Khoa `POST /assignments/{id}/reject { version: 3, reason_code: "DISTANCE", reason_text: "Địa chỉ quá xa, không kịp di chuyển trong ngày" }` | 200; phân công → `REJECTED` (trạng thái cuối), `rejected_at`=now, lưu đúng `reject_reason_code`/`reject_reason_text`; **task T1 → `NEEDS_ASSIGNEE`** (không còn phân công hoạt động nào); đơn `version → 4`; 1 `audit_events` (`action=reject, from=PENDING, to=REJECTED, data` chứa lý do) | integration |
| AC-ASG-027 | T1 giao cho cả Khoa và Tuấn, cả 2 `PENDING` | Khoa reject phân công của mình (lý do hợp lệ) | 200; phân công Khoa → `REJECTED`; **task T1 vẫn `PENDING_ACCEPTANCE`** (phân công Tuấn còn `PENDING` → vẫn còn người đang hoạt động) | integration |
| AC-ASG-028 | như AC-ASG-026 | Khoa reject với `reason_text: "xa"` (trimmed 2 ký tự) | 409 `GUARD_FAILED` guard=`reject_reason_text_present` "Vui lòng nhập lý do (ít nhất 5 ký tự)."; phân công không đổi | integration |
| AC-ASG-029 | như AC-ASG-026 | Khoa reject thiếu `reason_code` hoặc gửi `reason_code: "KHAC"` (ngoài 5 mã hợp lệ) | 422 `VALIDATION_ERROR`; phân công không đổi | integration |
| AC-ASG-030 | Phân công trên thuộc Khoa | Tuấn gọi reject lên phân công của Khoa | 404 `NOT_FOUND` | integration |
| AC-ASG-031 | Phân công của Khoa đã `REJECTED` (từ chối trước đó) | Khoa reject lại | 409 `INVALID_TRANSITION` | integration |
| AC-ASG-032 | Đơn thật `version=3`, Khoa gửi `version: 99` | Khoa reject (lý do hợp lệ) | 409 `STALE_VERSION`; phân công không đổi | integration |
| AC-ASG-033 | — | Hoa (SALE) / An (MANAGER) / Tuấn-TECH_LEAD gọi reject bất kỳ | cả 3: 403 `FORBIDDEN` | integration |
| AC-ASG-034 | — | route `POST /assignments/{id}/reject` | khai đúng 1 capability `assignment.respond`; nằm trong ma trận RBAC route thật | generated |

### Trang `/my-tasks` — nút Tiếp nhận / Từ chối
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ASG-035 | Khoa có 1 phân công `PENDING` (tab Chờ nhận) và 1 `ACCEPTED` (tab Đang làm) | mở `/my-tasks` | thẻ ở tab **Chờ nhận** có 2 nút "Tiếp nhận"/"Từ chối" (≥44px); thẻ ở tab **Đang làm** không có 2 nút này | component |
| AC-ASG-036 | thẻ ở AC-ASG-035, tab Chờ nhận | bấm "Tiếp nhận" | nút chuyển trạng thái đang gọi (disabled); thành công → gọi `POST .../accept` đúng `version`, toast "Đã tiếp nhận đầu việc.", danh sách tải lại (thẻ biến mất khỏi Chờ nhận) | component |
| AC-ASG-037 | thẻ ở AC-ASG-035, tab Chờ nhận | bấm "Từ chối" | mở `Sheet` "Từ chối đầu việc {mã task}?": 5 lựa chọn lý do (nhãn đúng `reject_reason_codes`), ô nhập chi tiết; nút "Xác nhận từ chối" disabled khi chưa chọn lý do hoặc chi tiết <5 ký tự (trim) | component |
| AC-ASG-038 | sheet đang mở ở AC-ASG-037, đã chọn "Địa điểm quá xa / không di chuyển được" + nhập đủ chi tiết | bấm "Xác nhận từ chối" | gọi `POST .../reject` đúng `version/reason_code/reason_text`; thành công → đóng sheet, toast "Đã từ chối đầu việc.", thẻ biến mất khỏi Chờ nhận | component |
| AC-ASG-039 | API trả `STALE_VERSION` cho 1 trong 2 hành động | bấm Tiếp nhận hoặc Xác nhận từ chối | hiện "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" gọi lại `GET /assignments/me` | component |
| AC-ASG-040 | Khoa có ≥1 phân công `PENDING` | e2e mobile 390px: mở `/my-tasks`, tab Chờ nhận, tiếp nhận 1 thẻ rồi từ chối 1 thẻ khác (chọn lý do) | không cuộn ngang; axe 0 vi phạm serious/critical; cả 2 thao tác thành công, thẻ biến mất đúng | e2e |
| AC-ASG-041 | như trên | e2e desktop 1440px | bảng hiện 2 nút trong cột thao tác, cả 2 thao tác hoạt động, axe 0 vi phạm serious/critical | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/assignments/{id}/accept | assignment.respond | `{ version }` | `MyAssignmentOut` (đã cập nhật) | 404, 409 (`INVALID_TRANSITION`, `GUARD_FAILED`, `STALE_VERSION`) |
| POST | /api/v1/assignments/{id}/reject | assignment.respond | `{ version, reason_code, reason_text }` | `MyAssignmentOut` (đã cập nhật) | 404, 409, 422 |

`reason_code`: 1 trong `BUSY\|SICK\|SKILL\|DISTANCE\|OTHER`. `MyAssignmentOut` (M5-01) thêm trường `order_version: int` (version của đơn chứa task — dùng cho cả 2 lệnh trên, kể cả lệnh `GET /assignments/me` cũng trả về để FE không phải gọi thêm API).

**Thứ tự kiểm tra** (cùng 1 request chỉ có thể rơi vào đúng 1 nhánh, nhưng thứ tự quyết định AC nào áp dụng khi nhiều điều kiện cùng sai): (1) phân công tồn tại **và** thuộc chính actor → 404 nếu không; (2) `order.version` khớp body → 409 `STALE_VERSION`; (3) phân công đang ở trạng thái cho phép lệnh (`PENDING`) → 409 `INVALID_TRANSITION`; (4) guard của lệnh (`order_in_dispatchable_state`/`task_not_cancelled` cho accept, `reject_reason_text_present` cho reject) → 409 `GUARD_FAILED`.

## 5. Dữ liệu / Migration
Không có — dùng lại cột đã có của bảng `assignments` (`reject_reason_code`, `reject_reason_text`, `accepted_at`, `rejected_at`).

## 6. UI
- Tab **Chờ nhận** của `/my-tasks`: mỗi thẻ (mobile)/dòng (desktop) thêm 2 nút "Tiếp nhận" (variant chính) và "Từ chối" (variant phụ/cảnh báo), vùng chạm ≥44px, đặt dưới cùng thẻ hoặc cột thao tác cuối bảng desktop.
- Sheet "Từ chối đầu việc {mã task}?": `Select` 5 lý do (nhãn: "Không đủ thời gian (đang nhiều việc)", "Ốm đau / nghỉ phép", "Không phù hợp chuyên môn", "Địa điểm quá xa / không di chuyển được", "Lý do khác") + `Textarea` "Lý do chi tiết" bắt buộc ≥5 ký tự, mẫu `CancelTaskSheet.tsx`.
- Toast: "Đã tiếp nhận đầu việc." / "Đã từ chối đầu việc."; lỗi dùng `Alert` trong sheet (reject) hoặc toast lỗi (accept) + nhánh `STALE_VERSION` riêng (mẫu `CancelTaskSheet.tsx`).
- Icon: nút Tiếp nhận `Check`, nút Từ chối `X` (lucide-react, theo UI_GUIDELINES).

## 7. Kịch bản UAT thủ công
1. Đăng nhập bằng kỹ thuật viên đang có đầu việc ở tab "Chờ nhận".
2. Bấm "Tiếp nhận" ở 1 thẻ → thẻ biến mất khỏi "Chờ nhận", xuất hiện ở "Đang làm", có toast xác nhận.
3. Bấm "Từ chối" ở 1 thẻ khác → chọn lý do "Không phù hợp chuyên môn", nhập chi tiết, xác nhận → thẻ biến mất khỏi "Chờ nhận".
4. Mở lại trang → cả 2 thay đổi vẫn giữ nguyên (dữ liệu đã lưu server).

## 8. Giả định & câu hỏi
- Giả định: `version` trong body của cả 2 lệnh là **version của đơn hàng** (Order = aggregate root, Q62 đã chốt), không phải version riêng của `assignments` (bảng này không có cột `version`) — khớp đúng cách `dispatch/service.py` đã làm với `task.*`/`assignment.remove`.
- Giả định: phân công không tồn tại và phân công tồn tại nhưng không phải của actor trả về **cùng một** 404, không phân biệt — giữ nguyên tắc chống IDOR đã áp dụng ở M5-01 (AC-ASG-003).
- Giả định: `notify_tech_leads` (effect của `reject`) bỏ qua ở item này, chỉ ghi `audit_events` — giống cách M4-01/M4-02 đã xử lý `notify_assignees` (Q60), vì module Thông báo chưa xây (M7-01).
- Không có câu hỏi mới cần chủ dự án quyết — toàn bộ quy tắc đã có sẵn trong `spec/state_machines.yaml`/`permissions.yaml`.
