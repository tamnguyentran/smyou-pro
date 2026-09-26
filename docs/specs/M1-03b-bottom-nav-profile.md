# M1-03b — Điều hướng dưới đáy (mobile) & trang Cá nhân

- **Status:** Draft
- **Approval:** nội dung đã được duyệt cùng M1-03a (2026-09-26, Q26–Q30); đổi thành Approved khi bắt đầu M1-03b (sau khi M1-03a merge)
- **Backlog:** M1-03b · **Milestone:** M1
- **Liên quan:** xem `M1-03a-app-shell.md` (mục tiêu, UI, UAT, Q26–Q30); `spec/permissions.yaml#mobile_bottom_nav`

## 2. Phạm vi
Bottom nav 5 vị trí theo `mobile_bottom_nav` (Q28), nút tròn hành động chính; trang Cá nhân (Q30); trang giữ chỗ Thông báo (nội dung thật ở M7-01).

## 3. Acceptance Criteria
Tài khoản mẫu (seed E2E): **An** [MANAGER], **Hoa** [SALE], **Tuấn** [TECH_LEAD], **Khoa** [TECHNICIAN], **Hà** [SALE, TECHNICIAN].
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-047 | Điện thoại 390px | đăng nhập lần lượt An, Hoa, Tuấn, Khoa, Hà | bottom nav cố định đáy, chừa `safe-area-inset-bottom`: **An**: Tổng quan · Đơn hàng · (+) Tạo đơn · Thông báo · Cá nhân. **Hoa**: như An. **Tuấn**: Tổng quan · Bảng đầu việc · (+) Tạo đầu việc · Thông báo · Cá nhân. **Khoa**: Tổng quan · Việc của tôi · Thông báo · Cá nhân (không có nút +). **Hà**: Tổng quan · Đơn hàng · (+) Tạo đơn · Thông báo · Cá nhân (Q28: ưu tiên TECH_LEAD > SALE > MANAGER > TECHNICIAN cho cả ô 2 và nút +) | component + e2e |
| AC-SYS-048 | Điện thoại, ở `/orders` | — | mục "Đơn hàng" ở bottom nav đang chọn (`aria-current`); nội dung trang có `pb-24` (không bị che); bottom nav **ẩn** ở ≥1024px | component + e2e |
| AC-SYS-049 | Đã đăng nhập | chạm "Cá nhân" | trang `/ca-nhan`: tên, mã NV, email, các vai trò; nút "Đổi mật khẩu" (tới `/doi-mat-khau`, lời giới thiệu không nói "lần đầu" khi không bắt buộc, có nút "Huỷ" quay lại) và "Đăng xuất" (Q30) | component + e2e |
| AC-SYS-050 | Đã đăng nhập | chạm "Thông báo" | trang `/thong-bao` giữ chỗ: "Chưa có thông báo." (nội dung thật ở M7-01) | component |
| AC-SYS-051 | Như AC-SYS-046, cho bottom nav và trang Cá nhân | E2E | axe 0 serious/critical; không cuộn ngang 360px; ảnh `bottom-nav-<vai trò>.png`, `profile.png` | e2e |

## 4. API
Không có endpoint mới.

## 5. Dữ liệu / Migration
Không có.

## 8. Giả định
Theo Q26–Q30 ✅ (OPEN_QUESTIONS).
