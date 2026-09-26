# M1-04b — Quản lý nhân viên & vai trò: giao diện

- **Status:** Draft
- **Approval:** nội dung đã được duyệt cùng M1-04a (2026-09-26, Q31–Q38); đổi thành Approved khi bắt đầu M1-04b (sau khi M1-04a merge)
- **Backlog:** M1-04b · **Milestone:** M1
- **Liên quan:** `M1-04a-employees-api.md` (mục tiêu, API, Q31–Q38); UI_GUIDELINES §3–§6; M1-03a (menu, 403)

## 2. Phạm vi
Trang Nhân sự (`/employees`): danh sách (bảng/thẻ), tìm/lọc/phân trang, form tạo/sửa, vai trò, khoá/mở, cấp lại mật khẩu, hộp thoại mật khẩu tạm một lần; chỉ đọc với Quản lý kỹ thuật.

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Bình** NV002 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN].
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-013 | An trên máy tính / điện thoại | mở "Nhân sự & phân quyền" | máy tính: bảng Mã · Họ tên · Email · SĐT · Vai trò (badge) · Trạng thái (badge "Đang hoạt động"/"Đã khoá", "Tạm khoá đăng nhập"); điện thoại: thẻ xếp dọc; ô tìm kiếm (gõ xong 300ms mới gọi API), lọc vai trò, lọc trạng thái; phân trang; trạng thái tải (Skeleton), trống ("Chưa có nhân viên phù hợp."), lỗi (Thử lại) | component + e2e |
| AC-EMP-014 | An | bấm "Thêm nhân viên" (icon `UserPlus`), điền, chọn vai trò (nhiều ô chọn), Lưu | form kiểm ở client (zod) + lỗi 409/422 của server hiện dưới từng ô; lưu xong → hộp thoại hiện **mật khẩu tạm một lần** với nút "Sao chép" và lời nhắc "Mật khẩu chỉ hiện một lần. Hãy gửi cho nhân viên qua kênh riêng."; đóng hộp thoại → toast "Đã thêm nhân viên Lê Thị Hoa." | component + e2e |
| AC-EMP-015 | An mở một nhân viên | sửa thông tin / vai trò, Lưu | toast "Đã cập nhật."; 409 `STALE_VERSION` → thông báo "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút Tải lại; 409 `LAST_MANAGER` → hiện đúng thông điệp server | component |
| AC-EMP-016 | An | "Khoá tài khoản" / "Mở khoá" / "Cấp lại mật khẩu" | `ConfirmDialog` nêu rõ hậu quả (khoá: "Nhân viên sẽ bị đăng xuất khỏi mọi thiết bị."; cấp lại: "Mật khẩu cũ sẽ không dùng được nữa."); cấp lại → hộp thoại mật khẩu tạm như AC-EMP-014; nút của chính mình không có "Khoá tài khoản" | component + e2e |
| AC-EMP-017 | Tuấn (TECH_LEAD) | mở `/employees` trực tiếp | xem được danh sách và chi tiết (chỉ đọc, không có nút Thêm/Sửa/Khoá/Cấp lại); Hoa (SALE) mở → trang 403 (M1-03a). *Menu "Nhân sự" vẫn chỉ hiện với Manager theo YAML* | component + e2e |
| AC-EMP-018 | Các màn trên, iPhone 13 + 1440px | E2E | axe 0 serious/critical; không cuộn ngang 360px; vùng chạm ≥ 44px; ảnh `employees.png`, `employee-form.png`, `temporary-password.png` | e2e |

## 4. API
Dùng API của M1-04a.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Theo UI_GUIDELINES §3–§4, §6 (ConfirmDialog, Toast, Skeleton, EmptyState); bottom sheet trên điện thoại cho form và hộp xác nhận.
- Badge vai trò dùng nhãn tiếng Việt từ YAML; trạng thái: "Đang hoạt động" (`completed`), "Đã khoá" (`todo`), "Tạm khoá đăng nhập" (`urgent`).
- Copy chính: "Thêm nhân viên", "Lưu", "Khoá tài khoản", "Mở khoá", "Cấp lại mật khẩu", "Sao chép", "Đã sao chép".

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → "Nhân sự & phân quyền" → "Thêm nhân viên" (vai trò Sale) → chép mật khẩu tạm.
2. Cửa sổ ẩn danh: đăng nhập bằng mật khẩu tạm → bị yêu cầu đổi mật khẩu.
3. Quay lại Manager: gán thêm vai trò "Nhân viên kỹ thuật" → nhân viên thấy thêm "Việc của tôi" sau khi tải lại trang.
4. Khoá tài khoản đó → cửa sổ ẩn danh bị đăng xuất ở lần thao tác kế tiếp.
5. Thử bỏ vai trò Quản lý chung của chính mình khi chỉ có một Manager → bị chặn với thông báo rõ ràng.

## 8. Giả định
Theo Q31–Q38 ✅ (OPEN_QUESTIONS).
