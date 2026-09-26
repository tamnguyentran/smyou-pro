# M1-01a — Xác thực (backend): đăng nhập, phiên, đổi mật khẩu, tạo Manager

- **Status:** Approved
- **Approval:** chủ dự án duyệt nội dung + Q19–Q24 theo đề xuất (2026-09-26)
- **Backlog:** M1-01a · **Milestone:** M1
- **Liên quan:** PRD §4, §6 (Bảo mật); DOMAIN_MODEL §1 (Employee); `spec/permissions.yaml` (`public_routes`, `profile.manage`); ARCHITECTURE §2 (pwdlib argon2, PyJWT, cookie httpOnly, access 15', refresh 7 ngày, rotate); ADR-014 (cookie `Path` theo `BASE_PATH`)

## 1. Mục tiêu
Là nhân viên SMYou, tôi đăng nhập bằng email + mật khẩu trên điện thoại hoặc máy tính, ở lại đăng nhập trong ngày làm việc mà không phải nhập lại, và phải đổi mật khẩu do quản lý cấp ngay lần đầu, để tài khoản chỉ mình tôi biết mật khẩu.

## 2. Phạm vi
- Trong:
  - Bảng `employees`, `employee_roles` (đủ trường DOMAIN_MODEL §1) + `auth_sessions` (refresh token dạng băm, xoay vòng).
  - `POST /api/v1/auth/login`, `/refresh`, `/logout` (public), `POST /api/v1/auth/change-password` (`profile.manage`, scope self).
  - `require()` thật: xác thực cookie access (401), chặn khi `must_change_password` (403), kiểm capability theo vai trò (403). *Scope và `/me` để M1-02.*
  - Lệnh CLI tạo Manager đầu tiên: `python -m app.cli create-manager`.
- Ngoài: quản lý nhân viên / reset mật khẩu bởi Manager (M1-04), `/me` + menu + scope (M1-02, M1-03), ghi `audit_events` (M1-05 — xem Q23), quên mật khẩu qua email (không có email — PRD §5).

Giao diện (trang Đăng nhập, Đổi mật khẩu, tự làm mới phiên) và E2E: `M1-01b-auth-ui.md` (Q24).

## 3. Acceptance Criteria
Dữ liệu mẫu: Manager **Nguyễn Văn An**, `an.nguyen@smyou.vn`, mã `NV001`, mật khẩu `SmYou@2026`; KTV **Trần Minh Khoa**, `khoa.tran@smyou.vn`, `NV014`, `must_change_password=true`, mật khẩu tạm `TamThoi#14`.

### Backend — đăng nhập
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-001 | An đang hoạt động, `failed_login_count=2` | `POST /auth/login {email:"an.nguyen@smyou.vn", password:"SmYou@2026"}` | 200; body `{employee:{id, code:"NV001", full_name:"Nguyễn Văn An", roles:["MANAGER"]}, must_change_password:false}` — **không** có `password_hash`; 2 cookie `HttpOnly`, `SameSite=Lax`: access (`Path=<BASE_PATH>/`, sống 15') và refresh (`Path=<BASE_PATH>/api/v1/auth`, sống 7 ngày); `Secure` khi `COOKIE_SECURE=true`; `failed_login_count=0` | integration |
| AC-AUTH-002 | An đang hoạt động | login với mật khẩu sai | 401 `code="INVALID_CREDENTIALS"`, `detail="Email hoặc mật khẩu không đúng."`; `failed_login_count` +1; không có cookie | integration |
| AC-AUTH-003 | Không có tài khoản `ai.do@smyou.vn` | login | 401 với body giống hệt AC-AUTH-002 (không lộ email có tồn tại hay không); server vẫn chạy phép so khớp argon2 với hash giả (thời gian phản hồi không khác biệt) | integration |
| AC-AUTH-004 | An có `failed_login_count=4` | login sai lần thứ 5 | 401 như AC-AUTH-002 và `locked_until = now + 15'`; sau đó login **đúng** mật khẩu trong 15' → 423 `code="ACCOUNT_LOCKED"`, `detail="Tài khoản tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau 15 phút."` (Q19); sau khi hết 15' (đồng hồ giả) login đúng → 200 và bộ đếm về 0 | integration |
| AC-AUTH-005 | Tài khoản Khoa `is_active=false` | login **đúng** mật khẩu | 403 `code="ACCOUNT_DISABLED"`, `detail="Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản lý."` (Q20); login **sai** mật khẩu → 401 như AC-AUTH-002 | integration |
| AC-AUTH-006 | An | login với `"  An.Nguyen@SMYOU.vn "` | 200 (email không phân biệt hoa thường, bỏ khoảng trắng đầu/cuối) | integration |
| AC-AUTH-007 | — | login thiếu `email`/`password`, email sai định dạng, mật khẩu > 128 ký tự | 422 `VALIDATION_ERROR` với `errors[].field` đúng tên trường; không tăng bộ đếm | integration |

### Backend — phiên
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-008 | An đã đăng nhập (cookie refresh R1) | `POST /auth/refresh` | 200; cookie access mới + refresh mới R2; R1 bị thu hồi | integration |
| AC-AUTH-009 | R1 đã bị xoay thành R2 | gửi lại R1 | 401 `code="SESSION_REVOKED"`; **toàn bộ** chuỗi phiên đó (R2) cũng bị thu hồi (phát hiện token bị đánh cắp); cookie bị xoá | integration |
| AC-AUTH-010 | Refresh hết hạn (> 7 ngày) hoặc không có cookie | `POST /auth/refresh` | 401 `UNAUTHENTICATED`; cookie bị xoá | integration |
| AC-AUTH-011 | Sau khi phát refresh, tài khoản bị vô hiệu hoá **hoặc** mật khẩu đã đổi | `POST /auth/refresh` | 401 `UNAUTHENTICATED` | integration |
| AC-AUTH-012 | An đã đăng nhập | `POST /auth/logout` | 204; refresh bị thu hồi; hai cookie bị xoá (`Max-Age=0`, đúng `Path`); refresh sau đó → 401. Logout khi không có cookie → 204 | integration |
| AC-AUTH-013 | Route có `require("order.read")` | gọi với: cookie access hợp lệ của An / hết hạn / bị sửa chữ ký / của người đã bị vô hiệu hoá / không có cookie | lần lượt: qua xác thực / 401 / 401 / 401 / 401 (`UNAUTHENTICATED`, "Vui lòng đăng nhập.") | integration |
| AC-AUTH-014 | Khoa (TECHNICIAN) đăng nhập | gọi route `require("catalog.manage")` (Khoa không có quyền) | 403 `FORBIDDEN` | integration |

### Backend — đổi mật khẩu & tạo Manager
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-015 | Khoa đăng nhập, `must_change_password=true` | gọi bất kỳ route có `require(...)` khác `change-password` | 403 `code="PASSWORD_CHANGE_REQUIRED"`, `detail="Bạn cần đổi mật khẩu trước khi tiếp tục."` | integration |
| AC-AUTH-016 | Khoa như trên, có thêm 1 phiên khác trên máy tính | `POST /auth/change-password {current_password:"TamThoi#14", new_password:"Khoa@SmYou9"}` | 204; `must_change_password=false`; mọi phiên khác của Khoa bị thu hồi; phiên hiện tại nhận cookie mới; login bằng mật khẩu cũ → 401 | integration |
| AC-AUTH-017 | Khoa | đổi mật khẩu với: mật khẩu hiện tại sai / mới < 8 ký tự / mới trùng mật khẩu hiện tại / mới chứa phần trước `@` của email (`khoa.tran`) | 422, lần lượt `errors[].field`: `current_password` ("Mật khẩu hiện tại không đúng."), `new_password` ("Mật khẩu cần ít nhất 8 ký tự." / "Mật khẩu mới phải khác mật khẩu hiện tại." / "Mật khẩu không được chứa tên email.") (Q21) | integration |
| AC-AUTH-018 | DB chưa có nhân viên | `python -m app.cli create-manager --email an.nguyen@smyou.vn --full-name "Nguyễn Văn An" --code NV001`, nhập mật khẩu 2 lần (không hiện trên màn hình) | tạo nhân viên vai trò MANAGER, `must_change_password=false` (Q22), thoát 0; chạy lại cùng email → thoát 1 "Email đã tồn tại"; hai lần nhập không khớp hoặc mật khẩu vi phạm Q21 → thoát 1, không tạo gì | integration |
| AC-AUTH-019 | Mọi luồng trên | kiểm tra DB và log | `password_hash` là argon2id; mật khẩu, token, cookie không xuất hiện trong log hay response lỗi; refresh token chỉ lưu dạng băm SHA-256 | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/auth/login | public | `{email, password}` | `LoginResponse` + Set-Cookie | 401, 403, 422, 423 |
| POST | /api/v1/auth/refresh | public (cookie) | — | `LoginResponse` + Set-Cookie | 401 |
| POST | /api/v1/auth/logout | public (cookie) | — | 204 | — |
| POST | /api/v1/auth/change-password | profile.manage (self) | `{current_password, new_password}` | 204 + Set-Cookie | 401, 422 |

## 5. Dữ liệu / Migration
- `employees` (DOMAIN_MODEL §1) + `password_changed_at timestamptz`, `version`; `email citext unique` (bật extension `citext`); CHECK `phone ~ '^0\d{9}$'`.
- `employee_roles(employee_id, role)` PK kép, CHECK role ∈ 4 giá trị.
- `auth_sessions(id, employee_id FK, family_id, token_hash char(64) unique, expires_at, revoked_at, replaced_by_id, created_at, user_agent varchar(200))`, index `employee_id`, `family_id`.
- Access token: JWT HS256 (`JWT_SECRET`), claim `sub`, `sid` (family), `pwd` (dấu thời gian đổi mật khẩu), `exp` 15'.

## 6. UI
Không có (M1-01b).

## 7. Kịch bản UAT thủ công
1. Chạy `make up`, tạo Manager bằng `docker compose -f compose.dev.yml exec backend python -m app.cli create-manager ...`.
2. `curl -i -X POST localhost:8010/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"...","password":"sai"}'` 5 lần → lần 6 nhập đúng vẫn nhận 423 "tạm khoá".
3. Giao diện: xem M1-01b.

## 8. Giả định & quyết định (Q19–Q24 ✅ theo đề xuất, 2026-09-26)
- **Q19** Khi bị khoá tạm, có báo rõ "tạm khoá 15 phút" không? *Đề xuất: có* (chỉ biết sau khi đã sai 5 lần; giúp nhân viên hiểu chuyện gì xảy ra).
- **Q20** Tài khoản bị vô hiệu hoá: báo "đã bị vô hiệu hoá, liên hệ quản lý" khi nhập **đúng** mật khẩu? *Đề xuất: có*; nhập sai vẫn chỉ báo "Email hoặc mật khẩu không đúng".
- **Q21** Quy tắc mật khẩu: *đề xuất* ≥ 8 ký tự, ≤ 128, khác mật khẩu hiện tại, không chứa phần tên của email. Không bắt buộc chữ hoa/ký tự đặc biệt (khó nhớ trên điện thoại, dễ ghi ra giấy).
- **Q22** Manager đầu tiên tạo bằng CLI có phải đổi mật khẩu lần đầu? *Đề xuất: không* (người chạy lệnh tự đặt mật khẩu).
- **Q23** Sự kiện đăng nhập/sai mật khẩu/khoá có ghi vào Nhật ký hệ thống? *Đề xuất:* ghi log ứng dụng ngay (không kèm mật khẩu); ghi `audit_events` từ M1-05 khi có framework audit.
- **Q24** Tách M1-01 thành M1-01a (backend) và M1-01b (giao diện + E2E)? *Đề xuất: có* — phần xác thực là code bảo mật chủ dự án nên đọc (QUALITY_GATES §5), tách nhỏ dễ duyệt hơn.
- Giả định kỹ thuật (không cần quyết định): chống CSRF dựa vào cookie `SameSite=Lax` + API chỉ nhận JSON; thời lượng access 15' / refresh 7 ngày theo ARCHITECTURE §2; cookie `Path` theo `BASE_PATH`.
