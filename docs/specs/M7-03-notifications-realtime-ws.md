# M7-03 — Thông báo realtime qua WebSocket

- **Status:** Done
- **Backlog:** M7-03 (tiếp nối M7-01a/M7-01b, trước đó cố ý hoãn realtime — xem §2 "ngoài phạm vi" của `M7-01b-notifications-ui.md`) · **Milestone:** M7
- **Liên quan:** `docs/product/OPEN_QUESTIONS_ARCHIVE.md` Q11 ("v1 chỉ in-app; kiến trúc chừa chỗ kênh khác" — đã chốt ✅, item này hiện thực phần "kênh khác" trong-app, chưa làm Web Push ra ngoài app); `backend/app/modules/notifications/service.py` (`_create` — điểm ghi `Notification` duy nhất, theo ARCHITECTURE §3); `backend/app/core/authz.py` (`require()`/`undeclared_routes` — chỉ áp cho `APIRoute`, item này mở rộng thêm nhánh `WebSocketRoute` + `spec/permissions.yaml#websocket_routes`); `backend/app/core/db.py` (`get_session`: 1 transaction/request, `expire_on_commit=False`); `docs/architecture/DEPLOYMENT.md` (`uvicorn` chạy đúng 1 worker, không multi-instance — tiền đề để dùng registry trong-bộ-nhớ, không cần Redis).

## 1. Mục tiêu
Người dùng đang mở app thấy thông báo mới (badge số chưa đọc + danh sách) ngay lập tức, không phải đợi tối đa 30 giây như polling hiện tại.

## 2. Phạm vi
- **Trong phạm vi:**
  - 1 WebSocket endpoint mới `GET /api/v1/notifications/ws` (quy ước đặt tên theo REST path hiện có, dù về bản chất là kênh 2 chiều) — xác thực bằng cookie session có sẵn (`smyou_access`, dùng lại `identity.service.authenticate`), capability `notification.read` (scope luôn `self` cho mọi vai trò — không có khái niệm "xem hộ người khác" qua kênh này).
  - Mỗi lần `notifications.service._create` ghi 1 dòng `Notification` **và transaction đó commit thành công**, server gửi ngay 1 message `{"type": "notification", "notification": {...}}` tới mọi kết nối WebSocket đang mở của đúng `recipient_id` đó (nhiều tab/thiết bị cùng nhận). Nếu transaction rollback, không gửi gì (hook vào sự kiện `after_commit` của SQLAlchemy, không phải ngay sau `session.add`).
  - Registry kết nối trong bộ nhớ tiến trình (`backend/app/modules/notifications/realtime.py`) — **chỉ đúng khi backend chạy 1 tiến trình** (đang đúng, xem DEPLOYMENT.md). Nếu sau này chạy nhiều worker/instance, cần đổi sang pub/sub dùng chung (vd Redis) — ghi rõ ở §8, không làm ở item này.
  - Mở rộng `app/core/authz.py#undeclared_routes`/`spec/permissions.yaml` thêm mục `websocket_routes` (path + capability) — vì `require()` chỉ hoạt động như FastAPI dependency trên `APIRoute`, không áp dụng được cho `WebSocketRoute`; route WS phải tự xác thực + tự kiểm capability trong handler, có test integration riêng xác nhận (không nằm trong ma trận RBAC tự sinh vốn chỉ quét `APIRoute`).
  - Frontend: hook `useNotificationsRealtime()` (mount 1 lần ở `AppShell`) mở kết nối, nhận message → gọi `invalidateQueries` cho `["me"]` (số chưa đọc) và danh sách thông báo — tận dụng lại luồng tải dữ liệu đã có (`useMe`, `useNotifications`), không tự vẽ UI từ message. Mất kết nối → tự nối lại, giãn dần 1s → tối đa 30s. **Không bỏ polling 30s hiện có** (`useMe` `refetchInterval`) — WS là đường nhanh, polling là lưới an toàn khi WS chưa nối lại được/trình duyệt chặn.
  - Cấu hình nginx trong container `web` (`frontend/nginx/default.conf.template`) thêm `location` riêng cho đúng path WS với header `Upgrade`/`Connection: upgrade` + `proxy_read_timeout` dài (kết nối giữ lâu) — nginx hệ thống (`ops/nginx/smyoutask.conf`) đã có sẵn 2 header này từ trước, không cần sửa.
- **Ngoài phạm vi (không làm ở item này):**
  - Web Push (thông báo khi đã đóng tab/app, cần Service Worker + VAPID key + bảng `push_subscriptions`) — backlog riêng, đã thống nhất với chủ dự án tách làm sau.
  - Gửi lại thông báo đã bỏ lỡ lúc mất kết nối qua kênh WS riêng (invalidate cache khi nối lại là đủ — React Query tự fetch lại số liệu mới nhất, không cần "catch-up" qua WS).
  - Đổi số lượng/nội dung message gửi qua WS khác với dữ liệu `Notification` đã có — không thêm trường mới.
  - Nhiều worker/instance backend (Redis pub/sub) — xem giả định §8.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-NTF-036 | Chưa đăng nhập (không có cookie `smyou_access` hợp lệ) | Kết nối `GET /api/v1/notifications/ws` | Server đóng kết nối ngay, code `4401`, không `accept()` trước | integration |
| AC-NTF-037 | Tuấn (TECH_LEAD) đã kết nối WS; Hoa (SALE) có đơn `DRAFT` | Hoa `POST /orders/{id}/submit` (qua HTTP, không qua WS) | `notify_order_submitted` ghi `Notification` cho Tuấn + commit thành công → kết nối WS của Tuấn nhận ngay `{"type": "notification", "notification": {type: "ORDER_SUBMITTED", entity_type: "ORDER", entity_id: <order_id>, ...}}` | integration |
| AC-NTF-038 | Frontend: hook đã mở kết nối WS (giả lập bằng `WebSocket` mock) | Nhận message `{"type": "notification", ...}` | Gọi `invalidateQueries` cho queryKey `["me"]`, `["notifications"]` **và `["dashboard"]`** (quyết định 2026-10-21, AC-DASH-053: nếu đang ở trang "Tổng quan", query đang active nên react-query refetch ngay; nếu không, chỉ đánh dấu stale, tự lấy lại khi quay lại trang) | component |
| AC-NTF-039 | Như trên | Nhận message không phải loại `"notification"` (vd ping/debug) | Không gọi `invalidateQueries` nào | component |
| AC-NTF-040 | Hook đã mở kết nối | Kết nối đóng (`onclose`, mất mạng/server restart) | Tự mở lại kết nối mới sau khoảng chờ tăng dần (1s, 2s, 4s, …, tối đa 30s) — không vòng lặp dồn dập | component |
| AC-NTF-041 | Hook đang mở kết nối | Component gỡ (unmount — vd đăng xuất, rời app) | Đóng socket ngay; không còn tự nối lại nữa dù đợi lâu | component |
| AC-NTF-042 | Route `GET /api/v1/notifications/ws` | — | Có mặt trong `spec/permissions.yaml#websocket_routes` với `capability: notification.read`; `undeclared_routes()` không báo lỗi cho route này (test sinh tự động hiện có `test_real_app_routes_all_declared` đã phủ, không cần test riêng) | generated |

## 4. API
| Kiểu | Path | Capability | Xác thực | Message gửi đi |
|---|---|---|---|---|
| WebSocket | /api/v1/notifications/ws | notification.read (tự kiểm trong handler, không qua `require()`) | Cookie `smyou_access` (như mọi request khác) | `{"type": "notification", "notification": {id, type, title, body, entity_type, entity_id, created_at}}` — đúng các trường `NotificationOut` hiện có, không thêm bớt |

Không có route HTTP/REST mới; schema `DashboardOut`/OpenAPI không đổi (WebSocket route không xuất hiện trong OpenAPI — FastAPI không export WS vào schema OpenAPI 3.x, đã xác nhận bằng cách chạy `export_openapi.py` và so sánh không đổi).

## 5. Dữ liệu / Migration
Không có — dùng nguyên bảng `notifications` đã có từ `M7-01a`. Registry kết nối WS hoàn toàn trong bộ nhớ, không lưu DB.

## 6. UI
Không có thay đổi UI nhìn thấy được (badge chuông, danh sách — vẫn là component đã có ở `M7-01b`); khác biệt duy nhất là badge/danh sách cập nhật nhanh hơn (gần như ngay lập tức thay vì chờ tối đa 30s).

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Mở app bằng 2 trình duyệt/2 tab khác nhau: 1 đăng nhập Quản lý kỹ thuật, 1 đăng nhập Sale.
2. Bên tab Sale: tạo đơn, gửi đơn cho điều phối.
3. Quan sát tab Quản lý kỹ thuật: badge chuông tăng số gần như ngay lập tức, không cần tải lại trang hay đợi 30 giây.
4. Tắt mạng (DevTools → Offline) ở tab Quản lý kỹ thuật vài giây rồi bật lại → vẫn tiếp tục nhận thông báo mới sau đó (tự nối lại).
5. Đăng xuất → không còn lỗi/cảnh báo gì trong console liên quan kết nối WS bị treo.

## 8. Giả định & câu hỏi
- **Giả định (1 tiến trình backend):** registry kết nối sống trong bộ nhớ của đúng 1 tiến trình uvicorn, khớp cấu hình deploy hiện tại (không `--workers`, không nhiều container backend). Nếu sau này cần scale ngang, phần phát tin (`realtime.py`) phải đổi sang pub/sub dùng chung (Redis hoặc tương đương) — đây là một thay đổi hạ tầng riêng, không phải thay đổi nghiệp vụ, nên không cần hỏi chủ dự án trước khi ai đó làm lúc đó, nhưng cần nhớ named ở đây để không quên.
- **Giả định (không "bắt kịp" tin nhắn lỡ mất lúc rớt mạng qua chính kênh WS):** khi kết nối lại, dựa vào việc `invalidateQueries` khi vừa `onopen`... **chưa làm ở item này** — hiện tại chỉ polling 30s là lưới an toàn bắt kịp phần bị lỡ. Nếu muốn mượt hơn (gọi lại ngay khi `onopen` sau khi từng mất kết nối), đó là cải tiến nhỏ có thể làm sau, không phải ngoài phạm vi phải hỏi.
- **Câu hỏi đã hỏi chủ dự án:** làm WebSocket + Web Push cùng lúc hay tách — **đã chốt: tách, làm WebSocket trước** (Web Push là backlog riêng, chưa có ID).
- **Tổng quan tự làm mới khi có thông báo (quyết định 2026-10-21, AC-DASH-053)**: thêm `["dashboard"]` vào danh sách `invalidateQueries` ở AC-NTF-038 — tận dụng hành vi mặc định của react-query (chỉ query đang "active"/mounted mới refetch ngay) để chỉ thật sự gọi lại API khi người dùng đang mở trang "Tổng quan", không cần tự kiểm tra route hiện tại.
