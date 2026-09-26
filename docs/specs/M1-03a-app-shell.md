# M1-03a — Khung ứng dụng theo vai trò: menu, sidebar, menu trượt, 403/404

- **Status:** Done
- **Approval:** chủ dự án duyệt nội dung + Q26–Q30 theo đề xuất (2026-09-26)
- **Backlog:** M1-03a · **Milestone:** M1
- **Liên quan:** `spec/permissions.yaml` (`menu`, `mobile_bottom_nav`, `roles[].label`); PERMISSIONS.md (Menu theo vai trò); UI_GUIDELINES §3 (desktop), §4 (mobile), §6–§8; ARCHITECTURE §4 (`GET /me`), §7; TESTING_STRATEGY §3 (`test_menu_sync`); M1-02 (`/me`), M1-01b (phiên, đăng xuất)

## 1. Mục tiêu
Là nhân viên SMYou, sau khi đăng nhập tôi thấy một khung ứng dụng thống nhất: menu chỉ gồm những mục đúng vai trò của mình (Sale thấy Đơn hàng, Quản lý kỹ thuật thấy Điều phối, Kỹ thuật viên thấy Việc của tôi…), trên máy tính là thanh bên trái, trên điện thoại là menu trượt và thanh điều hướng dưới đáy dùng được bằng một tay; vào trang không có quyền thì được báo rõ ràng.

## 2. Phạm vi
Tách làm 2 phần (Q26 ✅); spec này là **M1-03a**, phần b ở `M1-03b-bottom-nav-profile.md`:

- **M1-03a — Menu & khung chính:**
  - Dữ liệu menu `frontend/src/app/menu.json` **sinh từ** `spec/permissions.yaml` (`make contract`), test chống lệch.
  - Lấy `/me` (TanStack Query); lọc menu theo `capabilities`; badge từ `counters`.
  - Desktop (≥1024px): sidebar `w-72` 2 cấp + top bar (tiêu đề trang, nút hành động chính theo vai trò). Điện thoại/máy tính bảng (<1024px): header `h-14` + nút mở menu trượt (drawer) chứa đúng menu 2 cấp.
  - Chân sidebar/drawer: chữ cái đầu, tên, vai trò, nút **Đăng xuất** (bỏ nút tạm ở trang chủ của M1-01b).
  - Chặn route theo quyền: trang 403, trang 404, trang "đang phát triển" cho mục menu chưa làm (Q27).
- **M1-03b — Điều hướng dưới đáy (mobile) & trang Cá nhân:**
  - Bottom nav 5 vị trí theo `mobile_bottom_nav` (Q28), nút tròn hành động chính.
  - Trang **Cá nhân** (Q30) và chỗ giữ trang **Thông báo** (nội dung thật ở M7-01).
- Ngoài: ô tìm kiếm `Ctrl/⌘ K` (sau khi có đơn/khách/task), chuông thông báo có số (M7-01), nội dung thật của các trang nghiệp vụ, dashboard theo vai trò (M7-02).

## 3. Acceptance Criteria
Tài khoản mẫu (seed E2E): **An** [MANAGER], **Hoa** [SALE], **Tuấn** [TECH_LEAD], **Khoa** [TECHNICIAN], **Hà** [SALE, TECHNICIAN].


| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-034 | `spec/permissions.yaml` | `make contract` | sinh `frontend/src/app/menu.json` (menu + `mobile_bottom_nav` + nhãn vai trò) giống hệt YAML; sửa YAML mà không sinh lại → CI `contract` đỏ | generated |
| AC-SYS-035 | An / Hoa / Tuấn / Khoa đăng nhập | xem menu | đúng bảng "Menu theo vai trò" của PERMISSIONS.md: **An**: Tổng quan · Đơn hàng (Danh sách đơn, Tạo đơn mới, Khách hàng) · Danh mục (Sản phẩm, Dịch vụ) · Nhân sự & phân quyền · Báo cáo KPI · Nhật ký hệ thống. **Hoa**: Tổng quan · Đơn hàng (3 mục con). **Tuấn**: Tổng quan · Điều phối kỹ thuật (Đơn chờ điều phối, Bảng đầu việc, Lịch & tải việc, Đơn cần chỉnh sửa) · Báo cáo KPI. **Khoa**: Tổng quan · Việc của tôi · Báo cáo KPI. Không có mục nào khác | component + e2e |
| AC-SYS-036 | Hà [SALE, TECHNICIAN] | xem menu | hợp của hai vai trò: Tổng quan · Việc của tôi · Đơn hàng (3 mục con) · Báo cáo KPI; header hiện "Nhân viên kinh doanh · Nhân viên kỹ thuật" (Q29) | component |
| AC-SYS-037 | `/me` trả `counters = {"pending_dispatch_count": 4, "revision_count": 0}` (dữ liệu giả trong test) | Tuấn xem menu | "Đơn chờ điều phối" có badge "4"; "Đơn cần chỉnh sửa" không có badge (0 thì ẩn); số > 99 hiện "99+"; badge có nhãn đọc màn hình "4 mục" | component |
| AC-SYS-038 | Desktop 1440px, Tuấn ở `/dispatch/board` | — | sidebar `w-72` hiện sẵn; mục "Bảng đầu việc" đang chọn (`aria-current="page"`, nền `bg-brand`, chữ trắng); nhóm "Điều phối kỹ thuật" tự mở; bấm tiêu đề nhóm → thu/mở (`aria-expanded`); top bar có tiêu đề trang và nút "Tạo đầu việc" (icon `Plus`) | component + e2e |
| AC-SYS-039 | Điện thoại 390px, Hoa ở trang chủ | chạm nút "Mở menu" (`aria-label`) | drawer `w-80` trượt từ trái + lớp phủ; đóng khi: chọn một mục (và chuyển trang), chạm lớp phủ, nhấn Esc (focus trả về nút "Mở menu"); khi mở, Tab không ra khỏi drawer | component + e2e |
| AC-SYS-040 | Đã đăng nhập, mọi kích thước | bấm "Đăng xuất" ở chân sidebar/drawer | như AC-AUTH-026 (về trang đăng nhập, Back không vào lại được); trang chủ không còn nút đăng xuất tạm | component + e2e |
| AC-SYS-041 | Khoa (không có `employee.manage`) | mở trực tiếp `/smyoutask/employees` | trang 403 trong khung ứng dụng: icon `ShieldX`, "Bạn không có quyền truy cập trang này.", nút "Về trang chủ"; không gọi API của trang đó | component + e2e |
| AC-SYS-042 | Đã đăng nhập | mở `/smyoutask/khong-co-trang-nay` | trang 404: icon `SearchX`, "Không tìm thấy trang.", nút "Về trang chủ". Chưa đăng nhập → vẫn về trang đăng nhập trước (AC-AUTH-021) | component + e2e |
| AC-SYS-043 | Hoa có quyền, mục "Danh sách đơn" chưa được xây | chọn mục đó | trang giữ chỗ trong khung: tiêu đề "Danh sách đơn", icon của mục, "Tính năng đang được phát triển." (Q27) | component |
| AC-SYS-044 | `/me` đang tải / lỗi mạng / trả 401 | mở app | đang tải: khung với Skeleton ở vị trí menu (không spinner toàn trang); lỗi: "Không tải được thông tin tài khoản." + nút "Thử lại"; 401: về trang đăng nhập với `next` (luồng làm mới phiên của M1-01b) | component |
| AC-SYS-045 | Mọi trang trong khung | — | tiêu đề tab `<Tên trang> · SMYou Pro`; mọi nút chỉ có icon có `aria-label` tiếng Việt; vùng chạm ≥ 44px | component |
| AC-SYS-046 | An, Hoa, Tuấn, Khoa trên iPhone 13 và 1440px | E2E | 0 vi phạm axe serious/critical (menu mở và đóng); không cuộn ngang ở 360px; ảnh chụp `shell-<vai trò>.png` (mobile có ảnh drawer mở `shell-drawer.png`) | e2e |

## 4. API
Không có endpoint mới. Dùng `GET /api/v1/me` (M1-02). Làm mới `/me` khi cửa sổ được focus lại và sau mỗi lần làm mới phiên (để badge/quyền không cũ).

## 5. Dữ liệu / Migration
Không có. `backend/scripts/seed_e2e.py` thêm tài khoản Hoa (SALE), Tuấn (TECH_LEAD), Hà (SALE+TECHNICIAN).

## 6. UI
- Theo UI_GUIDELINES §3 (desktop) và §4 (mobile); màu chỉ bằng token.
- **Desktop:** sidebar trắng `border-r border-line`; header logo khối `rounded-xl bg-brand` + chữ "SMYou Pro" + nhãn vai trò; menu cấp 1 (icon + nhãn + badge), cấp 2 accordion `ml-4 pl-4 border-l-2 border-line`; chân: avatar chữ cái đầu, tên, vai trò, nút "Đăng xuất" (icon `LogOut`). Top bar `h-16` sticky: tiêu đề trang + nút hành động chính (nền brand, dấu `+` vàng).
- **Mobile/tablet (<1024px):** header `h-14` sticky: nút `Menu` ("Mở menu"), tiêu đề, (chỗ cho chuông ở M7-01). Drawer `w-80`, `transition-transform duration-300`.
- **Bottom nav (M1-03b):** 5 ô, icon + nhãn ngắn; nút + tròn nổi `bg-brand` icon vàng.
- Trang 403/404/đang phát triển: căn giữa, icon lớn `text-muted`, câu ngắn, nút Primary "Về trang chủ".

## 7. Kịch bản UAT thủ công
1. Trên máy tính đăng nhập bằng Manager → thấy đúng menu (không có "Điều phối kỹ thuật", "Việc của tôi").
2. Mở đường dẫn `/smyoutask/dispatch/board` → trang "Bạn không có quyền truy cập trang này."
3. Trên điện thoại đăng nhập bằng tài khoản KTV mẫu → chạm "Mở menu" → chỉ có Tổng quan, Việc của tôi, Báo cáo KPI; chạm ra ngoài để đóng.
4. (M1-03b) Thanh dưới đáy: KTV không có nút +; Sale có nút "Tạo đơn".
5. Bấm "Đăng xuất" ở cuối menu → về trang đăng nhập.

## 8. Giả định & quyết định (Q26–Q30 ✅ theo đề xuất, 2026-09-26)
- **Q26** Tách M1-03 thành **M1-03a** (menu, sidebar, drawer, 403/404) và **M1-03b** (bottom nav, trang Cá nhân)? *Đề xuất: có* — ước tính ~600 dòng code giao diện, quá mức ~400 dòng/PR; phần a đã đủ để dùng trên cả điện thoại (qua menu trượt).
- **Q27** Các mục menu mà tính năng chưa làm (Đơn hàng, Điều phối…) có hiện không? *Đề xuất: hiện*, mở ra trang "Tính năng đang được phát triển." — để chủ dự án duyệt được cấu trúc menu ngay bây giờ; mỗi item sau thay trang giữ chỗ bằng trang thật.
- **Q28** Ô thứ 2 của bottom nav (`my-work|dispatch-board|orders`) với người nhiều vai trò chọn theo thứ tự nào? *Đề xuất:* cùng thứ tự ưu tiên của nút + trong YAML: TECH_LEAD > SALE > MANAGER > TECHNICIAN (Hà SALE+KTV → "Đơn hàng"; "Việc của tôi" vẫn có trong menu trượt).
- **Q29** Người nhiều vai trò: đầu menu hiện gì ở chỗ "tên vai trò hiện tại"? *Đề xuất:* tất cả nhãn vai trò nối bằng " · " (không có khái niệm "chuyển vai trò" — quyền là hợp).
- **Q30** Trang Cá nhân gồm gì? *Đề xuất:* thông tin (tên, mã, email, vai trò) + "Đổi mật khẩu" (tự nguyện, dùng lại màn đổi mật khẩu) + "Đăng xuất". Sửa tên/SĐT do Manager làm ở M1-04.
- Giả định kỹ thuật: `menu.json` sinh bằng script trong `make contract` (không thêm thư viện đọc YAML cho frontend); 768–1023px dùng giao diện mobile (menu trượt) vì sidebar `w-72` chiếm quá nhiều chỗ; route guard ở frontend chỉ để hiển thị — server vẫn kiểm quyền mọi API (M1-02).
