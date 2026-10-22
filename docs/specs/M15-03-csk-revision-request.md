# M15-03 — CSKH tạo yêu cầu chỉnh sửa đơn gửi Quản lý kỹ thuật

- **Status:** Approved (2026-10-22, chốt Q93 — xem mục 8)
- **Backlog:** M15-03 · **Milestone:** M15
- **Liên quan:** M15-02a/b (khối "Phản hồi khách hàng" trên trang chi tiết đơn); `spec/state_machines.yaml#order` (`request_revision`, capability `order.revise`, chỉ `TECH_LEAD`); `docs/product/DOMAIN_MODEL.md` §12 (`audit_events`), §13 (`notification`)

## 1. Mục tiêu
Là CSKH, sau khi ghi nhận phản hồi không tốt của khách, tôi muốn gửi yêu cầu chỉnh sửa đơn tới Quản lý kỹ thuật (kèm mô tả mặc định lấy từ nội dung phản hồi) để họ quyết định có mở lại xử lý hay không — tôi **không** tự chuyển trạng thái đơn.

## 2. Phạm vi
- Trong phạm vi:
  - Nút "Tạo yêu cầu chỉnh sửa" trên khối "Phản hồi khách hàng" (M15-02b), chỉ hiện khi đơn đang `COMPLETED` và đã có `csat_comment`.
  - Form mô tả: mặc định điền sẵn = `csat_comment` hiện tại; cho CSKH chỉnh sửa/thêm chú thích trước khi gửi.
  - `POST /api/v1/orders/{id}/revision-requests` — capability `customer_care.manage_feedback` — không đổi trạng thái đơn, không tạo bảng riêng; tạo 1 `audit_event` (`entity_type=ORDER`, `action=revision_requested`, `data={note}`) + thông báo (`notification`) tới mọi `TECH_LEAD` đang hoạt động, giống cách `notify_tech_leads` đã dùng ở `spec/state_machines.yaml`.
  - Trang chi tiết đơn hiện lại badge "Đã gửi yêu cầu chỉnh sửa (chưa xử lý)" cho tới khi QLKT thực sự bấm "Chỉnh sửa" (`request_revision`, đổi `revision_no`) — badge ẩn khi đơn chuyển `REVISION` hoặc khi có `request_revision` mới hơn thời điểm gửi yêu cầu.
- Ngoài phạm vi: không cấp `order.revise` cho CSKH; không có màn "hộp thư yêu cầu" riêng cho QLKT (QLKT thấy qua chuông thông báo + badge trên đơn) — xem §8.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CSK-020 | Lan (CUSTOMER_CARE); đơn `COMPLETED`, `csat_comment="Máy vẫn còn kêu to"` | Mở form "Tạo yêu cầu chỉnh sửa" | Ô mô tả điền sẵn "Máy vẫn còn kêu to" | component |
| AC-CSK-021 | Như trên, Lan thêm chú thích "Khách muốn kỹ thuật quay lại kiểm tra lần nữa" | `POST /orders/{id}/revision-requests {note}` | 201; 1 `audit_event action=revision_requested` với `data.note` đúng; mọi `TECH_LEAD` đang hoạt động nhận 1 `notification`; đơn **vẫn** `COMPLETED` (không đổi trạng thái) | integration |
| AC-CSK-022 | Đơn chưa `COMPLETED` (vd `IN_PROGRESS`) | Lan `POST /orders/{id}/revision-requests {note}` | 409 `GUARD_FAILED` guard=`order_completed` | integration |
| AC-CSK-023 | Hoa (SALE) | `POST /orders/{id}/revision-requests {note}` | 403 | integration |
| AC-CSK-024 | Đã gửi yêu cầu lúc 10:00 | Tuấn (TECH_LEAD) mở đơn trước khi xử lý | Trang chi tiết hiện badge "Đã gửi yêu cầu chỉnh sửa (chưa xử lý)" | component |
| AC-CSK-025 | Như trên | Tuấn bấm "Chỉnh sửa" (`request_revision`, có sẵn từ M6-03a) | Đơn → `REVISION`; badge "Đã gửi yêu cầu…" biến mất khỏi trang chi tiết (đã được xử lý) | integration + component |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/orders/{id}/revision-requests | customer_care.manage_feedback | `{note}` | `{id, order_id, note, requested_by, requested_at}` | 404, 409 (`GUARD_FAILED`), 422, 403 |

## 5. Dữ liệu / Migration
Không có bảng mới — chỉ dùng `audit_events` (đã có) + `notifications` (đã có). Response của `POST` build trực tiếp từ audit event vừa tạo, không cần bảng `revision_requests` riêng.

## 6. UI
- Nút "Tạo yêu cầu chỉnh sửa" (icon `MessageSquareWarning`), mở sheet/dialog với textarea mô tả (điền sẵn), nút "Gửi yêu cầu".
- Toast "Đã gửi yêu cầu chỉnh sửa tới Quản lý kỹ thuật."
- Badge trạng thái yêu cầu trên header trang chi tiết đơn, tông màu `review`.

## 7. Kịch bản UAT thủ công
1. CSKH mở đơn đã hoàn tất có phản hồi xấu → "Tạo yêu cầu chỉnh sửa" → gửi.
2. Đăng nhập QLKT → thấy thông báo + badge trên đơn.
3. QLKT bấm "Chỉnh sửa" → badge biến mất, đơn chuyển "Chỉnh sửa".

## 8. Giả định & câu hỏi
- Giả định thiết kế tối giản: không có bảng/entity `revision_requests` riêng, không có màn "hộp thư" liệt kê các yêu cầu đang chờ cho QLKT — dựa vào chuông thông báo (đã có, M7-01) + badge trên từng đơn là đủ.
- Q93 (đã chốt 2026-10-22, `docs/product/OPEN_QUESTIONS_ARCHIVE.md`): giữ đúng 2 giả định mặc định — cho CSKH gửi nhiều lần (mỗi lần 1 audit event + 1 thông báo riêng, badge không đếm số lần); không cần luật chặn riêng cho đơn `REVISION` (guard `order_completed` đã tự loại).
