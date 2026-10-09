# M7-01b — Thông báo in-app (UI)

- **Status:** Approved
- **Backlog:** M7-01 (phần `b` — giao diện của `M7-01a`) · **Milestone:** M7
- **Liên quan:** `M7-01a-notifications-api.md` (API `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/mark-all-read`, `MeResponse.unread_notifications_count`); `docs/design/UI_GUIDELINES.md` dòng 55 (top bar desktop: "chuông thông báo có badge"), dòng 59 (header mobile `h-14`: "hamburger, tiêu đề, chuông"), dòng 61 (bottom nav: vị trí "Thông báo" đã có icon `Bell`); `frontend/src/app/shell/AppShell.tsx` (header desktop `h-16` + header mobile `h-14`, chưa có chuông); `frontend/src/app/shell/BottomNav.tsx` (`IconSlot` "Thông báo" → `/thong-bao`, chưa có badge); `frontend/src/features/notifications/pages/NotificationsPage.tsx` (placeholder hiện tại, cần thay bằng danh sách thật); `frontend/src/app/routes.tsx` (`/thong-bao`, `/ca-nhan` — follow-up review M1-03b: bọc bằng kiểm tra capability như `EmployeesPage`); `frontend/src/features/employees/pages/EmployeesPage.tsx` dòng 63 (mẫu `if (!("x" in capabilities)) return <ForbiddenPage />`); `frontend/src/features/me/api.ts` (`useMe`, polling).

## 1. Mục tiêu
Là người dùng bất kỳ (Sale/QLKT/KTV/Manager), tôi thấy chuông thông báo có số chưa đọc ở đầu trang (desktop/mobile) và trong bottom nav, bấm vào xem danh sách, đánh dấu đã đọc, và bấm 1 thông báo để đi thẳng tới đơn liên quan.

## 2. Phạm vi
- Trong phạm vi:
  - Component chuông + badge số chưa đọc, đặt ở: header desktop (`h-16`), header mobile (`h-14`), và `IconSlot` "Thông báo" của `BottomNav`.
  - Polling 30s số chưa đọc (dùng lại `unread_notifications_count` từ `/me`, không gọi API riêng).
  - Trang `/thong-bao` thật: danh sách phân trang, mỗi dòng hiện tiêu đề/nội dung/thời gian tương đối, trạng thái đã/chưa đọc (chấm hoặc nền khác màu), nút "Đánh dấu tất cả đã đọc".
  - Bấm 1 dòng: đánh dấu đã đọc dòng đó (nếu chưa) + chuyển tới `/orders/{entity_id}`.
  - Bọc `/thong-bao` và `/ca-nhan` bằng kiểm tra capability (`notification.read`, `profile.manage`) — follow-up review M1-03b.
  - Trạng thái rỗng, loading, lỗi (dùng `EmptyState`/pattern đã có).
- Ngoài phạm vi (không làm ở item này):
  - Dropdown/popover xem nhanh ở header (bấm chuông luôn điều hướng sang `/thong-bao`, không có panel nổi) — đơn giản hoá, UI_GUIDELINES không mô tả chi tiết panel.
  - Thông báo real-time (WebSocket/SSE) — chỉ polling 30s theo yêu cầu backlog.
  - Lazy-load / infinite scroll — dùng phân trang nút "Xem thêm" giống các danh sách khác trong app nếu có mẫu, hoặc `Pagination` component đã có (theo mẫu `EmployeesPage`).

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-NTF-021 | Người dùng có 3 thông báo chưa đọc (`/me` trả `unread_notifications_count=3`) | mở app (desktop ≥1024px) | Header `h-16` hiện icon chuông với badge số "3" cạnh nút CTA chính | component |
| AC-NTF-022 | Như trên, màn hình điện thoại (390px) | mở app | Header `h-14` hiện chuông có badge "3"; `BottomNav` vị trí "Thông báo" cũng hiện badge "3" trên icon `Bell` | component |
| AC-NTF-023 | `unread_notifications_count=0` | mở app | Chuông hiện, **không** có badge số (ẩn hẳn, không hiện "0") | component |
| AC-NTF-024 | `unread_notifications_count=99` | mở app | Badge hiện "99"; `unread_notifications_count=120` → badge hiện "99+" (giới hạn hiển thị, giống mẫu `Badge` nếu đã có quy ước; nếu chưa có, đặt quy ước này) | component |
| AC-NTF-025 | Trang đang mở; `/me` lần đầu trả `count=0` | 1 thông báo mới được tạo ở backend (giả lập qua mock) trong vòng 30s | Sau tối đa 30s (polling), badge tự cập nhật thành "1" không cần tải lại trang | component (giả lập timer) |
| AC-NTF-026 | Người dùng gọi `/thong-bao` lần đầu, có 5 thông báo (3 chưa đọc, 2 đã đọc), mới nhất trước | mở trang | Danh sách hiện 5 dòng đúng thứ tự; 3 dòng chưa đọc có dấu hiệu khác biệt (vd. nền nhạt + chấm) so với 2 dòng đã đọc | component |
| AC-NTF-027 | Danh sách rỗng (chưa có thông báo nào) | mở `/thong-bao` | Hiện `EmptyState` tiếng Việt, ví dụ "Chưa có thông báo." + icon `Bell` (giữ copy của placeholder cũ) | component |
| AC-NTF-028 | Dòng thông báo N chưa đọc, `entity_id` = đơn DH-0001 | bấm vào dòng N | Gọi `POST /notifications/N/read`; điều hướng tới `/orders/{DH-0001.id}`; quay lại `/thong-bao` thấy dòng N đã chuyển trạng thái "đã đọc" | component |
| AC-NTF-029 | Có ≥1 thông báo chưa đọc | bấm "Đánh dấu tất cả đã đọc" | Gọi `POST /notifications/mark-all-read`; toàn bộ dòng chuyển "đã đọc"; badge chuông về 0 (không cần đợi vòng polling kế) | component |
| AC-NTF-030 | API `GET /notifications` lỗi mạng | mở `/thong-bao` | Hiện thông báo lỗi tiếng Việt + nút "Thử lại" (mẫu `MeError`/`Alert` đã dùng ở các trang khác) | component |
| AC-NTF-031 | Người dùng vào thẳng URL `/thong-bao` (mọi vai trò đều có `notification.read: self`) | tải trang | Không bị `ForbiddenPage` (capability có ở cả 4 vai trò) — AC này xác nhận guard không chặn nhầm | component |
| AC-NTF-032 | Giả lập 1 vai trò không có `notification.read` (dựng `/me` mock thiếu capability, để kiểm guard hoạt động đúng cơ chế chung) | vào `/thong-bao` | Hiện `ForbiddenPage` (403) — cùng cơ chế với `EmployeesPage`/`AuditPage` | component |
| AC-NTF-033 | Tương tự AC-NTF-032 nhưng cho `/ca-nhan` thiếu `profile.manage` | vào `/ca-nhan` | Hiện `ForbiddenPage` | component |
| AC-NTF-034 | Mobile 390px | mở `/thong-bao` | Vùng chạm mỗi dòng ≥44px; không tràn ngang; khớp `UI_GUIDELINES` | e2e (screenshot) |
| AC-NTF-035 | Desktop 1440px | mở `/thong-bao` | Bố cục danh sách rộng hơn, không bị kéo giãn bất thường | e2e (screenshot) |

## 4. API
Không có route mới — dùng lại 4 route của `M7-01a` (§5 của spec đó) qua `frontend/src/features/notifications/api.ts` (hook `useNotifications`, `useUnreadCount` — hoặc đọc trực tiếp từ `useMe().data.unread_notifications_count`, `useMarkRead`, `useMarkAllRead`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- **Chuông + badge** (component chung `NotificationBell`, dùng ở cả 3 nơi): icon `Bell` (`lucide-react`), số chưa đọc hiện ở góc trên-phải dạng badge tròn nền đỏ/urgent — tái dùng token màu `urgent` đã có trong `UI_GUIDELINES`; số >99 hiện "99+"; số =0 ẩn badge. Bấm → điều hướng `/thong-bao` (dùng `Link`/`NavLink`, không mở popover).
- **Header desktop** (`AppShell.tsx`, trong `<header className="h-16...">`): đặt `NotificationBell` ngay trước `PrimaryAction`.
- **Header mobile** (`AppShell.tsx`, `<header className="h-14...">`): đặt `NotificationBell` ở bên phải, sau tiêu đề trang (hamburger trái, tiêu đề giữa, chuông phải — theo `UI_GUIDELINES` dòng 59).
- **BottomNav**: `IconSlot` "Thông báo" hiện có — thêm badge nhỏ đè lên icon `Bell` (không đổi vị trí/label).
- **Trang `/thong-bao`**: danh sách dạng card giống `EmployeeList`/các list khác — mỗi dòng: icon theo `type` (gợi ý: `ORDER_*` → `ShoppingBag`, `TASK_*` → `Wrench`, `ASSIGNMENT_*` → `ClipboardCheck`), `title` đậm, `body` 1-2 dòng, thời gian tương đối ("5 phút trước" — dùng helper định dạng đã có nếu có, nếu chưa có thì thêm hàm nhỏ `formatRelativeTime`), chấm xanh nhỏ nếu chưa đọc. Nút "Đánh dấu tất cả đã đọc" ở đầu danh sách, ẩn khi không có thông báo chưa đọc.
- Copy tiếng Việt: toast không cần (hành động âm thầm); lỗi tải danh sách: "Không tải được danh sách thông báo. Vui lòng thử lại."; rỗng: "Chưa có thông báo." (giữ nguyên placeholder cũ).

## 7. Kịch bản UAT thủ công (≤5 bước)
1. Đăng nhập vai trò QLKT trên điện thoại → thấy chuông ở header có số chưa đọc khớp số đơn/đầu việc gần đây.
2. Bấm chuông → vào trang "Thông báo", thấy danh sách đúng thứ tự mới nhất trước.
3. Bấm 1 dòng chưa đọc → được đưa tới trang đơn liên quan; quay lại thấy dòng đó đã chuyển "đã đọc".
4. Bấm "Đánh dấu tất cả đã đọc" → badge trên chuông và bottom nav về 0.
5. Mở lại trên desktop (1440px) → kiểm chuông ở top bar cũng đúng số, giao diện không vỡ layout.

## 8. Giả định & câu hỏi
- Giả định: bấm chuông điều hướng thẳng tới `/thong-bao`, không có dropdown xem nhanh — đơn giản hoá vì `UI_GUIDELINES` không mô tả panel, và app vốn mobile-first (dropdown kém phù hợp trên điện thoại).
- Giả định: ngưỡng hiển thị badge "99+" khi >99 — không có quy ước nào trong `UI_GUIDELINES`/`DOMAIN_MODEL`, chọn mặc định phổ biến.
- Giả định: đánh dấu đã đọc xảy ra khi bấm vào từng dòng (không tự đánh dấu toàn bộ khi mở trang) — giữ hành vi rõ ràng, người dùng chủ động biết mình đã xem dòng nào.
- Không có câu hỏi mới cần ghi vào `OPEN_QUESTIONS.md`.
