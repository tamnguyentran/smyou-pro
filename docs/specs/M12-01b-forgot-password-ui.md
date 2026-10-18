# M12-01b — Quên mật khẩu (giao diện): trang "Quên mật khẩu", "Đặt lại mật khẩu", liên kết từ Đăng nhập

- **Status:** Approved
- **Backlog:** M12-01b · **Milestone:** M12
- **Liên quan:** `docs/specs/M12-01a-forgot-password-api.md` (API đã merge); `docs/specs/M1-01b-auth-ui.md` (mẫu trang Đăng nhập/Đổi mật khẩu, component dùng lại); ADR-015; `spec/permissions.yaml` (`public_routes`, không đổi thêm ở item này)

## 1. Mục tiêu
Là nhân viên quên mật khẩu, tôi bấm "Quên mật khẩu?" ở trang Đăng nhập, nhập email, nhận email chứa liên kết, mở liên kết và tự đặt mật khẩu mới, để không phải chờ Quản lý reset tay.

## 2. Phạm vi
- Trong:
  - Link "Quên mật khẩu?" trên trang Đăng nhập.
  - Trang "Quên mật khẩu" (`/quen-mat-khau`): nhập email → gọi `POST /auth/forgot-password` (đã có từ M12-01a) → hiện thông báo chung.
  - Trang "Đặt lại mật khẩu" (`/reset-password` — xem giải thích đường dẫn ở §8) đọc `?token=` từ URL → gọi `POST /auth/reset-password` (đã có).
  - Cơ chế cho E2E đọc được link reset đã gửi khi không có SMTP thật trong CI (xem §8 — cần chủ dự án quyết định).
  - E2E mobile + desktop + axe cho luồng này.
- Ngoài:
  - API backend, bảng `password_reset_tokens`/`password_reset_requests`, SMTP gửi email thật (đã xong ở M12-01a).
  - Đổi mật khẩu khi đã đăng nhập (`/doi-mat-khau`, đã có — M1-01b).

## 3. Acceptance Criteria
Dữ liệu mẫu (tiếp tục dùng nhân vật M1-01a/M12-01a): Manager **Nguyễn Văn An**, `an.nguyen@smyou.vn`, mật khẩu hiện tại `SmYou@2026`.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-052 | Trang Đăng nhập | — | Có link "Quên mật khẩu?" ngay dưới ô Mật khẩu, trỏ tới `/quen-mat-khau`, vùng chạm ≥ 44px | component + e2e |
| AC-AUTH-053 | Trang "Quên mật khẩu", nhập `an.nguyen@smyou.vn` | bấm "Gửi liên kết" | Nút hiện spinner & khoá chống bấm đôi; API trả 200; form được thay bằng `EmptyState` hiện đúng `detail` server trả về + nút "Về trang đăng nhập" (`/dang-nhap`) | component |
| AC-AUTH-054 | Trang "Quên mật khẩu", nhập email không tồn tại (`ai.do@smyou.vn`) | bấm "Gửi liên kết" | Giao diện hiện **y hệt** AC-AUTH-053 (không thể phân biệt qua UI email có tồn tại hay không) | component |
| AC-AUTH-055 | Trang "Quên mật khẩu" | để trống email / nhập "khong-phai-email" rồi bấm "Gửi liên kết" | Lỗi hiện dưới ô Email ("Vui lòng nhập email."/"Email không hợp lệ."), không gọi API (chặn phía client bằng zod) | component |
| AC-AUTH-056 | Đã gửi 3 lần hợp lệ trong giờ (API trả 429 ở lần gọi thứ 4) | bấm "Gửi liên kết" lần 4 | Khung lỗi chung (`Alert`) phía trên form hiện đúng `detail` ("Bạn đã yêu cầu quá nhiều lần…"); form vẫn còn, không chuyển sang `EmptyState` | component |
| AC-AUTH-057 | Mở `/reset-password` không có `token` trong query (hoặc `token` rỗng) | — | Không hiện form; hiện `EmptyState` "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." + nút "Gửi lại yêu cầu" trỏ `/quen-mat-khau` | component |
| AC-AUTH-058 | Mở `/reset-password?token=<chuỗi bất kỳ>` | — | Hiện form 2 ô "Mật khẩu mới", "Nhập lại mật khẩu mới"; gợi ý quy tắc dưới ô mới ("Ít nhất 8 ký tự, khác mật khẩu hiện tại, không chứa tên email.") giống trang Đổi mật khẩu | component |
| AC-AUTH-059 | Token hợp lệ (lấy qua cơ chế §8); nhập mật khẩu mới hợp lệ, khớp xác nhận | bấm "Đặt lại mật khẩu" | API trả 204; toast "Đã đặt lại mật khẩu. Vui lòng đăng nhập lại."; xoá session cục bộ (giống `useLogout`, không gọi lại `/auth/logout`); chuyển tới `/dang-nhap` | component + e2e |
| AC-AUTH-060 | Trang "Đặt lại mật khẩu" có token | nhập 2 ô mật khẩu mới khác nhau, bấm submit | Lỗi "Mật khẩu nhập lại không khớp." dưới ô xác nhận (client, zod); không gọi API | component |
| AC-AUTH-061 | Token đã dùng/hết hạn (API trả 422 `INVALID_RESET_TOKEN` khi submit) | bấm "Đặt lại mật khẩu" | Form bị thay bằng `EmptyState` giống AC-AUTH-057 (gồm nút "Gửi lại yêu cầu") | component |
| AC-AUTH-062 | Token hợp lệ, mật khẩu mới yếu hoặc trùng mật khẩu hiện tại (API trả 422 `VALIDATION_ERROR`, field `new_password`) | bấm "Đặt lại mật khẩu" | Lỗi hiện dưới ô "Mật khẩu mới" đúng message server trả; form + token vẫn còn để thử lại (không bị thay bằng `EmptyState`) | component |
| AC-AUTH-063 | Luồng đầy đủ: Đăng nhập → "Quên mật khẩu?" → nhập email → lấy token qua cơ chế §8 → mở `/reset-password?token=...` → đặt mật khẩu mới → đăng nhập lại bằng mật khẩu mới | E2E mobile (iPhone 13) + desktop 1440 | 0 vi phạm axe serious/critical; không cuộn ngang ở 360px; screenshot `forgot-password.png`, `reset-password.png` | e2e |

## 4. API
Không có API mới — dùng lại 2 endpoint đã merge ở M12-01a:

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/auth/forgot-password | public | `{email}` | `{detail}` | 422, 429 |
| POST | /api/v1/auth/reset-password | public | `{token, new_password}` | 204 | 422 |

## 5. Dữ liệu / Migration
Không có bảng/cột mới. Nếu chủ dự án chọn phương án "endpoint debug E2E" ở §8, cần thêm 1 biến môi trường (`MAIL_CAPTURE_FILE`, chỉ set trong `.env.dev`/CI) — không phải migration.

## 6. UI
- **Đăng nhập** (`/dang-nhap`, đã có): thêm link text "Quên mật khẩu?" ngay dưới ô Mật khẩu (trên nút "Đăng nhập"), `text-sm`, màu `text-link` (hoặc token link hiện có trong UI_GUIDELINES), `to="/quen-mat-khau"`.
- **Quên mật khẩu** (`/quen-mat-khau`, public — giống khung `SignedOutOnly` của trang Đăng nhập): card căn giữa như Đăng nhập; tiêu đề "Quên mật khẩu"; 1 ô Email; nút Primary full-width "Gửi liên kết" (icon `Send`); ngay dưới nút, link "Quay lại đăng nhập" (`Link` tới `/dang-nhap`) để thoát ra bất cứ lúc nào, không chỉ sau khi gửi (chốt lại khi code: bỏ dòng giải thích ban đầu, ô Email đã đủ rõ). Sau khi gửi thành công (hoặc email không tồn tại — cùng xử lý): thay toàn bộ form bằng `EmptyState` (icon `MailCheck`, message = `detail` server trả) + nút "Về trang đăng nhập" (`Link` tới `/dang-nhap`). Lỗi 429/422 xử lý như trang Đăng nhập (Alert / lỗi dưới ô).
- **Đặt lại mật khẩu** (`/reset-password`, public, **không** cần `SignedOutOnly` — liên kết phải luôn dùng được kể cả khi trình duyệt đó còn phiên đăng nhập khác): đọc `token` từ `useSearchParams()`. Không có token → `EmptyState` (icon `LinkOff` hoặc `AlertCircle`) "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." + nút "Gửi lại yêu cầu" (`Link` tới `/quen-mat-khau`). Có token → card giống Đổi mật khẩu: tiêu đề "Đặt lại mật khẩu"; 2 ô "Mật khẩu mới" (`autoComplete=new-password`, hint như M1-01b), "Nhập lại mật khẩu mới"; nút Primary "Đặt lại mật khẩu" (icon `KeyRound`). 422 `INVALID_RESET_TOKEN` khi submit → chuyển sang cùng `EmptyState` link-hỏng. 422 `VALIDATION_ERROR` field `new_password` → lỗi dưới ô, giữ form.
- Toast thành công "Đã đặt lại mật khẩu. Vui lòng đăng nhập lại."; loading = spinner trong nút; mobile: card full-width như các trang auth khác.

## 7. Kịch bản UAT thủ công
1. `make up`; mở `/smyoutask/dang-nhap` → bấm "Quên mật khẩu?" → vào `/quen-mat-khau`.
2. Nhập email nhân viên thật đang hoạt động → bấm "Gửi liên kết" → thấy thông báo chung; kiểm tra hộp mail nhận được liên kết trong vài giây (SMTP đã cấu hình ở M12-01a).
3. Mở liên kết trong email → trang "Đặt lại mật khẩu" hiện form → đặt mật khẩu mới → toast → về trang Đăng nhập.
4. Đăng nhập lại bằng mật khẩu mới → thành công; nếu đang đăng nhập sẵn ở thiết bị khác, phiên đó cũng bị đăng xuất (đã được bảo đảm ở M12-01a, kiểm tra lại qua UI).
5. Mở lại liên kết cũ (đã dùng) → thấy "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." + nút "Gửi lại yêu cầu".

## 8. Giả định & câu hỏi
- **Đường dẫn trang "Đặt lại mật khẩu" là `/reset-password` (tiếng Anh), không theo quy ước slug tiếng Việt (`/dang-nhap`, `/doi-mat-khau`) của phần còn lại của app.** Lý do: `backend/app/modules/identity/service.py` (đã merge ở M12-01a) tạo sẵn liên kết email theo mẫu cố định `{PUBLIC_URL}/reset-password?token=<raw_token>` — email thật đã/sẽ được gửi với đường dẫn này, và `PUBLIC_URL` đã bao gồm `BASE_PATH` cho production. Đổi path này sang tiếng Việt sẽ cần sửa lại chuỗi trong code backend đã merge (không phải migration, nhưng là sửa lại 1 file của item đã Done) **và** có thể có email đã gửi trước đó còn trỏ tới path cũ. Giả định: **giữ `/reset-password`** làm ngoại lệ route duy nhất, không sửa lại M12-01a. Nếu chủ dự án muốn slug tiếng Việt, cần duyệt sửa `service.py` kèm theo.
- **Câu hỏi mới (cần chủ dự án quyết định) — làm sao E2E lấy được link/token reset khi không có SMTP thật trong CI/dev stack:** DB chỉ lưu hash của token (`password_reset_tokens.token_hash`), token gốc chỉ tồn tại trong email đã gửi — Playwright không có cách nào đọc được nếu không có cơ chế "bắt" email. Đề xuất mặc định: thêm biến môi trường `MAIL_CAPTURE_FILE` (chỉ set ở `.env.dev`/CI, không set ở `.env.prod`) — khi có, `backend/app/core/mailer.py` ghi thêm (append) mỗi email đã "gửi" (to, subject, body) dạng JSON-line vào file này; thêm 1 endpoint debug `GET /api/v1/auth/_e2e/last-mail?email=` (từ chối nếu `MAIL_CAPTURE_FILE` không được set, tức là không tồn tại ở prod) trả về email mới nhất gửi tới địa chỉ đó để Playwright trích `token` từ URL trong body — cùng tinh thần với `backend/scripts/seed_e2e.py` (guard `APP_ENV != production`). Phương án khác (không chọn làm mặc định): dựng thêm service Maildev/Mailhog trong `compose.dev.yml` cho riêng E2E — tốn thêm hạ tầng, không chọn trừ khi chủ dự án muốn dùng SMTP catcher chuẩn cho mục đích khác nữa.
- Giả định: trang "Quên mật khẩu" dùng khung `SignedOutOnly` (đã đăng nhập thì không cần, chuyển về trang chủ) — giống trang Đăng nhập. Trang "Đặt lại mật khẩu" **không** dùng khung này (phải luôn mở được dù trình duyệt còn phiên khác, vì chính hành động reset sẽ thu hồi toàn bộ phiên — M12-01a AC-046).
- Giả định: không cần giữ nguyên "Email" đã nhập ở trang "Quên mật khẩu" sau khi hiện `EmptyState` (không có nút "Gửi lại" tại chỗ — người dùng bấm "Về trang đăng nhập" rồi lặp lại từ đầu nếu cần).
