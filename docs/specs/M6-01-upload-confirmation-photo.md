# M6-01 — Tải ảnh phiếu xác nhận

- **Status:** Done
- **Backlog:** M6-01 · **Milestone:** M6
- **Liên quan:** spec/state_machines.yaml#order (guard `confirmation_attachment_in_current_revision` dùng ở `complete`, M6-02 sau sẽ gọi); `spec/permissions.yaml` (`order.upload_confirmation`: TECH_LEAD all / TECHNICIAN assigned; `order.read` cho xem lại); DOMAIN_MODEL §11 (Attachment); WORKFLOWS §1–2; UI_GUIDELINES dòng 71, 76, 84, 98; M2-01a (bảng `attachments`, `files/domain.py` validate_image, `store_image` — nền đã có, dùng chung `kind=PRODUCT_IMAGE`); Q72 (đã chốt: M6-01 xây pipeline chung, M5-03/TASK_PHOTO tái dùng sau)

## 1. Mục tiêu
Là Kỹ thuật viên được giao hoặc Quản lý kỹ thuật, tôi chụp/chọn ảnh phiếu xác nhận đã có chữ ký khách và tải lên đơn đang "Chờ khách xác nhận", để sau đó bấm "Hoàn tất đơn" (M6-02) có đủ bằng chứng.

## 2. Phạm vi
- **Trong phạm vi:**
  - Tổng quát hoá `GET /api/v1/attachments/{id}` (hiện hard-code `catalog.read`, chỉ phục vụ `PRODUCT_IMAGE`) để phân quyền theo đúng `owner_type`/`kind` của từng tệp — `PRODUCT_IMAGE` (owner `PRODUCT`) vẫn qua `catalog.read`; `CUSTOMER_CONFIRMATION` (owner `ORDER`) qua `order.read` (scope như bảng quyền).
  - `POST /api/v1/orders/{id}/confirmation-attachments` — tải 1 ảnh phiếu xác nhận (multipart), gắn `kind=CUSTOMER_CONFIRMATION`, `revision_no = order.revision_no` hiện tại. Tái dùng `files/domain.py#validate_image` và `files/service.py#store_image` (chỉ thêm tham số `revision_no`).
  - `GET /api/v1/orders/{id}/confirmation-attachments` — danh sách ảnh đã tải (mọi `revision_no`, mới nhất trước) để hiển thị tab "Tệp đính kèm".
  - `can_upload_confirmation: bool` trên `OrderDetail` (cùng kiểu với `can_edit_contact`) — frontend không tự suy luận quyền.
  - Tab "Tệp đính kèm" trên trang chi tiết đơn (`OrderDetailTabs.tsx` — đang để placeholder "chưa có (M6)"): lưới ảnh đã tải (nhãn "Lần chỉnh sửa #N") + control tải ảnh mới khi `can_upload_confirmation && status === "AWAITING_CONFIRMATION"`.
  - Nén ảnh phía client trước khi tải (tái dùng `imageCompression.ts` đã có từ M2-01b — cạnh dài ≤ 2000px, JPEG 0.85, ≤ 10MB), xem trước, thanh tiến trình.
- **Ngoài phạm vi (item khác):**
  - Lệnh `complete` (chuyển `COMPLETED`, nhập tên người ký) → M6-02.
  - Xoá/thay ảnh đã tải, giới hạn số ảnh tối đa → chưa cần, có thể thêm sau nếu người dùng yêu cầu.
  - `kind=TASK_PHOTO` (ảnh công việc của KTV) → sau M6-01, theo Q72.
  - `application/pdf` cho `attachments` (DOMAIN_MODEL cho phép nhưng UI_GUIDELINES dòng 71 chỉ định `accept="image/*"`) — không triển khai ở item này.

## 3. Acceptance Criteria
Dữ liệu mẫu: **Nguyễn Văn An** `NV001` [MANAGER]; **Vũ Thị Hoa** `NV005` [SALE, tạo đơn]; **Phạm Quang Tuấn** `NV010` [TECH_LEAD]; **Trần Minh Khoa** `NV014` [TECHNICIAN, được giao]; **Đặng Văn Long** `NV016` [TECHNICIAN, không liên quan đơn]. Đơn **DH2610-0020**, `status=AWAITING_CONFIRMATION`, `revision_no=0`, 1 task đã `DONE` do Khoa làm.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CMP-001 | Khoa (TECHNICIAN, được giao task của DH2610-0020) | `POST /api/v1/orders/{id}/confirmation-attachments` multipart file `phieu.jpg` thật (magic bytes JPEG, 3MB) | 200/201 `{id, revision_no:0, mime_type:"image/jpeg", size_bytes, uploaded_by, created_at}`; `GET /api/v1/orders/{id}/confirmation-attachments` sau đó có đúng 1 phần tử này | integration |
| AC-CMP-002 | Tuấn (TECH_LEAD, scope `all`, không cần được giao) | tải ảnh hợp lệ lên **cùng đơn** DH2610-0020 | 200/201; danh sách giờ có 2 ảnh (của Khoa và của Tuấn), cả hai `revision_no:0` | integration |
| AC-CMP-003 | Long (TECHNICIAN, có capability `order.upload_confirmation` scope `assigned` nhưng **không** được giao task nào của DH2610-0020) | tải ảnh hợp lệ lên DH2610-0020 | 404 `NOT_FOUND` (ngoài scope, không lộ đơn tồn tại — PERMISSIONS quy tắc 4) | integration |
| AC-CMP-004 | An (MANAGER) hoặc Hoa (SALE) — không có capability `order.upload_confirmation` | tải ảnh lên DH2610-0020 | 403 `FORBIDDEN` | integration |
| AC-CMP-005 | Khoa | tải: file tên `.jpg` nhưng nội dung không phải ảnh (magic bytes sai) / file 11MB / `Content-Type` khai `image/gif` | lần lượt 422 `INVALID_FILE_TYPE` / 422 `FILE_TOO_LARGE` / 422 `UNSUPPORTED_MEDIA_TYPE`; không có ảnh nào được tạo | integration |
| AC-CMP-006 | DH2610-0012 (mẫu M5-03) đang `REVISION`, `revision_no=1`, đã có 1 ảnh xác nhận ở `revision_no=0` từ trước khi chỉnh sửa | Khoa tải thêm 1 ảnh hợp lệ | 200/201, ảnh mới có `revision_no=1`; `GET .../confirmation-attachments` trả cả 2 ảnh, sắp mới nhất trước, mỗi ảnh giữ đúng `revision_no` lúc tải (lịch sử không đổi) | integration |
| AC-CMP-007 | Ảnh `CUSTOMER_CONFIRMATION` vừa tải ở AC-CMP-001 (owner `ORDER` = DH2610-0020) | `GET /api/v1/attachments/{id}` bởi An, Hoa, Tuấn, hoặc Khoa (đều có `order.read` — scope của Khoa là `assigned`, đúng đơn này) | 200, header `Content-Type: image/jpeg`, đúng nội dung file | integration |
| AC-CMP-008 | Ảnh ở AC-CMP-001 | `GET /api/v1/attachments/{id}` bởi Long (TECHNICIAN, `order.read` scope `assigned` nhưng không liên quan đơn này) | 404 `NOT_FOUND` | integration |
| AC-CMP-009 | Ảnh sản phẩm `PRODUCT_IMAGE` đã có từ M2-01a (không liên quan đơn) | `GET /api/v1/attachments/{id}` bởi Khoa (TECHNICIAN, không có `catalog.read`) | 403 `FORBIDDEN` — hành vi cũ của AC-CAT-010 không đổi (regression) | integration |
| AC-CMP-010 | — | mọi route mới (`orders_upload_confirmation_attachment`, `orders_list_confirmation_attachments`) | khai báo đúng 1 capability, nằm trong ma trận RBAC route thật; `attachments_get` (đã có) tiếp tục xuất hiện đúng 1 lần dù giờ phân quyền theo nhiều capability khác nhau tuỳ bản ghi | generated |
| AC-CMP-011 | DH2610-0020 `AWAITING_CONFIRMATION`; Khoa đã được giao task | `GET /api/v1/orders/{id}` bởi Khoa | `OrderDetail.can_upload_confirmation = true`; cùng đơn, Hoa (SALE) gọi → `can_upload_confirmation = false` (không có capability) | integration |
| AC-CMP-012 | Màn hình chi tiết đơn (390px và desktop), tab "Tệp đính kèm", `can_upload_confirmation=true`, `status=AWAITING_CONFIRMATION` | chọn 1 ảnh qua control tải lên | ảnh được nén phía client (cạnh dài ≤ 2000px, JPEG 0.85) trước khi gửi; hiện xem trước + thanh tiến trình; sau khi xong, ảnh xuất hiện trong lưới, toast "Đã tải ảnh phiếu xác nhận." | component |
| AC-CMP-013 | Như trên nhưng `status != AWAITING_CONFIRMATION` (vd `IN_PROGRESS`) **hoặc** `can_upload_confirmation=false` | mở tab "Tệp đính kèm" | không hiện control tải lên; nếu đã có ảnh từ lần chỉnh sửa trước vẫn hiện lưới xem lại (chỉ ẩn phần *tải thêm*) | component |
| AC-CMP-014 | Tải lên lỗi do server trả 422 `FILE_TOO_LARGE` | chọn ảnh > 10MB | thông báo tiếng Việt "Ảnh vượt quá 10MB." hiện ngay phía client (không gọi API) — tái dùng `validateImageFile` | component |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{id}/confirmation-attachments | order.upload_confirmation | multipart file (`image/jpeg,png,webp,heic`, ≤10MB) | 201 `ConfirmationAttachment` | 403, 404, 422 |
| GET | /api/v1/orders/{id}/confirmation-attachments | order.read | — | `{items: ConfirmationAttachment[]}` | 403, 404 |
| GET | /api/v1/attachments/{id} | *(tuỳ `owner_type`/`kind` của bản ghi: `PRODUCT`→`catalog.read`, `ORDER`→`order.read`)* | — | binary + `Content-Type` | 403, 404 |

`ConfirmationAttachment { id, revision_no, mime_type, size_bytes, uploaded_by, uploaded_by_name, created_at }`. `GET /orders/{id}` (`OrderDetail`) thêm trường `can_upload_confirmation: bool`.

Scope của `GET /api/v1/attachments/{id}` theo bản ghi, không theo route tĩnh: router tra `owner_type`/`kind` trước rồi gọi `require(capability_phù_hợp)` tương đương tại runtime — khác mẫu `Depends(require(...))` tĩnh hiện có; cần ghi chú riêng cho test "generated" (AC-CMP-010) để không báo nhầm thiếu capability.

## 5. Dữ liệu / Migration
- Không có bảng mới (dùng `attachments` đã tạo ở M2-01a). Thêm migration: index `(owner_type, owner_id, kind, revision_no)` trên `attachments` (ARCHITECTURE §5: index cho mọi cột lọc) — phục vụ cả truy vấn ở đây và guard `confirmation_attachment_in_current_revision` mà M6-02 sẽ dùng.
- `files/service.py#store_image` thêm tham số `revision_no: int` (hiện mặc định cột là 1, cần ghi đúng `order.revision_no` lúc tải).

## 6. UI
- Tab "Tệp đính kèm" (`OrderDetailTabs.tsx`, thay dòng chú thích "chưa có (M6)"): lưới thẻ ảnh (thumbnail vuông, chạm/click mở ảnh gốc qua `GET /attachments/{id}`), mỗi thẻ có nhãn "Lần chỉnh sửa #{revision_no}" và thời gian tải.
- Control tải lên (chỉ hiện khi `can_upload_confirmation && status === "AWAITING_CONFIRMATION"`): `<input type="file" accept="image/*" capture="environment">` như `ImageUploadField` (M2-01b) — tái dùng `imageCompression.ts`, viết component `ConfirmationPhotoUpload` riêng (props/luồng khác: nhiều ảnh, không gắn vào 1 trường `*_attachment_id` của 1 entity mà là danh sách).
- Mobile (390px): lưới 2 cột; desktop: lưới 4 cột, control tải lên nằm trên lưới.
- Toast: "Đã tải ảnh phiếu xác nhận." Lỗi: theo `detail` của problem+json, hoặc câu tiếng Việt phía client (AC-CMP-014).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Khoa (KTV), mở "Việc của tôi", hoàn thành task cuối của một đơn → đơn chuyển "Chờ khách xác nhận".
2. Mở `/orders/{id}`, tab "Tệp đính kèm" → thấy control tải ảnh → chọn 1 ảnh chụp từ camera → thấy xem trước, tiến trình, rồi ảnh xuất hiện trong lưới.
3. Đăng nhập Hoa (Sale) hoặc An (Manager), mở cùng đơn, tab "Tệp đính kèm" → thấy ảnh Khoa vừa tải nhưng không có control tải lên.

## 8. Giả định & câu hỏi
- Giả định: không chặn tải ảnh theo trạng thái đơn ở server (chỉ chặn ở UI khi không phải `AWAITING_CONFIRMATION`) — tài liệu không nêu quy tắc chặn cứng ở server cho hành động này (khác lệnh chuyển trạng thái), và `task.upload_photo` cũng không có guard trạng thái. Nếu chủ dự án muốn chặn cứng ở server, cần một dòng `OPEN_QUESTIONS` mới trước khi đổi.
- Giả định: không giới hạn số ảnh tối đa mỗi lần chỉnh sửa — bỏ ngoài phạm vi, thêm sau nếu cần (ghi ở mục 2).
- Giả định: ảnh `CUSTOMER_CONFIRMATION` không có ảnh nào bị xoá — tệp cũ luôn xem lại được (giống hành vi `PRODUCT_IMAGE` ở AC-CAT-011, file cũ không bị xoá khi có ảnh mới).
