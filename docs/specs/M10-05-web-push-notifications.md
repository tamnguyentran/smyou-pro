# M10-05 — Web Push cho thông báo (khi đã đóng tab/app)

- **Status:** Done
- **Backlog:** M10-05 (tách khỏi `M7-03-notifications-realtime-ws.md` theo quyết định của chủ dự án: làm WebSocket trước, Web Push sau) · **Milestone:** M10
- **Liên quan:** `docs/product/OPEN_QUESTIONS_ARCHIVE.md` Q11 ("v1 chỉ in-app; kiến trúc chừa chỗ kênh khác" — đã chốt ✅, item này hiện thực kênh "ngoài app" đó); `docs/specs/M7-01a-notifications-api.md` (bảng `notifications`, 13 điểm `notify_*`); `docs/specs/M7-03-notifications-realtime-ws.md` (`realtime.py` — điểm hook `after_commit` dùng lại ở đây); `backend/app/modules/notifications/service.py` (`_create` — điểm ghi duy nhất, theo ARCHITECTURE §3); `backend/app/core/config.py` (`Settings.vapid_*`); `backend/app/core/db.py` (`get_session` — nơi stash `session.info["app_state"]`).

## 1. Mục tiêu
Người dùng vẫn nhận được thông báo (dạng thông báo hệ điều hành/trình duyệt) ngay cả khi đã đóng tab/app — không cần mở app lên mới biết.

## 2. Phạm vi
- **Trong phạm vi:**
  - Cặp khoá VAPID cấu hình qua `Settings` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) — **tắt theo mặc định** (cả hai đều `None`): nếu chưa cấu hình, toàn bộ tính năng này là no-op, không ảnh hưởng in-app/WS đã có. Sinh khoá bằng `backend/scripts/generate_vapid_keys.py`.
  - Bảng mới `push_subscriptions` (`employee_id, endpoint, p256dh, auth, created_at`; `endpoint` duy nhất toàn hệ thống — 1 trình duyệt/thiết bị = 1 dòng, không theo nhân viên).
  - `POST /api/v1/notifications/push-subscriptions` (đăng ký — `endpoint`+`keys.p256dh`+`keys.auth` từ `PushSubscription.toJSON()` của trình duyệt; đăng ký lại cùng `endpoint` thì cập nhật tại chỗ, không lỗi/trùng), `POST /api/v1/notifications/push-subscriptions/unsubscribe` (bỏ đăng ký) — cả hai capability `notification.read` (dùng lại, cùng ý nghĩa "kênh thông báo của chính mình" như M7-03), 204 No Content.
  - `GET /api/v1/me` trả thêm `vapid_public_key: string | null` — `null` khi server chưa cấu hình (ẩn hẳn UI đăng ký ở frontend); không phải bí mật, khoá riêng tư không bao giờ rời server.
  - Mỗi khi `notifications.service._create` ghi 1 `Notification` **và transaction đó commit thành công** (cùng điểm hook `after_commit` của M7-03), server gửi Web Push tới **mọi** `push_subscriptions` của đúng `recipient_id` — chạy **đồng bộ, trên cùng thread** với request gốc (ngay sau khi transaction đã commit xong), có timeout ngắn (5s/thiết bị) để chặn trên không vô hạn; gửi push lỗi không làm lệnh nghiệp vụ gốc thất bại (nó đã commit trước đó). Cố ý **không** chạy trên thread riêng — đã thử và gặp lỗi tranh chấp cùng 1 kết nối CSDL dùng chung khi test (xem comment ở `realtime.py`).
  - 404/410 khi gửi push (trình duyệt đã tự hủy đăng ký, hoặc thiết bị gỡ app) → xoá dòng `push_subscriptions` tương ứng, không thử lại.
  - Frontend: Service Worker (`frontend/public/sw.js`) xử lý sự kiện `push` (hiện thông báo hệ điều hành) + `notificationclick` (mở/focus tab, điều hướng tới `/orders/{entity_id}`); nút "Nhận thông báo trên thiết bị này" / "Tắt thông báo trên thiết bị này" ở trang "Cá nhân" (`/ca-nhan`) — ẩn hẳn nếu `vapid_public_key` là `null` hoặc trình duyệt không hỗ trợ Push API (vài Safari cũ).
- **Ngoài phạm vi (không làm ở item này):**
  - Email/SMS/Zalo OA — kênh khác ngoài web push, chưa có quyết định.
  - Cho phép tắt theo từng loại thông báo (`type`) — tất cả loại dùng chung 1 công tắc bật/tắt mỗi thiết bị.
  - Thử lại khi gửi push thất bại vì lý do khác 404/410 (mạng chập chờn, dịch vụ push tạm ngưng) — chỉ log cảnh báo, không retry/queue.
  - Quản lý danh sách thiết bị đã đăng ký (xem/xoá thiết bị khác từ xa) — chỉ bật/tắt đúng thiết bị đang mở.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-NTF-036…042 | — | — | (đã dùng ở `M7-03`, không lặp lại ở đây) | — |
| AC-NTF-043 | Server đã cấu hình `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`; Tuấn (TECH_LEAD) đã đăng ký push trên 1 thiết bị; Hoa (SALE) có đơn `DRAFT` | Hoa `POST /orders/{id}/submit` | `notify_order_submitted` ghi `Notification` cho Tuấn + commit → `webpush()` được gọi đúng 1 lần với `subscription_info.endpoint` khớp thiết bị đã đăng ký và `vapid_private_key` đúng cấu hình | integration |
| (không ID) | Server **chưa** cấu hình VAPID; Tuấn đã "đăng ký" push (dữ liệu có trong bảng) | Hoa `POST /orders/{id}/submit` | `webpush()` **không** được gọi — tính năng tắt hoàn toàn khi thiếu cấu hình | integration |
| AC-NTF-044 | Như AC-NTF-043, nhưng `webpush()` giả lập trả lỗi 410 Gone | Hoa `POST /orders/{id}/submit` | Dòng `push_subscriptions` của Tuấn bị xoá; lệnh `submit` vẫn `200 OK` (lỗi gửi push không làm hỏng lệnh nghiệp vụ) | integration |
| (không ID) | — | `POST`/`POST .../unsubscribe` | Đăng ký lại cùng `endpoint` cập nhật `p256dh`/`auth` tại chỗ (không tạo dòng mới); bỏ đăng ký xoá đúng dòng của `endpoint` đó | integration |
| (không ID) | — | — | Cả 2 route khai đúng capability `notification.read` (test sinh tự động + kiểm `declared_routes`) | integration |
| AC-NTF-045 | `GET /api/v1/me` trả `vapid_public_key: null` (server chưa cấu hình) | mở `/ca-nhan` | **Không** hiện nút "Nhận thông báo"/"Tắt thông báo" nào | component |
| AC-NTF-046 | `vapid_public_key` có giá trị nhưng trình duyệt không hỗ trợ Push API | mở `/ca-nhan` | Không hiện nút (ẩn hoàn toàn, không báo lỗi) | component |
| AC-NTF-047 | `vapid_public_key` có giá trị, trình duyệt hỗ trợ, chưa có đăng ký hiện tại | mở `/ca-nhan`, bấm "Nhận thông báo trên thiết bị này" | Gọi `pushManager.subscribe()` rồi `POST /push-subscriptions` đúng `endpoint`/`keys`; nút đổi thành "Tắt thông báo trên thiết bị này" | component |
| AC-NTF-048 | Như trên, đã có đăng ký hiện tại | bấm "Tắt thông báo trên thiết bị này" | Gọi `POST /push-subscriptions/unsubscribe` đúng `endpoint`, rồi `subscription.unsubscribe()`; nút đổi lại "Nhận thông báo trên thiết bị này" | component |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/notifications/push-subscriptions | notification.read | `{endpoint, keys: {p256dh, auth}}` | 204 | 401 |
| POST | /api/v1/notifications/push-subscriptions/unsubscribe | notification.read | `{endpoint}` | 204 | 401 |
| GET | /api/v1/me | profile.manage | — | `MeResponse` + `vapid_public_key: string \| null` (mới) | 401 |

## 5. Dữ liệu / Migration
Migration mới: bảng `push_subscriptions` (`id, employee_id FK→employees ON DELETE CASCADE, endpoint UNIQUE, p256dh, auth, created_at`), index `employee_id`.

## 6. UI
- Trang "Cá nhân" (`/ca-nhan`): thêm 1 nút ngay dưới "Đổi mật khẩu" — icon `BellRing`/`BellOff` (lucide), style giống nút "Đăng xuất" (secondary, full-width).
- Không có trang/route mới.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Chạy `backend/scripts/generate_vapid_keys.py`, dán 2 giá trị vào `.env.dev` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), khởi động lại stack.
2. Đăng nhập, vào "Cá nhân" → thấy nút "Nhận thông báo trên thiết bị này" → bấm, cho phép quyền thông báo khi trình duyệt hỏi.
3. Đóng hẳn tab (hoặc chuyển sang ứng dụng khác).
4. Từ tài khoản khác, thực hiện 1 hành động tạo thông báo cho bạn (ví dụ Sale gửi đơn cho Quản lý kỹ thuật).
5. Thấy thông báo hệ điều hành hiện lên dù tab đã đóng; bấm vào thông báo → mở/focus lại app đúng trang đơn hàng.

## 8. Giả định & câu hỏi
- **Giả định (tắt theo mặc định):** không cấu hình VAPID = tính năng không tồn tại, không có flag bật/tắt rời — khớp cách M7-01a/M7-03 đã "chừa chỗ, không bắt buộc".
- **Giả định (không retry):** gửi push là best-effort; thất bại (khác 404/410) chỉ log, không thử lại/không xếp hàng gửi lại sau — nhất quán với mức độ quan trọng "tiện lợi thêm", không phải đường truyền thông báo chính (in-app + WS vẫn là nguồn sự thật).
- **Giả định (không retry theo từng loại thông báo):** 1 công tắc bật/tắt cho mọi loại — nếu sau này cần lọc theo loại, đó là thay đổi phạm vi mới, cần hỏi lại.
