# M22-01 — Hình nền trang đăng nhập / Quên mật khẩu / Đặt lại mật khẩu

- **Status:** Approved (2026-11-03, chủ dự án chốt 4 điểm: ảnh, mobile, lớp phủ, phạm vi trang)
- **Backlog:** M22-01 · **Milestone:** M22
- **Phụ thuộc:** —
- **Liên quan:** frontend/src/features/auth/pages/{LoginPage,ForgotPasswordPage,ResetPasswordPage}.tsx, `Tài liệu tham khảo/login-background/login-bg-deepmind.webp`

## 1. Mục tiêu
Là người dùng, khi mở trang đăng nhập (và Quên/Đặt lại mật khẩu) trên máy tính hoặc tablet, tôi thấy hình nền thương hiệu thay vì nền trơn.

## 2. Phạm vi
- Trong phạm vi:
  - Ảnh `login-bg-deepmind.webp` (~90 KB) đưa vào `frontend/src/assets/` (bundle qua Vite, có hash), làm nền phủ kín (`cover`, căn giữa) cho 3 trang: `/dang-nhap`, Quên mật khẩu, Đặt lại mật khẩu.
  - Chỉ hiện từ `md` (≥ 768px — tablet, desktop). Dưới 768px giữ nền hiện tại, **không tải ảnh** (dùng CSS background trong media query, không dùng `<img>`).
  - Không có lớp phủ tối/mờ; thẻ form giữ nguyên (`bg-card`, `shadow-card`).
  - Dùng chung 1 khung (layout) cho 3 trang để không lặp code.
- Ngoài phạm vi: trang Đổi mật khẩu (sau đăng nhập), dark mode riêng cho ảnh, ảnh khác cho mobile.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-076 | — | render `/dang-nhap`, Quên mật khẩu, Đặt lại mật khẩu | `<main>` của cả 3 trang dùng cùng khung có class nền `md:bg-[url(...login-bg-deepmind...)]` + `bg-cover bg-center`; không có lớp phủ | component |
| AC-UI-077 | Viewport 1440px và 768px | mở `/dang-nhap` | Ảnh nền `login-bg-deepmind` được tải và hiện phía sau thẻ form; form vẫn đọc được (axe không có lỗi serious/critical) | e2e |
| AC-UI-078 | Viewport 390px | mở `/dang-nhap` | Không có request tải `login-bg-deepmind`; nền như cũ; không cuộn ngang | e2e |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Ảnh phủ kín toàn màn hình, thẻ form căn giữa như hiện tại.
- Screenshot 390px + 1440px (+ 768px) trang đăng nhập → `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. Mở trang đăng nhập trên máy tính → thấy hình nền; form rõ ràng.
2. Thu nhỏ cửa sổ < 768px (hoặc mở trên điện thoại) → không còn hình nền.
3. Bấm "Quên mật khẩu" → cùng hình nền; mở link đặt lại mật khẩu → cùng hình nền.

## 8. Giả định & câu hỏi
- Giả định: "tablet" = từ 768px (`md:`) theo `docs/design/UI_GUIDELINES.md`.
