# M1-01b — Xác thực (giao diện): trang Đăng nhập, Đổi mật khẩu, tự làm mới phiên

- **Status:** Approved
- **Approval:** nội dung đã được duyệt (2026-09-26); Approved khi bắt đầu M1-01b (M1-01a đã merge). AC đánh số lại 021–027 vì AC-AUTH-020 đã dùng cho luật Q25 ở M1-01a
- **Backlog:** M1-01b · **Milestone:** M1
- **Liên quan:** PRD §4, §6 (Bảo mật); DOMAIN_MODEL §1 (Employee); `spec/permissions.yaml` (`public_routes`, `profile.manage`); ARCHITECTURE §2 (pwdlib argon2, PyJWT, cookie httpOnly, access 15', refresh 7 ngày, rotate); ADR-014 (cookie `Path` theo `BASE_PATH`)

## 1. Mục tiêu
Là nhân viên SMYou, tôi đăng nhập bằng email + mật khẩu trên điện thoại hoặc máy tính, ở lại đăng nhập trong ngày làm việc mà không phải nhập lại, và phải đổi mật khẩu do quản lý cấp ngay lần đầu, để tài khoản chỉ mình tôi biết mật khẩu.

## 2. Phạm vi
- Trong: trang Đăng nhập, trang Đổi mật khẩu bắt buộc, client API tự làm mới phiên khi gặp 401, nút Đăng xuất tạm thời, `backend/scripts/seed_e2e.py`, E2E.
- Ngoài: AppShell/menu (M1-03).
- Phụ thuộc: M1-01a (API).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-021 | Chưa đăng nhập | mở `/smyoutask/` (hoặc bất kỳ trang nào) | chuyển tới `/smyoutask/dang-nhap?next=<trang cũ>`; form có nhãn "Email", "Mật khẩu", nút hiện/ẩn mật khẩu (`aria-label` "Hiện mật khẩu"/"Ẩn mật khẩu"), nút "Đăng nhập" cao ≥ 44px | component + e2e |
| AC-AUTH-022 | Trang đăng nhập | bấm "Đăng nhập" | nút hiện spinner và bị khoá (chống bấm đôi); lỗi 401/423/403 hiện đúng `detail` tiếng Việt từ server phía trên form; lỗi 422 hiện dưới từng ô | component |
| AC-AUTH-023 | An đăng nhập thành công | — | chuyển tới `next` (chỉ nhận đường dẫn nội bộ bắt đầu bằng `/`, không nhận URL ngoài) hoặc trang chủ | component + e2e |
| AC-AUTH-024 | Khoa đăng nhập lần đầu | — | chuyển tới "Đổi mật khẩu" (`/doi-mat-khau`), không đi được trang khác; đổi thành công → toast "Đã đổi mật khẩu." và về trang chủ | e2e |
| AC-AUTH-025 | Đang dùng app, access token hết hạn | một lệnh gọi API nhận 401 | client tự gọi `/auth/refresh` **một lần** rồi gọi lại; nhiều lệnh đồng thời chỉ gây 1 lần refresh; refresh thất bại → về trang đăng nhập với `next` | component |
| AC-AUTH-026 | An đã đăng nhập | bấm "Đăng xuất" (tạm đặt trên trang chủ cho tới AppShell M1-03) | về trang đăng nhập; nút quay lại trình duyệt không mở lại trang cần đăng nhập | e2e |
| AC-AUTH-027 | Trang Đăng nhập, Đổi mật khẩu | E2E mobile (iPhone 13) + desktop 1440 | 0 vi phạm axe serious/critical; không cuộn ngang ở 360px; screenshot `login.png`, `change-password.png` | e2e |

## 6. UI
- **Đăng nhập** (`/dang-nhap`): nền `bg-page`, card giữa màn hình như trang placeholder; logo + "SMYou Pro"; ô Email (`type=email`, `autocomplete=username`), Mật khẩu (`autocomplete=current-password`, nút mắt `Eye`/`EyeOff`); nút Primary full-width "Đăng nhập" (icon `LogIn`); lỗi chung dạng khung `urgent` phía trên form. Mobile: card full-width, nút dính đáy không cần (form ngắn).
- **Đổi mật khẩu** (`/doi-mat-khau`): tiêu đề "Đổi mật khẩu", dòng giải thích "Đây là lần đăng nhập đầu tiên. Hãy đặt mật khẩu mới chỉ bạn biết."; 3 ô: Mật khẩu hiện tại, Mật khẩu mới, Nhập lại mật khẩu mới (khớp kiểm ở client: "Mật khẩu nhập lại không khớp."); gợi ý quy tắc dưới ô mới; nút "Đổi mật khẩu" (icon `KeyRound`).
- Toast thành công; loading = spinner trong nút; không spinner toàn trang.

## 7. Kịch bản UAT thủ công
1. Chạy `make up`, tạo Manager bằng `docker compose -f compose.dev.yml exec backend python -m app.cli create-manager ...`.
2. Trên điện thoại mở app → trang Đăng nhập → nhập sai mật khẩu 5 lần → lần 6 nhập đúng vẫn bị báo tạm khoá.
3. Đợi 15 phút (hoặc dùng tài khoản khác) → đăng nhập đúng → vào trang chủ.
4. Dùng tài khoản KTV mẫu (mật khẩu tạm) → bị yêu cầu đổi mật khẩu → đổi → vào trang chủ; đăng xuất.

## 8. Giả định
- Theo quyết định Q19–Q24 (OPEN_QUESTIONS).
