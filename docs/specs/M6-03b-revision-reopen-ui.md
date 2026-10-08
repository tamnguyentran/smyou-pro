# M6-03b — Chuyển Chỉnh sửa + Mở lại task (UI)

- **Status:** Draft
- **Backlog:** M6-03 (phần `b` — giao diện của `M6-03a`) · **Milestone:** M6
- **Liên quan:** `M6-03a-revision-reopen-api.md` (API `revise`/`reopen`, `can_revise`, badge `revision_count`); `spec/design/UI_GUIDELINES.md` dòng 80 (hành động không đảo ngược); `frontend/src/features/orders/components/CancelOrderSheet.tsx` (khuôn sheet lý do); `frontend/src/features/dispatch/components/OrderTasksTab.tsx`/`TaskEditSheet.tsx` (M4-02b, nơi hiện "Mở lại" khi task `DONE`); `spec/permissions.yaml` (menu `dispatch-revise` path `/dispatch/revisions`, badge `revision_count`); `frontend/src/features/dispatch/taskStatus.ts` (`DISPATCHABLE_STATUSES` đã có `REVISION` — nút "Tạo đầu việc" đã tự hiện khi đơn `REVISION`, không cần sửa ở item này).

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi bấm "Chuyển Chỉnh sửa" trên trang đơn và "Mở lại" trên đầu việc đã xong, nhập lý do (và mức độ lỗi khi mở lại) ngay trên giao diện, đồng thời có 1 trang riêng liệt kê các đơn đang chờ xử lý "Chỉnh sửa".

## 2. Phạm vi
- **Trong phạm vi:**
  - `ReviseOrderSheet.tsx` (mới, sao khuôn `CancelOrderSheet.tsx`): nút "Chuyển Chỉnh sửa" (icon `RotateCcw`, cạnh "Hoàn tất đơn"/"Huỷ" trong `OrderDetailTabs.tsx`) hiện khi `allowed_commands` có `request_revision` **và** `can_revise`; mở sheet "Chuyển đơn {mã} sang Chỉnh sửa?", cảnh báo không đảo ngược, `Textarea` "Lý do" bắt buộc ≥5 ký tự (disable nút xác nhận), xử lý `STALE_VERSION` theo mẫu `CancelOrderSheet`.
  - `TaskEditSheet.tsx` (M4-02b) thêm nhánh hiển thị khi `task.status === "DONE" && order.status === "REVISION" && task.reopen ∈ scope`: thay vùng "chỉ xem" bằng nút "Mở lại" (icon `RotateCcw`, danger) mở `ReopenTaskSheet`.
  - `ReopenTaskSheet.tsx` (mới): tiêu đề "Mở lại đầu việc {code}?", cảnh báo không đảo ngược + câu "Hệ thống sẽ ghi nhận lỗi cho (những) người đã làm.", `Textarea` "Lý do" bắt buộc ≥5 ký tự, `Select` "Mức độ lỗi" (`MINOR`="Nhẹ", `MAJOR`="Nặng", không có mặc định — phải chọn mới bấm được "Xác nhận mở lại"), xử lý `STALE_VERSION` theo mẫu.
  - Trang `/dispatch/revisions` (`RevisionQueuePage.tsx`, thay placeholder hiện tại): danh sách đơn `status=REVISION` (tái dùng `useOrders`/kiểu hiển thị của `DispatchQueueList.tsx`), mỗi dòng/thẻ bấm mở `/orders/{mã}` (mẫu M3-05); cột/thẻ hiện `code`, `customer`, `revision_no`, ngày chuyển Chỉnh sửa gần nhất. Capability trang: `task.manage` (giống `dispatch-queue`).
  - Badge `revision_count` trên menu "Đơn cần chỉnh sửa" (đã có khung ẩn/hiện số 0 từ M1-03a, nay nhận giá trị thật từ `/me`).
  - Toast: "Đã chuyển đơn {mã} sang Chỉnh sửa."; "Đã mở lại đầu việc {code}."
- **Ngoài phạm vi:** đổi người khi mở lại (M6-03a §6 — đã chốt không làm, chờ M6-03c nếu cần); hiển thị `defect_records`/KPI cho KTV (M8); lọc/sắp xếp nâng cao trên `/dispatch/revisions` (chỉ danh sách đơn giản, giống `DispatchQueueList` chưa có bộ lọc).

## 3. Acceptance Criteria
Dữ liệu mẫu (tiếp theo `M6-03a`): **Phạm Quang Tuấn** `NV010` [TECH_LEAD]; **Trần Minh Khoa** `NV014` [TECHNICIAN]; **Vũ Thị Hoa** `NV005` [SALE]. Đơn DH2610-0020: `COMPLETED`, `version=6`, `can_revise=true`, `allowed_commands` có `request_revision`. Sau khi test chuyển Chỉnh sửa: `REVISION`, `revision_no=1`, có task T1 `DONE` (Khoa).

### `ReviseOrderSheet`

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-152 | Tuấn mở trang chi tiết DH2610-0020 (`COMPLETED`, `can_revise=true`, `allowed_commands` có `request_revision`) | — | Nút "Chuyển Chỉnh sửa" hiện cạnh các nút hành động đơn; Hoa (SALE, `can_revise=false`) mở cùng trang → nút không hiện | component |
| AC-ORD-153 | Tuấn bấm "Chuyển Chỉnh sửa" | — | Mở `ReviseOrderSheet` tiêu đề "Chuyển đơn DH2610-0020 sang Chỉnh sửa?"; nút "Xác nhận" disabled khi `Textarea` trống/< 5 ký tự trim | component |
| AC-ORD-154 | Sheet đang mở, nhập "Camera tầng 2 lắp sai vị trí, khách yêu cầu chỉnh" | bấm "Xác nhận" | gọi `POST .../revise` đúng `version`+`reason`; thành công → đóng sheet, toast "Đã chuyển đơn DH2610-0020 sang Chỉnh sửa.", huy hiệu trạng thái đổi "Chỉnh sửa", nút "Chuyển Chỉnh sửa" biến mất (không còn trong `allowed_commands`), nút "Tạo đầu việc" ở tab "Đầu việc" xuất hiện (đơn `REVISION` ∈ `DISPATCHABLE_STATUSES` có sẵn) | component |
| AC-ORD-155 | API trả `STALE_VERSION` | bấm "Xác nhận" | hiện "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" | component |
| AC-ORD-156 | DH2610-0020 `REVISION`, đủ điều kiện mở trang | e2e mobile 390px: chuyển Chỉnh sửa trọn luồng | không cuộn ngang; axe 0 vi phạm serious/critical; huy hiệu đổi "Chỉnh sửa" | e2e |
| AC-ORD-157 | như trên | e2e desktop 1440px | nút đúng vị trí vùng thao tác; axe 0 vi phạm serious/critical | e2e |

### `ReopenTaskSheet` + `TaskEditSheet` (task DONE, đơn REVISION)

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DSP-120 | Tuấn mở `TaskEditSheet` của T1 (`DONE`, đơn `REVISION`) | — | Thay vùng sửa thông tin (ẩn theo M4-02b vì task `DONE`) bằng nút "Mở lại" (danger); An/Hoa (không có `task.reopen`) mở cùng sheet → không có nút "Mở lại", chỉ xem | component |
| AC-DSP-121 | T1 `DONE`, đơn `AWAITING_CONFIRMATION`/`COMPLETED` (chưa chuyển Chỉnh sửa) | Tuấn mở `TaskEditSheet` của T1 | Không có nút "Mở lại" (chỉ xem) — vì `order.status !== "REVISION"` | component |
| AC-DSP-122 | Tuấn bấm "Mở lại" ở AC-DSP-120 | — | Mở `ReopenTaskSheet` tiêu đề "Mở lại đầu việc {T1.code}?"; nút "Xác nhận mở lại" disabled khi lý do trống/<5 ký tự **hoặc** chưa chọn "Mức độ lỗi" | component |
| AC-DSP-123 | Sheet đang mở, nhập lý do hợp lệ + chọn "Nặng" | bấm "Xác nhận mở lại" | gọi `POST .../reopen` đúng `version`+`reason`+`severity:"MAJOR"`; thành công → đóng sheet, toast "Đã mở lại đầu việc {T1.code}.", tab "Đầu việc" hiện T1 huy hiệu "Chờ tiếp nhận" | component |
| AC-DSP-124 | API trả `STALE_VERSION` ở `ReopenTaskSheet` | bấm "Xác nhận mở lại" | hiện "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" | component |
| AC-DSP-125 | T1 vừa mở lại (AC-DSP-123), đơn `REVISION` | e2e mobile 390px: mở `TaskEditSheet` T1, bấm "Mở lại", nhập lý do + mức độ, xác nhận | không cuộn ngang; axe 0 vi phạm serious/critical; T1 đổi "Chờ tiếp nhận" | e2e |
| AC-DSP-126 | như trên | e2e desktop 1440px | axe 0 vi phạm serious/critical | e2e |

### `/dispatch/revisions` + badge

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DSP-127 | 2 đơn `REVISION` (DH2610-0020, DH2610-0023), 1 đơn `IN_PROGRESS` khác | Tuấn mở `/dispatch/revisions` | 200; danh sách 2 dòng/thẻ (chỉ đơn `REVISION`), mỗi dòng hiện `code`, tên khách, "Lần chỉnh sửa {revision_no}"; bấm 1 dòng → điều hướng `/orders/{mã}` | component |
| AC-DSP-128 | Không có đơn `REVISION` nào | Tuấn mở `/dispatch/revisions` | `EmptyState` "Không có đơn cần chỉnh sửa." | component |
| AC-DSP-129 | 2 đơn `REVISION` | Tuấn `GET /me` | `counters.revision_count == 2`; menu "Đơn cần chỉnh sửa" hiện badge "2"; Hoa (không `task.manage`) không thấy mục menu này | component |
| AC-DSP-130 | Trang `/dispatch/revisions`, danh sách có dữ liệu | e2e mobile 390px + desktop 1440px | không cuộn ngang (mobile); axe 0 vi phạm serious/critical (cả 2 kích thước) | e2e |

## 4. API
Không có route mới — dùng nguyên `M6-03a-revision-reopen-api.md` (`POST .../revise`, `POST .../tasks/{id}/reopen`, `counters.revision_count` qua `GET /me`, `GET /orders?status=REVISION` đã có sẵn từ M3).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `features/orders/components/ReviseOrderSheet.tsx`: sao khuôn `CancelOrderSheet.tsx`, đổi tiêu đề/copy, icon `RotateCcw`.
- `features/orders/api.ts` thêm `useReviseOrder` (mẫu `useCompleteOrder`): `invalidateQueries` cho `[ORDER_KEY, orderId]`, `[ME_KEY]` (badge `revision_count`).
- `OrderDetailTabs.tsx`: thêm nút "Chuyển Chỉnh sửa" cạnh "Hoàn tất đơn"/"Huỷ" (điều kiện `allowed_commands.includes("request_revision") && order.can_revise`).
- `features/dispatch/components/ReopenTaskSheet.tsx` (mới): `Textarea` "Lý do" + `Select` "Mức độ lỗi" (options "Nhẹ"/"Nặng", không có giá trị mặc định ban đầu).
- `features/dispatch/components/TaskEditSheet.tsx`: thêm nhánh `task.status === "DONE" && order.status === "REVISION"` → hiện nút "Mở lại" thay vùng chỉ-xem hiện có (M4-02b đã ẩn điều khiển sửa khi `DONE`).
- `features/dispatch/api.ts` thêm `useReopenTask`: `invalidateQueries` cho `[ORDER_TASKS_KEY, orderId]`, `[ORDER_KEY, orderId]`, `["task", taskId]`, `[ME_KEY]`.
- `features/dispatch/pages/RevisionQueuePage.tsx` (mới, thay placeholder route `/dispatch/revisions`): tái dùng `DispatchQueueList.tsx` làm mẫu bố cục danh sách/thẻ, gọi `useOrders({status: "REVISION"})`.
- Icon mới (UI_GUIDELINES §7): `RotateCcw` (đã dùng làm icon menu `dispatch-revise`, dùng lại cho 2 nút hành động).
- Copy tiếng Việt: "Chuyển Chỉnh sửa"; "Chuyển đơn {mã} sang Chỉnh sửa?"; "Đã chuyển đơn {mã} sang Chỉnh sửa."; "Mở lại"; "Mở lại đầu việc {code}?"; "Hệ thống sẽ ghi nhận lỗi cho (những) người đã làm."; "Mức độ lỗi"; "Nhẹ"; "Nặng"; "Đã mở lại đầu việc {code}."; "Không có đơn cần chỉnh sửa."; "Lần chỉnh sửa {n}".
- Mobile/desktop: không khác biệt bố cục ngoài vị trí nút/danh sách theo khu vực đã có.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Tuấn (TECH_LEAD), mở đơn đang "Hoàn tất" hoặc "Chờ khách xác nhận" → bấm "Chuyển Chỉnh sửa" → nhập lý do → xác nhận → đơn đổi "Chỉnh sửa".
2. Mở tab "Đầu việc", bấm vào 1 task đã "Hoàn thành" → bấm "Mở lại" → nhập lý do + chọn mức độ lỗi → xác nhận → task đổi "Chờ tiếp nhận".
3. Mở `/dispatch/revisions` từ menu "Đơn cần chỉnh sửa" → thấy đơn vừa chuyển, badge số đếm đúng.
4. (Tuỳ chọn) Cho KTV chấp nhận/bắt đầu/hoàn thành lại task vừa mở lại → xác nhận đơn tự chuyển lại "Chờ khách xác nhận".

## 8. Giả định & câu hỏi
- Không có câu hỏi mới ở item này — thừa hưởng Q75 (`severity`) và giả định "không đổi người khi mở lại" từ `M6-03a` §6.
