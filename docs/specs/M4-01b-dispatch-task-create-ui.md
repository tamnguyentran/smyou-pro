# M4-01b — Hàng đợi điều phối + tạo task + giao nhiều KTV: Giao diện

- **Status:** Approved
- **Backlog:** M4-01b (tách từ M4-01 — Q59; đề xuất tách tiếp phần tab "Đầu việc" sang M4-01c — Q64) · **Milestone:** M4
- **Liên quan:** `M4-01a-dispatch-task-create-api.md` (API dùng ở item này: `GET /orders?status=PENDING_DISPATCH&sort=dispatch`, `POST /orders/{id}/tasks`, `GET /orders/{id}`, badge `pending_dispatch_count` trong `GET /me`); `spec/permissions.yaml` menu `dispatch-queue` (`Đơn chờ điều phối`, path `/dispatch/queue`, capability cha `task.manage`, badge `pending_dispatch_count`); `docs/design/UI_GUIDELINES.md` §5 hàng "Đơn chờ điều phối" ("sắp theo ưu tiên + ngày hẹn; mở đơn → panel tạo task (gợi ý giờ từ dịch vụ trong đơn)") + §4 (bottom sheet mobile / modal desktop) + §6 (`Sheet`, toast, empty state, nút ≥44px); `M3-03b-order-list-detail-ui.md` (mẫu bảng-desktop/thẻ-mobile `OrderList`, banner `STALE_VERSION` + nút "Tải lại"); `M2-02-services.md` (`default_estimated_hours` — gợi ý số giờ, `GET /services/{id}` dùng capability `catalog.read` mà TECH_LEAD có `all`); `M1-04a-employees-api.md` (`GET /employees?role=TECHNICIAN&is_active=true` — `employee.read` TECH_LEAD `all`); `frontend/src/features/orders/schemas.ts` (`PRIORITY_LABELS`)

## 1. Mục tiêu
Là Quản lý kỹ thuật, tôi muốn mở một trang duy nhất thấy các đơn đang chờ điều phối (đơn gấp và hẹn sớm ở trên), bấm vào một đơn là tạo được ngay đầu việc và giao cho một hoặc nhiều kỹ thuật viên, không phải đi qua nhiều màn hình.

## 2. Phạm vi
Item này là phần **giao diện** của M4-01 (API đã xong ở M4-01a). Ước lượng gộp cả tab "Đầu việc" trên trang chi tiết đơn vượt ~400 dòng non-test (trang hàng đợi + panel tạo task + tab + hook API ≈ 590 dòng), nên đề xuất tách tiếp — xem **Q64** ở §8.

- **Trong phạm vi:**
  - Trang `/dispatch/queue` (thay trang giữ chỗ "đang phát triển"): danh sách đơn `PENDING_DISPATCH` lấy từ `GET /orders?status=PENDING_DISPATCH&sort=dispatch`, phân trang 20 dòng; bảng (desktop) / thẻ (mobile); trạng thái tải (skeleton), trống, lỗi (nút "Thử lại").
  - Route `/dispatch/queue` kiểm capability `task.manage` (như mục menu) → 403 chuẩn của app nếu không có.
  - Panel "Tạo đầu việc" (`Sheet`: bottom sheet mobile / modal desktop) mở khi bấm một đơn trong hàng đợi: tóm tắt đơn (khách, SĐT bấm gọi, địa chỉ thi công có link bản đồ, mô tả công việc, ưu tiên, ngày hẹn) từ `GET /orders/{id}` + form tạo task.
  - Form: `title` (bắt buộc, ≤200), `description` (tuỳ chọn), `estimated_hours` (bắt buộc, điền sẵn gợi ý từ `default_estimated_hours` × số lượng của các dòng dịch vụ trong đơn, sửa được), `due_at` (bắt buộc, ngày + giờ), `priority` (mặc định = ưu tiên của đơn — Q63), chọn nhiều kỹ thuật viên (`GET /employees?role=TECHNICIAN&is_active=true`).
  - Kiểm ở client (zod) trước khi gọi API cho đúng 5 guard của M4-01a; hiển thị `detail` tiếng Việt của problem+json khi server vẫn trả 409 `GUARD_FAILED`; banner + nút "Tải lại" cho `STALE_VERSION`.
  - Sau khi tạo thành công: toast, đóng panel, làm mới hàng đợi (đơn rời danh sách vì đã `IN_PROGRESS`) và làm mới badge `pending_dispatch_count`.
- **Ngoài phạm vi:**
  - Tab "Đầu việc" trên trang chi tiết đơn (xem task đã tạo, tạo task thứ 2 cho đơn đã `IN_PROGRESS`/`REVISION`) → **M4-01c** (Q64).
  - Chọn `order_line_ids` (task gắn với dòng hàng nào) — API nhận tuỳ chọn, UI để M4-02 cùng với màn sửa task.
  - Sửa/huỷ task, thêm/gỡ người giao, `NEEDS_ASSIGNEE` (M4-02); Kanban/bảng đầu việc, lọc theo KTV/hạn/ưu tiên (M4-03); gợi ý người theo tải việc (M4-04).
  - Lọc/tìm kiếm trên trang hàng đợi (M4-03 có bộ lọc đầy đủ); thông báo cho KTV khi được giao (M7-01, Q60).

## 3. Acceptance Criteria
> Fixture như M4-01a: Tuấn (TECH_LEAD, có `task.manage`/`order.read`/`employee.read`/`catalog.read`), Hoa (SALE, chủ đơn), An (MANAGER, **không** có `task.manage` — Q05), Khoa + Minh (TECHNICIAN đang hoạt động), Lan (TECHNICIAN `is_active=false`). 4 đơn `PENDING_DISPATCH`: "Đơn H" (`NORMAL`, hẹn 10/10/2026), "Đơn I" (`URGENT`, hẹn 12/10/2026), "Đơn K" (`HIGH`, hẹn 08/10/2026), "Đơn L" (`LOW`, không có ngày hẹn).

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-DSP-015 | Tuấn đã đăng nhập, 4 đơn fixture, desktop 1440px | mở `/dispatch/queue` | tiêu đề trang "Đơn chờ điều phối"; gọi đúng `GET /orders?status=PENDING_DISPATCH&sort=dispatch&limit=20&offset=0`; bảng cột **Mã · Khách · Ưu tiên · Ngày hẹn · Tổng tiền · Người tạo**; thứ tự hàng theo thứ tự API trả (Đơn I → Đơn K → Đơn H → Đơn L), FE **không** tự sắp lại; `requested_date` trống hiện "—"; tổng tiền `11.800.000 ₫`; >20 đơn → `Pagination` đổi `offset` | component + e2e |
| AC-DSP-016 | Như AC-DSP-015, mobile 390px | mở `/dispatch/queue` | thẻ xếp dọc (không bảng): mã đơn + badge ưu tiên nổi bật ở hàng trên, khách + ngày hẹn + tổng tiền bên dưới; nhãn ưu tiên dùng `PRIORITY_LABELS` ("Khẩn"/"Cao"/"Bình thường"/"Thấp"), `URGENT` tone `urgent`, `HIGH` tone `review`, `NORMAL`/`LOW` tone `todo`; vùng chạm mỗi thẻ ≥44px; không cuộn ngang ở 360px | component + e2e |
| AC-DSP-017 | Tuấn, không có đơn nào `PENDING_DISPATCH` | mở `/dispatch/queue` | `EmptyState` icon `Inbox` + "Không có đơn nào chờ điều phối." + dòng phụ "Đơn mới do Kinh doanh gửi sẽ xuất hiện ở đây."; trong lúc đang tải hiện skeleton (`aria-busy`), không spinner toàn trang; `GET /orders` lỗi 500 → thông báo "Không tải được hàng đợi điều phối." + nút "Thử lại" gọi lại đúng 1 lần | component |
| AC-DSP-018 | Hoa (SALE) và An (MANAGER) — cả hai không có `task.manage` | mở `/dispatch/queue` bằng URL trực tiếp | cả hai: trang 403 chuẩn của app ("Bạn không có quyền…"), **không** gọi `GET /orders`; Tuấn mở cùng URL → thấy hàng đợi; menu "Điều phối kỹ thuật" vẫn chỉ hiện với Tuấn (hành vi M1-03a, không đổi) | component |
| AC-DSP-019 | Tuấn ở `/dispatch/queue`; "Đơn I" (`URGENT`): khách "Công ty TNHH Minh Phát", SĐT `0932068787`, địa chỉ thi công "12 Lê Lợi, Q1, TP.HCM", mô tả "Lắp 4 camera tầng 1" | bấm hàng/thẻ "Đơn I" | `Sheet` "Tạo đầu việc — {Đơn I.code}" mở; gọi `GET /orders/{Đơn I.id}`; hiện tóm tắt: tên khách, SĐT dạng `0932 06 8787` link `tel:`, địa chỉ thi công có link bản đồ, mô tả công việc, ngày hẹn `12/10/2026`; form có 6 ô: Tiêu đề đầu việc · Mô tả · Số giờ ước tính · Hạn hoàn thành · Mức ưu tiên · Giao cho kỹ thuật viên; "Mức ưu tiên" chọn sẵn "Khẩn" (= ưu tiên của đơn, Q63); focus tự vào ô "Tiêu đề đầu việc" | component + e2e |
| AC-DSP-020 | "Đơn I" có 3 dòng: dịch vụ `DV-LAPCAM` (`default_estimated_hours=2`, số lượng 4), dịch vụ `DV-BOMMUC` (`default_estimated_hours=0.5`, số lượng 2), sản phẩm `LCD-DELL22` (số lượng 1) | mở panel tạo task của Đơn I | ô "Số giờ ước tính" điền sẵn `9` (2×4 + 0,5×2; dòng sản phẩm không tính) kèm dòng phụ "Gợi ý 9 giờ từ dịch vụ trong đơn."; sửa thành `6` rồi submit → body gửi `estimated_hours: 6`; đơn chỉ có dòng sản phẩm, hoặc mọi dịch vụ có `default_estimated_hours=null` → ô để trống, không có dòng gợi ý; `GET /services/{id}` lỗi → ô để trống, không chặn form (gợi ý là tiện ích, không bắt buộc) | component |
| AC-DSP-021 | Panel tạo task đang mở | mở phần "Giao cho kỹ thuật viên" | gọi `GET /employees?role=TECHNICIAN&is_active=true&limit=100`; danh sách checkbox tên + mã nhân viên; Lan (đã khoá) **không** xuất hiện; chọn Khoa + Minh → dòng tóm tắt "Đã chọn 2 kỹ thuật viên", bỏ chọn Minh → "Đã chọn 1 kỹ thuật viên"; mỗi checkbox có `<label>`, vùng chạm ≥44px | component |
| AC-DSP-022 | Tuấn ở panel của "Đơn I" (`version=N`), điền `title="Lắp đặt 4 camera tầng 1"`, `estimated_hours=9`, `due_at=05/10/2026 09:00`, ưu tiên "Khẩn", chọn Khoa + Minh | bấm "Tạo đầu việc" | gọi `POST /orders/{Đơn I.id}/tasks` với `{version:N, title, estimated_hours:9, due_at:"2026-10-05T09:00:00+07:00", priority:"URGENT", assignee_ids:[Khoa.id, Minh.id]}`; trong lúc gửi nút disable + spinner (bấm lần 2 không gọi API lần 2); 200 → panel đóng, toast "Đã tạo đầu việc {task.code} và giao cho 2 kỹ thuật viên."; hàng đợi refetch → "Đơn I" không còn trong danh sách (đã `IN_PROGRESS`); `GET /me` refetch → badge "Đơn chờ điều phối" giảm từ 4 xuống 3 | component + e2e |
| AC-DSP-023 | Panel tạo task đang mở, các ô còn trống | bấm "Tạo đầu việc" | **không** gọi `POST`; lỗi hiện dưới từng ô: tiêu đề trống → "Nhập tiêu đề đầu việc."; số giờ trống → "Nhập số giờ ước tính."; hạn trống → "Chọn hạn hoàn thành."; chưa chọn ai → "Chọn ít nhất 1 kỹ thuật viên."; nhập `title` 201 ký tự → "Tiêu đề tối đa 200 ký tự."; `estimated_hours=0` / `201` / `1,3` → "Số giờ phải từ 0,25 đến 200 và là bội số của 0,25."; `due_at` là hôm qua → "Hạn hoàn thành không được ở quá khứ." | component |
| AC-DSP-024 | Tuấn điền form hợp lệ nhưng Hoa vừa thu hồi "Đơn I" về `DRAFT` ở tab khác | bấm "Tạo đầu việc" | 409 `GUARD_FAILED` guard=`order_in_dispatchable_state` → `Alert` đỏ trong panel hiện `detail` của problem+json ("Đơn không ở trạng thái có thể điều phối đầu việc.") + hàng đợi refetch (Đơn I rời danh sách); tương tự với guard `assignees_are_active_technicians` (một KTV vừa bị khoá) → hiện "Người được giao phải là kỹ thuật viên đang hoạt động.", panel **vẫn mở**, dữ liệu đã nhập không mất; lỗi không có `detail` → "Không tạo được đầu việc. Vui lòng thử lại." | component |
| AC-DSP-025 | Tuấn mở panel "Đơn K" (`version=P`); Hoa vừa sửa liên hệ đơn này (`version` → `P+1`) | bấm "Tạo đầu việc" | 409 `STALE_VERSION` → banner đỏ "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" (gọi lại `GET /orders/{id}`); sau khi tải lại, dữ liệu đã nhập trong form **được giữ**, bấm "Tạo đầu việc" lần nữa → gửi `version=P+1` → 200 | component |
| AC-DSP-026 | Tuấn, panel tạo task mở ở iPhone 13 (390px) và 1440px | so sánh layout | mobile: bottom sheet gần full chiều cao, nội dung cuộn trong sheet, nút "Tạo đầu việc" dính đáy (`sticky bottom-0`), chừa `env(safe-area-inset-bottom)`; desktop: modal giữa màn hình (≤ `w-[560px]`), nút "Tạo đầu việc" + "Đóng" ở cuối panel; cả hai: `Esc`/chạm overlay đóng panel, focus trap trong panel, trả focus về hàng/thẻ vừa bấm; ảnh chụp 390px + 1440px lưu `reports/screenshots/` | component + e2e |
| AC-DSP-027 | Tuấn ở `/dispatch/queue` (có đơn) và panel tạo task đang mở | chạy axe-core | không vi phạm `serious`/`critical` ở cả hai trạng thái; mọi input có `<label>`; nút chỉ có icon có `aria-label` tiếng Việt; không cuộn ngang ở 360px | e2e (`@a11y`) |

## 4. API
Không có route mới — dùng lại M4-01a và các API đã có:

| Method | Path | Capability | Dùng để |
|---|---|---|---|
| GET | /api/v1/orders?status=PENDING_DISPATCH&sort=dispatch&limit&offset | order.read | danh sách hàng đợi (AC-DSP-015) |
| GET | /api/v1/orders/{id} | order.read | tóm tắt đơn + dòng hàng + `version` cho panel (AC-DSP-019) |
| POST | /api/v1/orders/{id}/tasks | task.manage | tạo task + giao nhiều KTV (AC-DSP-022) |
| GET | /api/v1/employees?role=TECHNICIAN&is_active=true&limit=100 | employee.read | danh sách KTV để chọn (AC-DSP-021) |
| GET | /api/v1/services/{id} | catalog.read | `default_estimated_hours` để gợi ý số giờ (AC-DSP-020) |
| GET | /api/v1/me | — | badge `pending_dispatch_count` sau khi tạo task (AC-DSP-022) |

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Route mới `/dispatch/queue` → `DispatchQueuePage` (thêm vào `REAL_PAGES` trong `frontend/src/app/routes.tsx`, bỏ trang giữ chỗ `MenuPage`); capability kiểm tại trang là `task.manage`, giống mục menu.
- Cấu trúc đề xuất: `features/dispatch/{api.ts, pages/DispatchQueuePage.tsx, components/DispatchQueueList.tsx, components/TaskCreateSheet.tsx, components/AssigneePicker.tsx}` — tái dùng `Sheet`, `Badge`, `Button`, `TextField`, `Textarea`, `Select`, `Alert`, `EmptyState`, `Pagination`, `Toast` đã có; không viết component UI cơ bản mới.
- Icon: trang hàng đợi `Inbox` (như menu), số giờ `Timer`, hạn chót `CalendarClock`, địa chỉ `MapPin`, gọi `Phone` (UI_GUIDELINES §7).
- Copy tiếng Việt chính xác: tiêu đề trang "Đơn chờ điều phối"; panel "Tạo đầu việc — {code}"; nhãn ô "Tiêu đề đầu việc", "Mô tả", "Số giờ ước tính", "Hạn hoàn thành", "Mức ưu tiên", "Giao cho kỹ thuật viên"; placeholder tiêu đề "Vd: Lắp đặt 4 camera tầng 1"; nút "Tạo đầu việc" / "Đóng"; toast "Đã tạo đầu việc {code} và giao cho {n} kỹ thuật viên."; các câu lỗi như AC-DSP-023/024/025.
- Định dạng: tiền `Intl.NumberFormat('vi-VN')` + " ₫"; ngày hẹn `dd/MM/yyyy`; hạn hoàn thành nhập bằng `datetime-local`, gửi lên theo múi `+07:00`; số giờ hiển thị dấu phẩy thập phân kiểu Việt ("0,25") nhưng gửi JSON dạng số.

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập Sale, gửi 2 đơn (một đơn ưu tiên "Khẩn", một đơn "Bình thường").
2. Đăng nhập Quản lý kỹ thuật → menu "Điều phối kỹ thuật" → "Đơn chờ điều phối": thấy đơn "Khẩn" ở trên, badge trên menu đếm đúng 2.
3. Bấm đơn "Khẩn" → panel mở, kiểm tra số giờ gợi ý, chọn 2 kỹ thuật viên, đặt hạn ngày mai → "Tạo đầu việc".
4. Thấy toast, đơn rời khỏi hàng đợi, badge giảm còn 1; mở `/orders/{mã đơn}` thấy trạng thái "Đang thực hiện".
5. Thử trên điện thoại (390px): bấm thẻ đơn còn lại, bỏ trống tiêu đề → thấy lỗi tiếng Việt dưới ô; điền đủ → tạo được.

## 8. Giả định & câu hỏi
- Giả định: gợi ý số giờ tính ở client = Σ(`default_estimated_hours` × `quantity`) của các dòng `item_type="SERVICE"` trong đơn, lấy `default_estimated_hours` bằng `GET /services/{service_id}` cho từng dịch vụ khác nhau trong đơn (TECH_LEAD có `catalog.read` all). Không thêm trường vào API đơn ở item này; nếu sau này thấy chậm thì M4-03 có thể bổ sung `suggested_hours` vào `GET /orders/{id}` (không phải quyết định nghiệp vụ).
- Giả định: hàng đợi chỉ hiện đơn `PENDING_DISPATCH` (đúng mô tả UI_GUIDELINES §5). Đơn đã `IN_PROGRESS` cần thêm task sẽ vào qua trang chi tiết đơn (M4-01c) hoặc bảng đầu việc (M4-03) — trong khoảng giữa M4-01b và M4-01c, tạo task thứ 2 chỉ làm được qua API.
- Giả định: không chặn trước ở client các guard mà client không biết chắc (`order_in_dispatchable_state`) — chỉ dựa vào 409 của server, đúng tinh thần "FE không tự suy luận trạng thái cuối cùng" (CLAUDE.md quy tắc 4).
- **Câu hỏi mới — Q64 (đề xuất: tách tiếp M4-01c cho tab "Đầu việc")**: backlog M4-01b gồm 3 phần (trang hàng đợi, panel tạo task, tab "Đầu việc" trên trang chi tiết đơn). Ước lượng non-test ≈ 590 dòng (hàng đợi ~190, panel + chọn KTV ~260, tab + trạng thái task ~120, hook/wiring ~20) → vượt ngưỡng ~400 dòng của CLAUDE.md quy tắc 12. *Đề xuất:* M4-01b làm hàng đợi + panel tạo task (spec này, ~430 dòng); tạo item mới **M4-01c "Tab Đầu việc trên trang chi tiết đơn"** (danh sách task từ `GET /orders/{id}/tasks`, badge trạng thái task theo `spec/state_machines.yaml#task.states`, nút "Tạo đầu việc" dùng lại `TaskCreateSheet` cho đơn `IN_PROGRESS`/`REVISION`) ngay sau M4-01b, trước M4-02.
