# M6-02 — Hoàn tất đơn

- **Status:** Approved
- **Backlog:** M6-02 · **Milestone:** M6
- **Liên quan:** `spec/state_machines.yaml#order` (transition `complete` AWAITING_CONFIRMATION→COMPLETED, capability `order.complete`, guards `confirmation_attachment_in_current_revision`/`signer_name_present`, effects `notify_order_owner`/`audit`); `spec/permissions.yaml` (`order.complete: { TECH_LEAD: all, TECHNICIAN: assigned }` — Q04 đã chốt KTV được giao **và** QLKT đều được bấm hoàn tất); `backend/app/modules/workflow/guards.py` (2 guard đang ở `PENDING_GUARDS` ghi sẵn `"M6-02"` — item này implement, chuyển sang `GUARDS`); `backend/app/modules/orders/service.py` (`_apply_transition`/`_check_guards`/`lock_order`/`RULES["assigned"]` — mẫu `submit_order`/`cancel_order` tái dùng nguyên khung, chỉ thêm 1 lệnh mới); DOMAIN_MODEL §5 (`confirmation_signer_name varchar(120)`, `completed_at`); M6-01 (bảng `attachments`, tab "Tệp đính kèm", `can_upload_confirmation`).

## 1. Mục tiêu
Là Kỹ thuật viên được giao hoặc Quản lý kỹ thuật, tôi bấm "Hoàn tất đơn" và nhập tên người ký sau khi đã có ảnh phiếu xác nhận, để đơn chuyển sang "Hoàn tất" và lưu lại ai đã ký.

## 2. Phạm vi
- **Trong phạm vi:**
  - Cài đặt 2 guard đang chờ ở `workflow/guards.py`: `confirmation_attachment_in_current_revision` (≥1 attachment `kind=CUSTOMER_CONFIRMATION` với `revision_no = order.revision_no`), `signer_name_present` (tên người ký sau khi trim ≥1 ký tự) — đăng ký vào `GUARDS`.
  - `POST /api/v1/orders/{id}/complete` — body `{ version, confirmation_signer_name }`. Chuyển đơn `AWAITING_CONFIRMATION → COMPLETED`, ghi `completed_at = now`, `confirmation_signer_name`. Tái dùng khung `_apply_transition`/`_check_guards` đã có (như `submit`/`cancel`), không viết lại logic lock/version/audit.
  - `can_complete: bool` trên `OrderDetail` (cùng mẫu `can_upload_confirmation`) — `status == "AWAITING_CONFIRMATION" && order.complete ∈ scope` — frontend không tự suy luận.
  - UI: nút "Hoàn tất đơn" (trong `OrderDetailTabs.tsx`, cạnh nút "Thu hồi"/"Huỷ" đã có, hiện khi `allowed_commands` chứa `complete` **và** `can_complete`) mở `Sheet` "Hoàn tất đơn {mã}?" nhập tên người ký, theo đúng mẫu `CancelOrderSheet.tsx` (có `ConfirmDialog`/cảnh báo không đảo ngược theo UI_GUIDELINES dòng 80, xử lý `STALE_VERSION` giống `CancelOrderSheet`/`recall`).
  - Validate client: nút "Xác nhận hoàn tất" disabled khi tên người ký (trim) rỗng; nếu đơn chưa có ảnh phiếu xác nhận nào ở `revision_no` hiện tại (dựa trên danh sách đã tải ở tab "Tệp đính kèm", M6-01), ẩn nút "Hoàn tất đơn" và hiện gợi ý mở tab "Tệp đính kèm" — tránh gọi API chắc chắn 409.
  - Effect `audit` cho lệnh `complete` (tái dùng `audit.service.record`, giống `submit`/`cancel`).
- **Ngoài phạm vi (để lại milestone sau):**
  - `request_revision` (COMPLETED/AWAITING_CONFIRMATION → REVISION), guard `reason_present`/`order_in_revision`/`revision_has_work_if_revision`, task phát sinh, mở lại task, defect records → `M6-03`.
  - Effect `notify_order_owner` (thông báo cho Sale/Manager tạo đơn khi hoàn tất) — module Thông báo chưa xây (`M7-01`), bỏ qua giống cách M5-02/M5-03 đã xử lý (Q60), chỉ ghi `audit_events`.
  - Nhập `customer_feedback`/`result_note` ("Ý kiến khách hàng"/"Kết quả") lúc hoàn tất — 2 trường này đã có cột trong `orders` (DOMAIN_MODEL §5) nhưng chưa spec nào (kể cả M3-04a sửa liên hệ sau gửi) gán chúng vào một luồng nhập liệu cụ thể; `spec/state_machines.yaml` cũng không đặt guard nào lên 2 trường này cho lệnh `complete`. Đề xuất mặc định: **không** làm ở item này — xem Q73 (§8).
  - Huỷ/thay ảnh phiếu xác nhận đã tải trước khi hoàn tất — đã ngoài phạm vi từ M6-01, không mở lại ở đây.

## 3. Acceptance Criteria
Dữ liệu mẫu (tiếp theo M6-01): **Nguyễn Văn An** `NV001` [MANAGER]; **Vũ Thị Hoa** `NV005` [SALE, tạo đơn]; **Phạm Quang Tuấn** `NV010` [TECH_LEAD]; **Trần Minh Khoa** `NV014` [TECHNICIAN, được giao]; **Đặng Văn Long** `NV016` [TECHNICIAN, không liên quan đơn]. Đơn **DH2610-0020**, `status=AWAITING_CONFIRMATION`, `revision_no=0`, `version=5`, 1 task đã `DONE` do Khoa làm, đã có 1 ảnh `CUSTOMER_CONFIRMATION` ở `revision_no=0` (từ AC-CMP-001, M6-01).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-125 | Khoa (TECHNICIAN, được giao) | `POST /api/v1/orders/{id}/complete {version:5, confirmation_signer_name:"Lê Thị Mai"}` | 200; `status="COMPLETED"`, `completed_at`=now, `confirmation_signer_name="Lê Thị Mai"`, `version=6`; 1 `audit_events` (`entity_type=ORDER, action=complete, from_status=AWAITING_CONFIRMATION, to_status=COMPLETED`); `allowed_commands` không còn `complete`, có `request_revision` | integration |
| AC-ORD-126 | Tuấn (TECH_LEAD, scope `all`, không cần được giao) | `complete` cùng đơn (đơn khác, chưa hoàn tất, cũng đủ điều kiện) | 200; hoạt động như AC-ORD-125 | integration |
| AC-ORD-127 | Long (TECHNICIAN, không được giao task nào của DH2610-0020) | `complete` | 404 `NOT_FOUND` (ngoài scope, không lộ đơn tồn tại) | integration |
| AC-ORD-128 | An (MANAGER) hoặc Hoa (SALE) — không có capability `order.complete` | `complete` | 403 `FORBIDDEN` | integration |
| AC-ORD-129 | Đơn DH2610-0020 **chưa có** ảnh `CUSTOMER_CONFIRMATION` nào ở `revision_no=0` hiện tại (seed đơn mới không ảnh) | Khoa `complete {version, confirmation_signer_name:"Lê Thị Mai"}` | 409 `GUARD_FAILED` guard=`confirmation_attachment_in_current_revision`; đơn không đổi | integration |
| AC-ORD-130 | Đơn có 1 ảnh xác nhận nhưng ở `revision_no=0`, đơn đã qua `REVISION` nên hiện `revision_no=1` (ảnh cũ không tính) | Khoa `complete` | 409 `GUARD_FAILED` guard=`confirmation_attachment_in_current_revision` | integration |
| AC-ORD-131 | Đơn đủ ảnh xác nhận | Khoa `complete {version, confirmation_signer_name:""}` và `complete {version, confirmation_signer_name:"   "}` (chỉ khoảng trắng) | cả hai: 409 `GUARD_FAILED` guard=`signer_name_present`; đơn không đổi | integration |
| AC-ORD-132 | Đơn đang `IN_PROGRESS` (chưa tới `AWAITING_CONFIRMATION`) | Khoa `complete` | 409 `INVALID_TRANSITION`; đơn không đổi | integration |
| AC-ORD-133 | Đơn thật `version=5`, Khoa gửi `version:4` | Khoa `complete` | 409 `STALE_VERSION`; đơn không đổi | integration |
| AC-ORD-134 | Đơn đã `COMPLETED` từ trước | Khoa gọi lại `complete` | 409 `INVALID_TRANSITION` (`complete` chỉ từ `AWAITING_CONFIRMATION`) | integration |
| AC-ORD-135 | — | route `POST /orders/{id}/complete` | khai đúng 1 capability `order.complete`; nằm trong ma trận RBAC route thật | generated |
| AC-ORD-136 | Đơn DH2610-0020 `AWAITING_CONFIRMATION`, đã có ảnh xác nhận; Khoa được giao | `GET /orders/{id}` bởi Khoa | `can_complete=true`, `allowed_commands` chứa `complete`; cùng đơn, Hoa (SALE) gọi → `can_complete=false` | integration |
| AC-ORD-137 | Đơn `AWAITING_CONFIRMATION`, chưa có ảnh xác nhận ở `revision_no` hiện tại; Khoa được giao | `GET /orders/{id}` bởi Khoa | `can_complete=true` vẫn `true` (guard nghiệp vụ không tính vào quyền, giống mẫu `can_upload_confirmation`/`_allowed_commands` — chỉ capability+scope+trạng thái, không đánh giá guard trước) | integration |
| AC-ORD-138 | Trang chi tiết đơn (390px và desktop), `can_complete=true`, `allowed_commands` chứa `complete`, tab "Tệp đính kèm" đã có ≥1 ảnh ở `revision_no` hiện tại | bấm "Hoàn tất đơn" | mở `Sheet` "Hoàn tất đơn {mã}?" có cảnh báo không đảo ngược + `TextField` "Tên người ký"; nút "Xác nhận hoàn tất" disabled khi để trống/chỉ khoảng trắng | component |
| AC-ORD-139 | Sheet đang mở ở AC-ORD-138, nhập "Lê Thị Mai" | bấm "Xác nhận hoàn tất" | gọi `POST .../complete` đúng `version`+`confirmation_signer_name`; thành công → đóng sheet, toast "Đã hoàn tất đơn {mã}.", trang tải lại, huy hiệu trạng thái đổi "Hoàn tất" | component |
| AC-ORD-140 | Như AC-ORD-138 nhưng tab "Tệp đính kèm" **chưa** có ảnh nào ở `revision_no` hiện tại | mở trang chi tiết đơn | nút "Hoàn tất đơn" **không** hiện (dù `can_complete=true`/`allowed_commands` có `complete`) — chỉ dựa trên danh sách ảnh đã tải đang có trong state, tránh gọi API chắc chắn lỗi | component |
| AC-ORD-141 | API trả `STALE_VERSION` khi xác nhận hoàn tất | bấm "Xác nhận hoàn tất" | hiện "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" (mẫu `CancelOrderSheet`) | component |
| AC-ORD-142 | Đơn `AWAITING_CONFIRMATION`, đủ ảnh xác nhận, Khoa được giao | e2e mobile 390px: mở trang chi tiết đơn, tab "Tệp đính kèm" xác nhận có ảnh, bấm "Hoàn tất đơn", nhập tên người ký, xác nhận | không cuộn ngang; axe 0 vi phạm serious/critical; đơn chuyển "Hoàn tất", toast hiện | e2e |
| AC-ORD-143 | như trên | e2e desktop 1440px | nút "Hoàn tất đơn" đúng vị trí vùng thao tác, thao tác thành công, axe 0 vi phạm serious/critical | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{id}/complete | order.complete | `{ version: int, confirmation_signer_name: string }` | `OrderDetail` | 403, 404, 409 (`INVALID_TRANSITION`, `GUARD_FAILED`, `STALE_VERSION`) |

`OrderDetail` thêm `can_complete: bool`. `confirmation_signer_name` trong body: kiểu `str` (không ép `min_length` ở schema, giống `OrderCancel.reason` — guard `signer_name_present` xử lý rỗng/toàn khoảng trắng bằng 409 `GUARD_FAILED`, không phải 422, để có bài test riêng cho guard theo quy tắc đầu file `state_machines.yaml`); giới hạn 120 ký tự khớp cột `confirmation_signer_name varchar(120)` — vượt quá → 422 `VALIDATION_ERROR` field `confirmation_signer_name`.

**Thứ tự kiểm tra** (giống `submit`/`cancel`): (1) đơn tồn tại **và** trong scope → 404; (2) `version` khớp body → 409 `STALE_VERSION`; (3) trạng thái hiện tại ∈ `from` của `complete` (chỉ `AWAITING_CONFIRMATION`) → 409 `INVALID_TRANSITION`; (4) guard `confirmation_attachment_in_current_revision` rồi `signer_name_present` (thứ tự theo `state_machines.yaml`) → 409 `GUARD_FAILED`.

## 5. Dữ liệu / Migration
Không có bảng/cột mới — `confirmation_signer_name`, `completed_at` đã tồn tại từ migration M3-02a (chưa được ghi bởi lệnh nào tới nay).

## 6. UI
- Nút "Hoàn tất đơn" (icon `CheckCircle2`, theo `UI_GUIDELINES.md` §7) đặt cạnh các nút hành động đơn đã có (`OrderDetailTabs.tsx`, cùng khu vực "Thu hồi"/"Huỷ"): hiện khi `order.allowed_commands.includes("complete") && order.can_complete && có ≥1 ảnh confirmation ở revision_no hiện tại` (điều kiện thứ 3 lấy từ state danh sách ảnh tab "Tệp đính kèm" đã tải, M6-01 — không gọi API riêng).
- `CompleteOrderSheet.tsx` (component mới, cùng thư mục, viết theo mẫu `CancelOrderSheet.tsx`): tiêu đề "Hoàn tất đơn {mã}?", đoạn cảnh báo không đảo ngược (UI_GUIDELINES dòng 80), `TextField` "Tên người ký" (bắt buộc), nút "Xác nhận hoàn tất" disabled khi trim rỗng, xử lý lỗi/`STALE_VERSION` giống `CancelOrderSheet`.
- Toast: "Đã hoàn tất đơn {mã}." Lỗi guard tải ảnh (phòng thủ, nếu vẫn lọt tới server): "Cần tải ảnh phiếu xác nhận có chữ ký khách trước khi hoàn tất đơn." (UI_GUIDELINES dòng 98); lỗi `signer_name_present`: "Vui lòng nhập tên người ký."
- Mobile/desktop: không khác biệt bố cục ngoài vị trí nút theo khu vực thao tác đã có của trang chi tiết đơn.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Khoa (KTV), mở đơn đang "Chờ khách xác nhận" đã có ảnh phiếu ở tab "Tệp đính kèm" (từ M6-01).
2. Bấm "Hoàn tất đơn" → nhập tên người ký → "Xác nhận hoàn tất" → đơn chuyển "Hoàn tất", toast hiện.
3. Mở lại đơn đó bằng An (Manager) hoặc Hoa (Sale) → xác nhận huy hiệu trạng thái "Hoàn tất", tab "Lịch sử" có dòng `complete`.
4. Mở 1 đơn khác đang "Chờ khách xác nhận" nhưng **chưa** có ảnh phiếu → xác nhận nút "Hoàn tất đơn" không hiện.

## 8. Giả định & câu hỏi
- Giả định: `notify_order_owner` (effect của `complete`) bỏ qua ở item này, chỉ ghi `audit_events` — giống cách M5-02/M5-03 đã xử lý các effect thông báo khác (Q60), vì module Thông báo chưa xây (`M7-01`).
- Giả định: `confirmation_signer_name` không giới hạn ký tự đặc biệt/độ dài tối thiểu ngoài "không rỗng sau khi trim" — guard trong `state_machines.yaml` chỉ ghi "non-empty", không có quy tắc tối thiểu như `reason_present` (≥5 ký tự).
- **Q73 (mới, sẽ thêm vào `OPEN_QUESTIONS.md`):** `customer_feedback`/`result_note` ("Ý kiến khách hàng"/"Kết quả") đã có cột trong `orders` nhưng chưa spec nào gán vào một luồng nhập liệu. Đề xuất mặc định: **không** làm ở M6-02 (lệnh `complete` trong `state_machines.yaml` không đặt guard nào lên 2 trường này) — để lại cho một item riêng (có thể gộp vào `M6-03` "Chỉnh sửa" hoặc một ô nhập tuỳ chọn thêm vào chính sheet hoàn tất) nếu chủ dự án muốn thu thập ngay lúc hoàn tất. Cần chủ dự án quyết nơi/thời điểm nhập 2 trường này.
