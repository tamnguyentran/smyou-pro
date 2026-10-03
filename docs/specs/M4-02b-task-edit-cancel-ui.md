# M4-02b — Sửa task, thêm/gỡ người, huỷ task: giao diện

- **Status:** Approved
- **Backlog:** M4-02 (phần giao diện, sau `M4-02a-task-edit-cancel-api.md`) · **Milestone:** M4
- **Liên quan:** `spec/permissions.yaml` (`task.manage`: TECH_LEAD all); `docs/design/UI_GUIDELINES.md` §6 (Sheet)/§7 (icon); `frontend/src/features/dispatch/components/OrderTasksTab.tsx`, `TaskCreateSheet.tsx`, `AssigneePicker.tsx`, `taskStatus.ts` (tái dùng); `frontend/src/components/ui/ConfirmDialog.tsx`, `Sheet.tsx` (header/footer cố định, M4-01d); `frontend/src/features/orders/components/CancelOrderSheet.tsx` (mẫu sheet có lý do); `M4-02a-task-edit-cancel-api.md`

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi muốn bấm vào một đầu việc trong tab "Đầu việc" để sửa thông tin, thêm/gỡ kỹ thuật viên, hoặc huỷ đầu việc — ngay trên trang chi tiết đơn, không cần gọi API tay.

## 2. Phạm vi
- **Trong phạm vi:**
  - `OrderTasksTab`: mỗi dòng/thẻ task bấm được (giống M3-05) → mở `TaskEditSheet`.
  - `TaskEditSheet` (mới): tải chi tiết task (`GET .../tasks/{id}`), form sửa title/description/estimated_hours/due_at/priority + nút "Lưu"; danh sách người được giao kèm trạng thái + nút "Gỡ" (xác nhận qua `ConfirmDialog`); nút "+ Thêm người" mở danh sách kỹ thuật viên đang hoạt động **chưa** có trong task để thêm (gọi `add_assignee` ngay khi chọn, không qua form "Lưu"); nút "Huỷ đầu việc" mở `CancelTaskSheet`.
  - `CancelTaskSheet` (mới, dùng lại khuôn `CancelOrderSheet`): lý do bắt buộc ≥5 ký tự, "Không thể hoàn tác".
  - Ẩn toàn bộ điều khiển sửa (Lưu/Thêm người/Gỡ/Huỷ đầu việc) khi: không có `task.manage`; đơn không ở trạng thái điều phối được (`PENDING_DISPATCH`/`IN_PROGRESS`/`REVISION`, giống `DISPATCHABLE_STATUSES` đã có); hoặc task đã `CANCELLED`/`DONE` (chỉ xem, không sửa).
- **Ngoài phạm vi:** mở lại task (M6-03); Kanban/bảng đầu việc (M4-03); phản hồi của KTV (M5).

## 3. Acceptance Criteria
> Fixture: Tuấn (TECH_LEAD). "Đơn D" `IN_PROGRESS`, task T1 (`PENDING_ACCEPTANCE`) giao Khoa+Minh. "Đơn E" `AWAITING_CONFIRMATION`, task T2 `DONE`. Dùng lại `useOrderTasks`/`useActiveTechnicians` đã có.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DSP-058 | Tuấn mở tab "Đầu việc" của Đơn D, thấy dòng/thẻ T1 | Bấm vào dòng T1 (desktop: cả hàng trừ các nút lồng trong đó; mobile: cả thẻ) | Mở `TaskEditSheet` title `"Sửa đầu việc — {T1.code}"`; form điền sẵn đúng dữ liệu T1 (`GET .../tasks/{T1.id}`); danh sách "Người được giao" hiện Khoa + Minh kèm badge trạng thái `PENDING` | component |
| AC-DSP-059 | `TaskEditSheet` của T1 đang mở | Sửa `title`, bấm "Lưu" | Gọi `PATCH` đúng `version` hiện có; thành công → toast "Đã lưu thay đổi đầu việc."; sheet **không** tự đóng (vẫn có thể tiếp tục thêm/gỡ người); danh sách task ở tab cập nhật `title` mới | component |
| ~~AC-DSP-060~~ | — bỏ: Q67 không được duyệt (xem `M4-02a-task-edit-cancel-api.md` §8) — server `update` không có guard `estimated_hours_positive`, nên đặt "Số giờ ước tính" = 0 vẫn `200 OK`, không có lỗi để kiểm | — | — | — |
| AC-DSP-061 | `TaskEditSheet` của T1, dữ liệu đã lạc hậu (người khác vừa sửa) | Bấm "Lưu" → server 409 `STALE_VERSION` | Hiện `Alert` "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" (mẫu `TaskCreateSheet`); bấm "Tải lại" → gọi lại `GET .../tasks/{id}`, điền lại form bằng dữ liệu mới | component |
| AC-DSP-062 | `TaskEditSheet` của T1 (Khoa + Minh), Dũng là KTV đang hoạt động chưa có trong task | Bấm "+ Thêm người" → chọn Dũng | Gọi `add_assignee`; thành công → toast "Đã thêm Dũng vào đầu việc."; danh sách "Người được giao" có thêm Dũng (`PENDING`), picker đóng lại | component |
| AC-DSP-063 | `TaskEditSheet` của T1 (Khoa + Minh) | Bấm "+ Thêm người" | Danh sách hiện ra **không** có Khoa/Minh (đã là người được giao đang hoạt động), chỉ hiện KTV đang hoạt động còn lại (ví dụ Dũng); KTV đã khoá không hiện (giống `AssigneePicker` của `TaskCreateSheet`) | component |
| AC-DSP-064 | `TaskEditSheet` của T1, Minh đang được giao | Bấm "Gỡ" cạnh Minh → `ConfirmDialog` "Gỡ Minh khỏi đầu việc? Không thể hoàn tác." → bấm "Gỡ" | Gọi `assignees/{assignment_id}/remove`; thành công → Minh biến mất khỏi danh sách, toast "Đã gỡ Minh khỏi đầu việc."; nếu Minh là người cuối cùng còn active → badge trạng thái task trên tab đổi thành "Cần giao lại" (`taskStatus.ts`) | component |
| AC-DSP-065 | Đơn E có task T2 đã `DONE`; Đơn D có task đã `CANCELLED` | Tuấn bấm vào T2 (hoặc task đã huỷ) | Mở `TaskEditSheet` ở **chế độ chỉ xem**: không có nút "Lưu"/"+ Thêm người"/"Gỡ"/"Huỷ đầu việc"; các ô form `disabled`; vẫn thấy đủ thông tin + badge trạng thái | component |
| AC-DSP-066 | Đơn E `AWAITING_CONFIRMATION` (ngoài `DISPATCHABLE_STATUSES`), có task chưa `DONE`/`CANCELLED` | Tuấn mở tab "Đầu việc" của Đơn E, bấm vào task đó | Mở `TaskEditSheet` chỉ xem (như AC-065) dù task chưa `DONE`/`CANCELLED` — vì đơn không còn điều phối được; không có nút sửa nào (nhất quán với guard `order_in_dispatchable_state` ở server, một nguồn quy tắc duy nhất giống Q65) | component |
| AC-DSP-067 | `TaskEditSheet` của T1 đang mở | Bấm "Huỷ đầu việc" → mở `CancelTaskSheet` "Huỷ đầu việc {T1.code}?"; gõ lý do 3 ký tự → nút "Xác nhận huỷ" vô hiệu; gõ lý do ≥5 ký tự → bấm "Xác nhận huỷ" | Gọi `cancel`; thành công → toast "Đã huỷ đầu việc {T1.code}."; cả `CancelTaskSheet` và `TaskEditSheet` đóng lại; tab "Đầu việc" hiện T1 badge "Đã huỷ", danh sách người được giao rỗng | component |
| AC-DSP-068 | Người dùng không có `task.manage` (ví dụ Hoa — SALE) mở tab "Đầu việc" của Đơn D, bấm vào T1 | — | Mở `TaskEditSheet` chỉ xem (không có nút sửa nào) — đúng tinh thần "mọi vai trò xem được đơn đều xem được task" (Q61) nhưng chỉ `task.manage` mới sửa được | component |
| AC-DSP-069 | Màn `TaskEditSheet` ở 390px (mobile) | — | Form cuộn dọc trong sheet (header/footer cố định — M4-01d); mỗi nút "Gỡ"/"+ Thêm người"/"Huỷ đầu việc" ≥44px chiều cao chạm; không cuộn ngang | component |

## 4. API
Không có route mới ở item này — dùng nguyên các route của `M4-02a-task-edit-cancel-api.md`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `features/dispatch/api.ts` thêm: `useTask(orderId, taskId, enabled)` (GET chi tiết); `useUpdateTask`, `useAddAssignee`, `useRemoveAssignee`, `useCancelTask` — mỗi hook `invalidateQueries` cho `[ORDER_TASKS_KEY, orderId]`, `[ORDER_KEY, orderId]` (vì `order_version` đổi), `[ME_KEY]` (phòng khi badge liên quan), và khoá cache riêng của task (`["task", taskId]`), theo đúng mẫu `useCreateTask`.
- `features/dispatch/components/TaskEditSheet.tsx` (mới): nhận `{ orderId, taskId, onClose }`; 3 khối: (1) form thông tin + "Lưu" dùng lại `TextField`/`Textarea`/`Select` như `TaskCreateSheet`; (2) "Người được giao": `<ul>` mỗi dòng tên + `Badge` trạng thái (tái dùng style `TASK_STATUS_LABEL`/tone cho trạng thái **assignment**, không phải task — cần map riêng `PENDING→"Chờ tiếp nhận"`, v.v., giống `reject_reason_codes` đã có nhãn) + nút "Gỡ" (icon `UserMinus`) mở `ConfirmDialog`; nút "+ Thêm người" (icon `UserPlus`) mở danh sách kỹ thuật viên lọc bỏ người đang active (tái dùng `useActiveTechnicians`, lọc client-side theo `assignees` hiện tại — server vẫn chặn thật bằng `not_already_active_assignee`); (3) nút "Huỷ đầu việc" (danger, icon `Ban`) mở `CancelTaskSheet`.
- `features/dispatch/components/CancelTaskSheet.tsx` (mới): sao chép khuôn `CancelOrderSheet.tsx`, đổi copy "Huỷ đầu việc {code}?" / "Đầu việc sẽ chuyển sang trạng thái Đã huỷ và không thể hoàn tác.".
- `OrderTasksTab.tsx`: thêm `onClick`/`tabIndex`/`role="button"` cho hàng desktop và thẻ mobile (mẫu `M3-05-clickable-list-rows.md`), mở `TaskEditSheet` với `taskId` được bấm; không đổi `COLUMNS`.
- Icon mới (UI_GUIDELINES §7): `UserPlus` (thêm người), `UserMinus` (gỡ người), `Ban` (huỷ đầu việc).
- Copy tiếng Việt: "Sửa đầu việc — {code}"; "Lưu"; "Đã lưu thay đổi đầu việc."; "+ Thêm người"; "Đã thêm {tên} vào đầu việc."; "Gỡ"; "Gỡ {tên} khỏi đầu việc? Không thể hoàn tác."; "Đã gỡ {tên} khỏi đầu việc."; "Huỷ đầu việc"; "Huỷ đầu việc {code}?"; "Đầu việc sẽ chuyển sang trạng thái Đã huỷ và không thể hoàn tác."; "Đã huỷ đầu việc {code}.".

## 7. Kịch bản UAT thủ công
1. `make up`; tiếp nối dữ liệu M4-01c: "Đơn D" `IN_PROGRESS` có task T1 giao Khoa+Minh.
2. Đăng nhập TECH_LEAD, mở `/orders/{mã Đơn D}` → tab "Đầu việc" → bấm vào T1 → sheet mở.
3. Đổi "Số giờ ước tính", bấm "Lưu" → thấy toast, sheet vẫn mở.
4. Bấm "+ Thêm người", chọn 1 KTV khác → thấy người mới trong danh sách. Bấm "Gỡ" cạnh 1 người cũ, xác nhận → người đó biến mất.
5. Bấm "Huỷ đầu việc", nhập lý do, xác nhận → sheet đóng, tab hiện T1 badge "Đã huỷ". Thử lại bước 2 trên điện thoại (390px).

## 8. Giả định & câu hỏi
- Giả định: "Lưu" (sửa thông tin) và thêm/gỡ người là các hành động **độc lập**, không gộp vào một lần submit — giống cách `OrderLinesSection` xử lý từng dòng hàng riêng (M3-04b), không theo khuôn "điền hết form rồi Lưu một lần" của `TaskCreateSheet`. Lý do: thêm/gỡ người cần phản hồi ngay (server có thể 409 `not_already_active_assignee` độc lập với các trường khác).
- Giả định: badge trạng thái cho mỗi **assignment** trong danh sách người được giao (PENDING/ACCEPTED/IN_PROGRESS/DONE/REJECTED/REMOVED) là nhãn **mới**, khác `TASK_STATUS_LABEL` (đó là trạng thái **task**) — cần bảng nhãn riêng trong `taskStatus.ts` hoặc file mới, lấy đúng theo `spec/state_machines.yaml#assignment.states`. Vì assignment đã `REMOVED`/`REJECTED` không hiện trong `assignees` (API chỉ trả active, theo `M4-02a`), danh sách này trong thực tế chỉ cần nhãn cho `PENDING`/`ACCEPTED`/`IN_PROGRESS`/`DONE`.
- Giả định: không có AC riêng cho lỗi tải `GET .../tasks/{id}` (mạng lỗi) — dùng lại mẫu `EmptyState` + nút "Thử lại" đã có ở `OrderTasksTab`/`M4-01e` (đang treo ở backlog, áp dụng chung khi làm item đó).
- Không có câu hỏi mới ở item này — Q67/Q68 đã hỏi và không được duyệt (xem `M4-02a-task-edit-cancel-api.md` §8, đã bỏ AC-DSP-060 vì lý do đó); Q69 vẫn ⏳ nhưng không ảnh hưởng tới giao diện item này.
