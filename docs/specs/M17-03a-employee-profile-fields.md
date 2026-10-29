# M17-03a — Hồ sơ nhân viên: thêm thông tin cá nhân

- **Status:** Approved (2026-10-29, chủ dự án duyệt; Q105–Q107 theo mặc định, Q108 chốt mật khẩu tạm = ngày sinh)
- **Backlog:** M17-03a · **Milestone:** M17 · **Phụ thuộc:** M17-02b
- **Liên quan:** `backend/app/modules/identity/models.py` (`Employee`), `backend/app/modules/employees/` (schemas, service), `frontend/src/features/employees/` (`EmployeeFormSheet`); DOMAIN_MODEL §Employee; ảnh mẫu `Tài liệu tham khảo/image.png`

## 1. Mục tiêu
Là Manager, khi tạo/sửa nhân viên tôi muốn ghi đủ thông tin cá nhân như mẫu hồ sơ công ty đang dùng (ngày sinh, nơi sinh, giới tính, địa chỉ, CMND/CCCD, ngày cấp, nơi cấp, tình trạng hôn nhân).

## 2. Phạm vi
- Trong phạm vi:
  - Thêm 8 cột **tuỳ chọn** (nullable) vào `employees`: `birth_date date`, `birth_place varchar(120)`, `gender` (`MALE`/`FEMALE`/`OTHER`), `address varchar(255)`, `id_number varchar(12)`, `id_issued_date date`, `id_issued_place varchar(120)`, `marital_status` (`SINGLE`/`MARRIED`/`DIVORCED`/`WIDOWED`).
  - **Email trở thành tuỳ chọn** (vẫn duy nhất nếu có) — Q105.
  - API tạo/sửa/xem nhân viên nhận và trả các trường trên. Quyền xem giữ như hiện tại (`employee.read` xem được hết — chủ dự án chốt 2026-10-29).
  - Audit sửa nhân viên ghi `changed_fields` gồm các trường mới.
  - UI form theo thứ tự ảnh mẫu: Mã NV, Tên NV, Ngày sinh, Nơi sinh, Giới tính, Điện thoại, Địa chỉ, Email, CMND/CCCD, Ngày cấp, Nơi cấp, Tình trạng hôn nhân, Phòng ban; rồi Chức danh, Vai trò như hiện có.
- Ngoài phạm vi: tên đăng nhập (M17-03b); upload ảnh CMND; lọc/tìm theo các trường mới.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-064 | An (MANAGER) | `POST /api/v1/employees` với đủ 8 trường mới (Yến, sinh 1985-07-30, "An Giang", `FEMALE`, CCCD `089185000565`, cấp 2018-10-08, `MARRIED`…) | 201; `GET` trả lại đúng từng giá trị | integration |
| AC-EMP-065 | An | tạo nhân viên **không** gửi trường mới nào và không gửi `email` | 201; các trường trả `null` | integration |
| AC-EMP-066 | An | gửi `id_number="12AB"` / `"1234567890"` (10 số); `birth_date` hoặc `id_issued_date` ở tương lai; `gender="X"` | 422 tại đúng trường | integration |
| AC-EMP-067 | Đã có nhân viên dùng email `kimyen@gmail.com` | tạo nhân viên khác cùng email | 409 `EMAIL_TAKEN` như hiện nay | integration |
| AC-EMP-068 | Bình chưa có địa chỉ | An `PATCH` Bình `address`, `marital_status` | 200; audit EMPLOYEE `update` `changed_fields == ["address","marital_status"]` | integration |
| AC-EMP-069 | Hoa (TECH_LEAD, chỉ `employee.read`) | xem chi tiết Yến | Thấy đủ các trường mới (ngày hiển thị `dd/MM/yyyy`, giới tính "Nữ", hôn nhân "Đã kết hôn") | component |
| AC-EMP-070 | An mở "Thêm nhân viên" | xem form | Các ô theo đúng thứ tự §2; "Giới tính", "Tình trạng hôn nhân" là `<select>` nhãn tiếng Việt; Email không còn bắt buộc | component |
| AC-EMP-071 | An ở 390px và 1440px | tạo nhân viên nhập đủ thông tin cá nhân end-to-end | Lưu thành công; mở lại thấy đúng dữ liệu; không tràn ngang | e2e |
| AC-EMP-072 | Yến đã có đủ thông tin cá nhân | Yến gọi `GET /api/v1/me` | `employee` trả thêm phone + 8 trường mới đúng giá trị | integration |
| AC-EMP-073 | Yến đăng nhập | mở trang "Cá nhân" | Thấy SĐT + 8 trường mới (ngày `dd/MM/yyyy`, nhãn tiếng Việt), trống → "—"; chỉ xem, không sửa | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/employees | employee.manage | thêm 8 trường tuỳ chọn; `email` thành tuỳ chọn |
| PATCH | /api/v1/employees/{id} | employee.manage | thêm 8 trường (gửi `null` để xoá); `email` cũng sửa/xoá được (`null`/rỗng → xoá — chủ dự án chốt 2026-10-29) |
| GET | /api/v1/employees, /employees/{id} | employee.read | trả thêm 8 trường; `email` có thể `null` |
| GET | /api/v1/me | (đăng nhập) | `employee` trả thêm `phone` + 8 trường (hồ sơ của chính mình) |

Validate: `id_number` chỉ chữ số, 9 hoặc 12 ký tự; ngày không ở tương lai (theo `Asia/Ho_Chi_Minh`); chuỗi trim, rỗng → `null`. Chạy `make contract`.

## 5. Dữ liệu / Migration
- Migration mới thêm 8 cột nullable + CHECK cho `gender`, `marital_status`, `id_number ~ '^([0-9]{9}|[0-9]{12})$'`; `email` bỏ `NOT NULL` (giữ unique — Postgres cho phép nhiều `NULL`). Downgrade: drop cột; `email NOT NULL` chỉ khi không còn dòng `NULL` (nếu còn → điền `<code>@no-email.local`).
- DOMAIN_MODEL §Employee, GLOSSARY (Giới tính, CMND/CCCD, Tình trạng hôn nhân).

## 6. UI
- `EmployeeFormSheet`: thêm các ô theo thứ tự §2; ngày dùng `<input type="date">`; mobile 1 cột, tablet (`md`) và desktop 2 cột — Địa chỉ cũng chiếm 1/2 cột (chủ dự án chốt 2026-10-29). CMND/CCCD dùng bàn phím thường (không `inputMode`). Mọi ô ≥ 44px.
- Trang "Cá nhân" hiển thị (chỉ xem) SĐT + 8 trường mới; trống → "—".
- Chế độ xem chi tiết hiển thị các trường mới; trống → "—".
- Mọi chỗ hiển thị email nhân viên chấp nhận `null`.

## 7. Kịch bản UAT thủ công
1. Thêm nhân viên "Nguyễn Lê Kim Yến" theo đúng ảnh mẫu → lưu, mở lại kiểm tra từng ô.
2. Thêm nhân viên chỉ nhập tên, SĐT, phòng ban, vai trò → lưu được.
3. Nhập CMND 10 số → báo lỗi tiếng Việt tại ô CMND.

## 8. Giả định & câu hỏi
- Q105: Email thành tuỳ chọn (mặc định); nhân viên không có email không dùng được "Quên mật khẩu" → nhờ Manager đặt lại.
- Q107: Giá trị Giới tính: Nam/Nữ/Khác; Tình trạng hôn nhân: Độc thân/Đã kết hôn/Ly hôn/Goá (mặc định).
- Giả định: CMND/CCCD không bắt buộc duy nhất.
- Không cần sửa `spec/*.yaml`.
