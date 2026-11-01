# M20-09 — Mật khẩu tạm hết hạn sau 24 giờ (cấp lại mật khẩu)

- **Status:** Approved (2026-11-01; Q142–Q145 theo mặc định)
- **Backlog:** M20-09 · **Milestone:** M20
- **Liên quan:** spec/permissions.yaml#employee.manage (không đổi), DOMAIN_MODEL §Employee (`must_change_password`), M1-01a (AC-AUTH-015/016), M1-04a/b (AC-EMP-014/016), M17-03b (Q108 — mật khẩu tạm = ngày sinh)

## 1. Mục tiêu
Là Quản lý (Manager), khi cấp lại mật khẩu cho nhân viên tôi thấy ngay mật khẩu tạm để sao chép gửi cho họ, kèm giờ hết hạn; nhân viên phải đổi mật khẩu ở lần đăng nhập đầu, và nếu để quá 24 giờ thì mật khẩu tạm không dùng được nữa — giảm rủi ro mật khẩu tạm (thường là ngày sinh) bị người khác dùng.

**Đã có sẵn (không làm lại, chỉ giữ không hỏng):** nút "Cấp lại mật khẩu" (chỉ Manager, `POST /employees/{id}/reset-password`), hộp thoại "Mật khẩu tạm" có nút "Sao chép" (AC-EMP-016), bắt đổi mật khẩu lần đầu qua `must_change_password` (AC-AUTH-015/016). Phần **mới** của item này là thời hạn 24 giờ.

## 2. Phạm vi
- Trong phạm vi:
  - Cột mới `employees.temp_password_expires_at` (nullable). Đặt = thời điểm cấp + 24 giờ khi **tạo nhân viên** và khi **Manager cấp lại mật khẩu** (Q142). Xoá về `NULL` khi nhân viên tự đổi mật khẩu hoặc đặt lại qua liên kết email.
  - Đăng nhập đúng mật khẩu tạm nhưng đã quá hạn → từ chối, mã `TEMP_PASSWORD_EXPIRED`.
  - Response cấp lại/tạo có `temporary_password_expires_at`; hộp thoại "Mật khẩu tạm" hiện giờ hết hạn.
  - `EmployeeOut` có `temp_password_expires_at`; sheet nhân viên (Manager) hiện trạng thái mật khẩu tạm (còn hạn / đã hết hạn).
  - Cấu hình `TEMP_PASSWORD_TTL_HOURS` (mặc định 24).
- Ngoài phạm vi: đổi cách sinh mật khẩu tạm (vẫn là ngày sinh `ddmmyyyy` khi có, Q108); cho Manager tự đặt mật khẩu; gửi mật khẩu qua email/SMS; job dọn dẹp định kỳ; cột/bộ lọc "mật khẩu tạm hết hạn" trên danh sách nhân viên.

## 3. Acceptance Criteria
Mốc thời gian dùng trong test: `now` được cố định (clock giả). Nhân viên mẫu: **Trần Văn Khoa** (NV014, `khoa.tran`, KTV, ngày sinh 14/03/1995). Manager: **Nguyễn Văn An** (NV001).

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-EMP-119 | An (Manager) đăng nhập; Khoa `version=3`; now = 2026-11-02 08:00 (giờ VN) | `POST /employees/{Khoa}/reset-password {version:3}` | 200; body `{employee:{…, must_change_password:true, temp_password_expires_at:"2026-11-03T01:00:00Z"}, temporary_password:"14031995", temporary_password_expires_at:"2026-11-03T01:00:00Z"}`; header `Cache-Control: no-store`; DB `temp_password_expires_at` = now + 24h; 1 audit `reset-password` (không chứa mật khẩu) | integration |
| AC-EMP-120 | An tạo nhân viên mới "Lê Thị Hoa" (không ngày sinh) lúc 2026-11-02 08:00 | `POST /employees` | 201; `temporary_password` 10 ký tự ngẫu nhiên; `temporary_password_expires_at` = now + 24h; `employee.must_change_password=true` | integration |
| AC-AUTH-079 | Khoa vừa được cấp lại lúc 2026-11-02 08:00 (hạn 2026-11-03 08:00) | 2026-11-03 07:59 `POST /auth/login {username:"khoa.tran", password:"14031995"}` | 200; `must_change_password:true`; cookie phiên được cấp (vẫn chỉ vào được trang đổi mật khẩu — AC-AUTH-015) | integration |
| AC-AUTH-080 | Như trên | 2026-11-03 08:00 (đúng hạn) hoặc muộn hơn, login đúng mật khẩu tạm | 401 `code="TEMP_PASSWORD_EXPIRED"`, `detail="Mật khẩu tạm đã hết hạn. Vui lòng liên hệ Quản lý để được cấp lại."`; không cấp cookie; `failed_login_count` **không** tăng; 1 audit `login_refused` `data.reason="temp_password_expired"` | integration |
| AC-AUTH-081 | Như AC-AUTH-080 (đã hết hạn) | login **sai** mật khẩu | 401 `INVALID_CREDENTIALS` như cũ (không lộ việc mật khẩu tạm hết hạn); `failed_login_count` +1 | integration |
| AC-AUTH-082 | Khoa đăng nhập lúc 07:59 (còn hạn), giữ phiên | 2026-11-03 09:00 `POST /auth/change-password {current_password:"14031995", new_password:"Khoa@SmYou9"}` | 204 (hạn chỉ kiểm lúc đăng nhập — Q143); `must_change_password=false`, `temp_password_expires_at=NULL`; sau đó login bằng `Khoa@SmYou9` lúc nào cũng 200 | integration |
| AC-AUTH-083 | Khoa có `temp_password_expires_at` đã quá hạn | Khoa đặt lại mật khẩu qua liên kết email (`POST /auth/reset-password`, M12-01a) | 204; `must_change_password=false`, `temp_password_expires_at=NULL`; login mật khẩu mới → 200 | integration |
| AC-AUTH-084 | Hoa: tài khoản tạo **trước** migration, `must_change_password=true`, `temp_password_expires_at=NULL` | login đúng mật khẩu tạm, bất kỳ lúc nào | 200 — không hết hạn (Q144) | integration |
| AC-AUTH-085 | Khoa đã hết hạn (AC-AUTH-080) | An cấp lại lần nữa lúc 2026-11-04 10:00, rồi Khoa login mật khẩu tạm mới lúc 10:05 | 200; hạn mới = 2026-11-05 10:00 | integration |
| AC-EMP-121 | Sale/CSKH/QLKT/KTV đăng nhập | `POST /employees/{Khoa}/reset-password` | 403 như cũ (không đổi quyền; hồi quy AC-EMP-0xx của M1-04a) | integration (hồi quy) |
| AC-EMP-122 | An giữ `version=3` của Khoa, người khác vừa sửa Khoa (`version=4`) | `POST /employees/{Khoa}/reset-password {version:3}` | 409 `STALE_VERSION`; mật khẩu, `temp_password_expires_at` không đổi | integration (hồi quy) |
| AC-EMP-123 | An mở sheet Khoa, bấm "Cấp lại mật khẩu" → xác nhận | API 200 (now 2026-11-02 08:00 VN) | Hộp thoại "Mật khẩu tạm" hiện "Tên đăng nhập: khoa.tran", mật khẩu `14031995`, nút "Sao chép" (→ "Đã sao chép"), và dòng **"Hết hạn lúc 08:00 03/11/2026. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu."**; giữ lời nhắc "Mật khẩu chỉ hiện một lần…". Cùng hiển thị sau khi tạo nhân viên | component + e2e |
| AC-EMP-124 | An mở sheet nhân viên có `must_change_password=true` | — | Khối tài khoản hiện: còn hạn → "Mật khẩu tạm — hết hạn lúc HH:mm dd/MM/yyyy"; đã quá hạn (so với giờ client) → nhãn cảnh báo "Mật khẩu tạm đã hết hạn — bấm Cấp lại mật khẩu"; `must_change_password=false` hoặc hạn `null` → không hiện gì thêm | component |
| AC-AUTH-086 | Trang Đăng nhập, API trả 401 `TEMP_PASSWORD_EXPIRED` | Khoa bấm "Đăng nhập" | Hiện lỗi dưới form: "Mật khẩu tạm đã hết hạn. Vui lòng liên hệ Quản lý để được cấp lại." (không dùng thông báo "Tên đăng nhập hoặc mật khẩu không đúng."); mobile 390px và desktop như lỗi đăng nhập hiện có | component + e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/employees/{id}/reset-password | employee.manage (không đổi) | `{ version }` | `EmployeeWithPassword` + **`temporary_password_expires_at: datetime`** | 403, 404, 409 |
| POST | /api/v1/employees | employee.manage (không đổi) | như cũ | `EmployeeWithPassword` + `temporary_password_expires_at` | như cũ |
| POST | /api/v1/auth/login | public | như cũ | như cũ | thêm **401 `TEMP_PASSWORD_EXPIRED`** |
| GET | /api/v1/employees, /employees/{id} | như cũ | — | `EmployeeOut` + **`temp_password_expires_at: datetime \| null`** | — |

Sau khi sửa schema chạy `make contract` (sinh lại TS types). Không đổi `spec/permissions.yaml`, không đổi `state_machines.yaml`.

## 5. Dữ liệu / Migration
- `employees.temp_password_expires_at timestamptz NULL` (migration mới, không backfill — bản ghi cũ để `NULL`, Q144).
- Settings: `temp_password_ttl_hours: int = 24` (env `TEMP_PASSWORD_TTL_HOURS`).
- Ghi: tạo nhân viên & cấp lại → `now + ttl`; `change_password` & `auth/reset-password` → `NULL`.
- Kiểm tra lúc login (sau khi xác thực mật khẩu đúng, sau kiểm `is_active`): `must_change_password AND temp_password_expires_at IS NOT NULL AND now >= temp_password_expires_at` → `Failure.TEMP_PASSWORD_EXPIRED`.

## 6. UI
- `TemporaryPasswordDialog`: thêm prop `expiresAt`; dòng "Hết hạn lúc HH:mm dd/MM/yyyy. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu." (giờ `Asia/Ho_Chi_Minh`, icon `Clock`). Dùng cho cả tạo mới và cấp lại.
- Sheet nhân viên (khối trạng thái tài khoản, chỗ nút "Cấp lại mật khẩu"): dòng trạng thái như AC-EMP-124; nhãn hết hạn dùng `Badge tone="urgent"` (UI_GUIDELINES không có token `warning`; trạng thái hết hạn là trạng thái chặn đăng nhập nên dùng màu `urgent`, luôn kèm chữ).
- Trang Đăng nhập: hiển thị `detail` của lỗi `TEMP_PASSWORD_EXPIRED`.
- Mobile 390px: các dòng mới xuống dòng tự nhiên, không tràn ngang. Screenshot 390px + 1440px cho hộp thoại và sheet.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → Nhân sự → mở một nhân viên → "Cấp lại mật khẩu" → xác nhận.
2. Thấy mật khẩu tạm + giờ hết hạn (24 giờ sau); bấm "Sao chép", dán ra chỗ khác thấy đúng.
3. Đăng xuất, đăng nhập bằng tài khoản đó + mật khẩu tạm → bị chuyển sang trang Đổi mật khẩu; đổi xong vào app bình thường.
4. (Kiểm hết hạn, cần sửa giờ máy chủ hoặc `TEMP_PASSWORD_TTL_HOURS`) cấp lại → chờ quá hạn → đăng nhập bằng mật khẩu tạm → thấy "Mật khẩu tạm đã hết hạn…"; sheet nhân viên hiện nhãn "đã hết hạn".

## 8. Giả định & câu hỏi
- Giả định: 24 giờ đã được chủ dự án chốt (2026-10-31). Mật khẩu tạm vẫn là ngày sinh khi có (Q108). Không đổi quyền — chỉ Manager cấp lại.
- **Q142** — Hạn 24 giờ áp cho mật khẩu tạm khi **tạo nhân viên mới** hay chỉ khi **cấp lại**? Mặc định đề xuất: **cả hai** (cùng là "mật khẩu tạm", cùng hộp thoại).
- **Q143** — Hạn kiểm ở đâu? Mặc định: **chỉ lúc đăng nhập**. Nhân viên đã đăng nhập kịp trong 24 giờ (phiên bị khoá chỉ cho đổi mật khẩu) vẫn đổi được dù quá 24 giờ. Phương án chặt hơn: chặn cả đổi mật khẩu/refresh khi quá hạn (dễ gặp trường hợp đăng nhập phút cuối bị kẹt).
- **Q144** — Tài khoản đang chờ đổi mật khẩu **trước khi** triển khai (hạn `NULL`) xử lý thế nào? Mặc định: **không hết hạn** (tránh khoá bất ngờ người chưa kịp đăng nhập); Manager muốn áp hạn thì bấm cấp lại. Phương án khác: migration đặt hạn = lúc triển khai + 24 giờ.
- **Q145** — Đăng nhập bằng mật khẩu tạm đã hết hạn có tính vào bộ đếm sai mật khẩu (khoá 15')? Mặc định: **không** (mật khẩu đúng, chỉ là hết hạn); ghi audit `login_refused`. Sai mật khẩu thì vẫn đếm như cũ và không lộ trạng thái hết hạn.
- Không có thay đổi `spec/*.yaml`.
