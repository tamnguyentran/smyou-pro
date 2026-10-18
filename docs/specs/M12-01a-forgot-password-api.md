# M12-01a — Quên mật khẩu (backend): gửi link đặt lại qua email, đặt mật khẩu mới

- **Status:** Done
- **Backlog:** M12-01a · **Milestone:** M12
- **Liên quan:** PRD §5 (ngoại lệ Q86 — SMTP chỉ cho luồng này); `docs/specs/M1-01a-auth-api.md` (quy tắc mật khẩu Q21, mẫu dữ liệu An/Khoa); ADR-015 (SMTP Gmail); `spec/permissions.yaml` (`public_routes` — xem §8 diff đề xuất); OPEN_QUESTIONS_ARCHIVE Q86–Q88

## 1. Mục tiêu
Là nhân viên quên mật khẩu, tôi bấm "Quên mật khẩu", nhập email, nhận link qua email để tự đặt mật khẩu mới trong 30 phút, để không phải chờ Quản lý reset tay.

## 2. Phạm vi
- Trong:
  - Bảng `password_reset_tokens` (token 1 lần, hiệu lực 30', theo nhân viên) + `password_reset_requests` (đếm số lần yêu cầu/giờ theo email, áp dụng **cả email không tồn tại** để không lộ thông tin tài khoản).
  - `POST /api/v1/auth/forgot-password` (public) — luôn trả response giống nhau bất kể email có tồn tại/active hay không (chỉ khác khi vượt rate limit).
  - `POST /api/v1/auth/reset-password` (public) — đổi mật khẩu bằng token, áp lại đúng quy tắc mật khẩu Q21 (M1-01a), thu hồi mọi phiên đang đăng nhập của nhân viên đó.
  - Gửi email qua SMTP (Gmail) — cấu hình 100% qua biến môi trường (ADR-015), không hard-code; lỗi SMTP không lộ chi tiết cho người gọi API.
- Ngoài:
  - Giao diện (trang "Quên mật khẩu", "Đặt lại mật khẩu") + E2E: `M12-01b`.
  - Đổi mật khẩu khi đã đăng nhập (đã có, `change-password` — M1-01a).
  - Zalo/SMS hay bất kỳ loại email khác ngoài luồng này (vẫn ngoài phạm vi theo PRD §5).
  - Hàng đợi/retry gửi email bất đồng bộ (tải thấp, gửi đồng bộ trong request — ADR-015).

## 3. Acceptance Criteria
Dữ liệu mẫu (tiếp tục dùng nhân vật của M1-01a): Manager **Nguyễn Văn An**, `an.nguyen@smyou.vn`, mật khẩu hiện tại `SmYou@2026`; KTV **Trần Minh Khoa**, `khoa.tran@smyou.vn`, `is_active=false`.

### Backend — yêu cầu gửi link (`forgot-password`)
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-040 | An đang hoạt động, chưa có token nào còn hiệu lực | `POST /auth/forgot-password {email:"an.nguyen@smyou.vn"}` | 200; body `{"detail":"Nếu email tồn tại và tài khoản đang hoạt động, chúng tôi đã gửi email hướng dẫn đặt lại mật khẩu."}`; 1 dòng `password_reset_tokens` mới (hash SHA-256, `expires_at = now+30'`, `used_at = null`); 1 email gửi tới `an.nguyen@smyou.vn` chứa link `{PUBLIC_URL}/reset-password?token=<raw_token>`, chữ tiếng Việt | integration (SMTP giả lập bằng fixture bắt message, không gửi thật) |
| AC-AUTH-041 | Không có tài khoản `ai.do@smyou.vn` | `POST /auth/forgot-password {email:"ai.do@smyou.vn"}` | 200, **body giống byte-for-byte** AC-AUTH-040 (không lộ email có tồn tại); không tạo `password_reset_tokens`; không gửi email | integration |
| AC-AUTH-042 | Khoa tồn tại nhưng `is_active=false` | `POST /auth/forgot-password {email:"khoa.tran@smyou.vn"}` | 200, body giống AC-AUTH-040; không tạo token; không gửi email | integration |
| AC-AUTH-043 | Đã gọi `forgot-password` 3 lần hợp lệ trong vòng 1 giờ cho cùng 1 email (áp dụng y hệt cho `an.nguyen@smyou.vn` **và** cho email không tồn tại) | gọi lần thứ 4 trong cùng khung giờ | 429 `code="TOO_MANY_REQUESTS"`, `detail="Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau."`; không tạo token mới, không gửi email; sau 1 giờ (đồng hồ giả) gọi lại → 200 như AC-AUTH-040 | integration |
| AC-AUTH-044 | — | gọi thiếu `email` / email sai định dạng | 422 `VALIDATION_ERROR`, `errors[].field="email"` | integration |
| AC-AUTH-045 | An gọi `forgot-password` lần 1 → có token T1 còn hiệu lực | gọi `forgot-password` lần 2 (vẫn trong hạn mức §AC-043) | 200 như AC-AUTH-040; T1 bị vô hiệu hoá ngay (không dùng được nữa ở `reset-password`); chỉ token mới nhất (T2) dùng được | integration |

### Backend — đặt mật khẩu mới (`reset-password`)
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-046 | Token hợp lệ T của An (từ AC-040), An có 1 phiên đang đăng nhập trên máy khác | `POST /auth/reset-password {token:T, new_password:"SmYouMoi@9"}` | 204; `password_hash` đổi, `must_change_password=false`, `password_changed_at=now`; **mọi** `auth_sessions` của An bị thu hồi (kể cả phiên máy khác); T có `used_at=now`; login bằng mật khẩu cũ → 401; login bằng mật khẩu mới → 200 | integration |
| AC-AUTH-047 | Token T đã dùng ở AC-046 | gọi lại `reset-password` với T | 422 `code="INVALID_RESET_TOKEN"`, `detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."` | integration |
| AC-AUTH-048 | Token hợp lệ nhưng đã quá 30 phút (đồng hồ giả) | `reset-password` | 422 `INVALID_RESET_TOKEN` như trên | integration |
| AC-AUTH-049 | Token ngẫu nhiên không tồn tại trong DB | `reset-password` | 422 `INVALID_RESET_TOKEN` như trên | integration |
| AC-AUTH-050 | Token hợp lệ của An | `new_password` lần lượt: `"123"` (< 8 ký tự) / `"SmYou@2026"` (trùng mật khẩu hiện tại) / `"an.nguyenABC1"` (chứa phần trước `@` của email) | 422 `VALIDATION_ERROR`, `errors[].field="new_password"`, thông báo giống AC-AUTH-017 (M1-01a); **token không bị tiêu hao** — vẫn dùng được cho lần thử tiếp theo trong hạn 30' | integration |
| AC-AUTH-051 | Token hợp lệ của Khoa, nhưng Khoa đã bị `is_active=false` sau khi token được tạo | `reset-password` | 422 `INVALID_RESET_TOKEN` (không đổi được mật khẩu của tài khoản đã khoá) | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/auth/forgot-password | public | `{email}` | `{detail}` (luôn giống nhau) | 422, 429 |
| POST | /api/v1/auth/reset-password | public | `{token, new_password}` | 204 + Set-Cookie xoá (ép đăng nhập lại) | 422 |

Mã lỗi mới (ngoài bộ chuẩn ARCHITECTURE §4): `TOO_MANY_REQUESTS` 429, `INVALID_RESET_TOKEN` 422.

## 5. Dữ liệu / Migration
- `password_reset_tokens(id uuid pk, employee_id uuid fk→employees on delete cascade, token_hash char(64) unique not null, expires_at timestamptz not null, used_at timestamptz, created_at timestamptz default now())`; index `employee_id`, `token_hash`.
- `password_reset_requests(id uuid pk, email citext not null, requested_at timestamptz default now())`; index `(email, requested_at)` — đếm số dòng trong 1 giờ gần nhất theo `email` (lowercase, trim) cho **mọi** lần gọi `forgot-password` (kể cả email không tồn tại), dùng để tính rate-limit; không FK tới `employees` (phải ghi được cả khi email không tồn tại).
- Token thật (`secrets.token_urlsafe(32)`) chỉ trả trong email; DB chỉ lưu SHA-256 của token (cùng mẫu với `auth_sessions.token_hash`, ARCHITECTURE §5).
- Biến môi trường mới (`.env.dev`, `.env.prod`): `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASSWORD` (Gmail App Password — không dùng mật khẩu Gmail thật), `SMTP_FROM`, `SMTP_USE_TLS` (true). `.env.dev.example` cần thêm `PUBLIC_URL` (hiện chỉ có ở `.env.prod.example`) để dựng link reset khi test dev, mặc định `http://localhost:5183`.

## 6. UI
Không có (M12-01b).

## 7. Kịch bản UAT thủ công
1. Cấu hình `SMTP_*` trong `.env.dev` với 1 tài khoản Gmail test (App Password) → `make up`.
2. `curl -X POST localhost:8010/api/v1/auth/forgot-password -d '{"email":"<email NV thật>"}'` → kiểm tra hộp mail nhận được link trong vài giây.
3. Mở link, gọi `reset-password` với mật khẩu mới qua API/giao diện tạm (UI thật ở M12-01b) → login lại bằng mật khẩu mới thành công, phiên cũ (nếu có) bị đăng xuất.
4. Gọi `forgot-password` 4 lần liên tiếp cùng email trong 1 giờ → lần 4 nhận 429.

## 8. Giả định & câu hỏi
- Q86–Q88 (✅ đã chốt, xem `OPEN_QUESTIONS_ARCHIVE.md`): đổi phạm vi PRD cho SMTP; token 30'/dùng 1 lần, 3 lần/giờ/email; áp dụng mọi nhân viên active, không cần email_verified riêng.
- Giả định: không ghi `audit_events` cho yêu cầu quên mật khẩu/đặt lại (giữ đúng mẫu hiện có của `login`/`logout` — M1-01a không audit các sự kiện xác thực, chỉ log ứng dụng theo Q23); nếu chủ dự án muốn audit riêng luồng này, cần Q mới.
- Giả định: gửi email đồng bộ trong request `forgot-password`; nếu SMTP lỗi/timeout, log server-side và **vẫn trả 200 generic** (không lộ lỗi hạ tầng cho người gọi, không lộ thông tin tồn tại tài khoản) — cần chủ dự án xác nhận có cần cơ chế biết "có gửi thành công hay không" (vd trang admin xem log) hay không (câu hỏi mới, chưa có Q).
- **Đề xuất sửa `spec/permissions.yaml`** (không tự sửa — chờ duyệt):
  ```diff
   public_routes:
     - GET /api/v1/health
     - POST /api/v1/auth/login
     - POST /api/v1/auth/refresh
     - POST /api/v1/auth/logout
  +  - POST /api/v1/auth/forgot-password
  +  - POST /api/v1/auth/reset-password
  ```
