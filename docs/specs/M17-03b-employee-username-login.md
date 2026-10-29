# M17-03b — Tên đăng nhập tự sinh, đăng nhập bằng tên đăng nhập

- **Status:** Approved (2026-10-29, chủ dự án duyệt; Q105–Q107 theo mặc định, Q108 chốt mật khẩu tạm = ngày sinh ddmmyyyy)
- **Backlog:** M17-03b · **Milestone:** M17 · **Phụ thuộc:** M17-03a (email tuỳ chọn)
- **Liên quan:** `backend/app/modules/identity/` (`LoginRequest`, login/lockout, bootstrap Manager, `/me`), `backend/app/modules/employees/` (service tạo NV), `frontend/src/features/auth/` (màn đăng nhập), `frontend/src/features/employees/`; specs M1-01a (auth), M12-01a (quên mật khẩu)

## 1. Mục tiêu
Nhân viên đăng nhập bằng **tên đăng nhập** ngắn, tự sinh từ họ tên (ví dụ Nguyễn Trần Tâm → `tam.nt`), thay cho email.

## 2. Phạm vi
- Trong phạm vi:
  - Cột mới `employees.username citext unique not null`.
  - **Quy tắc sinh** (chủ dự án chốt 2026-10-29): bỏ dấu tiếng Việt (`đ`→`d`), chữ thường, bỏ ký tự không phải chữ/số; tách theo khoảng trắng; `username = <chữ cuối> + "." + <chữ cái đầu của mỗi chữ còn lại>`. Họ tên 1 chữ → chỉ chữ đó. Nếu đã tồn tại (tính cả nhân viên ngừng hoạt động) → thêm số từ 2: `tam.nt2`, `tam.nt3`…
  - Sinh tự động khi tạo nhân viên (API tạo không nhận `username`); trả `username` trong response tạo/xem nhân viên và `/auth/me`. Thông báo tạo nhân viên hiện tên đăng nhập + mật khẩu tạm.
  - **Đăng nhập chỉ bằng tên đăng nhập** (`POST /auth/login` body `username`, không phân biệt hoa thường); bỏ đăng nhập bằng email. Khoá tài khoản/giới hạn tần suất giữ nguyên quy tắc, chuyển khoá theo `username`.
  - Migration sinh `username` cho mọi nhân viên hiện có theo cùng quy tắc, đánh số trùng theo `created_at`, rồi `code`.
  - Manager được **sửa** tên đăng nhập (ô "Tên đăng nhập" khoá sẵn, bật khi tick "Thay đổi thông tin đăng nhập" như ảnh mẫu) — Q106; định dạng `^[a-z0-9]+(\.[a-z0-9]+)*$`, 3–50 ký tự, duy nhất. Đổi họ tên **không** tự đổi tên đăng nhập.
  - Bootstrap Manager đầu tiên: nhận họ tên, sinh username theo quy tắc, in ra màn hình.
  - "Quên mật khẩu" giữ nguyên: nhập **email** (nhân viên không có email → nhờ Manager đặt lại).
  - **Mật khẩu tạm = ngày sinh dạng `ddmmyyyy` (8 chữ số, không dấu `/`)** (chủ dự án chốt 2026-10-29, Q108), ví dụ sinh 30/07/1985 → `30071985`; vẫn bắt đổi mật khẩu ở lần đăng nhập đầu (`must_change_password=true`). Áp dụng cả khi Manager "Đặt lại mật khẩu". Nhân viên **chưa có ngày sinh** → mật khẩu tạm ngẫu nhiên như hiện nay. Mật khẩu mới khi đổi không được trùng ngày sinh (`ddmmyyyy`).
  - Nhân viên hiện có: migration **không** đổi mật khẩu đang dùng.
- Ngoài phạm vi: nhân viên tự đổi tên đăng nhập; Manager tự gõ mật khẩu cho nhân viên.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-AUTH-064 | — | hàm sinh với "Nguyễn Trần Tâm", "Nguyễn Lê Kim Yến", "Đỗ Văn Đức", "  Lê   Bình ", "Tâm" | `tam.nt`, `yen.nlk`, `duc.dv`, `binh.l`, `tam` | unit |
| AC-AUTH-065 | Đã có `tam.nt` (đang hoạt động) và `tam.nt2` (đã ngừng hoạt động) | An tạo nhân viên "Nguyễn Thị Tâm" | 201; `username="tam.nt3"` | integration |
| AC-AUTH-066 | Tâm có `username=tam.nt`, mật khẩu đúng | `POST /auth/login {username:"Tam.NT", password}` | 200 đăng nhập thành công | integration |
| AC-AUTH-067 | Tâm có email `tam@smyou.vn` | `POST /auth/login {username:"tam@smyou.vn", password}` | 401 `INVALID_CREDENTIALS` (không đăng nhập bằng email nữa) | integration |
| AC-AUTH-068 | Sai mật khẩu đủ số lần quy định cho `tam.nt` | đăng nhập lần tiếp | Bị khoá như quy tắc hiện tại | integration |
| AC-AUTH-069 | DB có An "Nguyễn Văn An", Bình "Lê Văn Bình", và 2 người "Phạm Minh Tú" (tạo trước/sau) trước migration | chạy migration | `an.nv`, `binh.lv`, `tu.pm`, `tu.pm2` (theo `created_at`); downgrade xoá cột | integration (migration) |
| AC-AUTH-070 | An sửa Bình | `PATCH` `username="binh.le"` → 200, audit `changed_fields` chứa `username`; `username` trùng người khác → 409 `USERNAME_TAKEN`; `"Binh Le"` → 422 | integration |
| AC-AUTH-071 | Tú đăng nhập | `GET /auth/me` | `employee.username = "tu.pm"` | integration |
| AC-AUTH-072 | Màn đăng nhập | render | Ô "Tên đăng nhập" (không còn "Email"), `autocomplete="username"`; bỏ trống → "Vui lòng nhập tên đăng nhập." | component |
| AC-AUTH-073 | An tạo nhân viên thành công | xem thông báo | Hiện "Tên đăng nhập: yen.nlk" và mật khẩu tạm; form sửa có ô "Tên đăng nhập" khoá, tick "Thay đổi thông tin đăng nhập" mới sửa được | component |
| AC-AUTH-074 | 390px và 1440px | An tạo "Nguyễn Lê Kim Yến" sinh 30/07/1985 → đăng xuất → đăng nhập `yen.nlk` + `30071985` | Vào màn đổi mật khẩu lần đầu | e2e |
| AC-AUTH-075 | An tạo Yến sinh 1985-07-30 | `POST /employees` rồi đăng nhập `yen.nlk`/`30071985` | 201 trả `temporary_password="30071985"`; đăng nhập 200 với `must_change_password=true` | integration |
| AC-AUTH-076 | Nhân viên không có ngày sinh | An tạo / đặt lại mật khẩu | Mật khẩu tạm ngẫu nhiên (khác dạng ngày), vẫn bắt đổi lần đầu | integration |
| AC-AUTH-077 | Yến (sinh 30/07/1985) có mật khẩu đã đổi | An "Đặt lại mật khẩu" Yến | Mật khẩu tạm = `30071985`, `must_change_password=true` | integration |
| AC-AUTH-078 | Yến đăng nhập lần đầu | đổi mật khẩu mới = `30071985` | 422 "Mật khẩu mới không được trùng ngày sinh." | integration |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/auth/login | (công khai) | body `email` → `username` |
| POST | /api/v1/employees | employee.manage | response thêm `username` (sinh tự động) |
| PATCH | /api/v1/employees/{id} | employee.manage | thêm `username` (tuỳ chọn) |
| GET | /api/v1/employees, /employees/{id}, /auth/me | employee.read / đăng nhập | trả `username` |

Lỗi mới: 409 `USERNAME_TAKEN`. Chạy `make contract`.

## 5. Dữ liệu / Migration
- Thêm `username citext` → backfill bằng hàm sinh Python (dùng chung với service) → `NOT NULL` + unique. Downgrade: drop cột.
- Bảng/khoá đếm đăng nhập sai nếu đang theo email → theo `username`.
- E2E seed + tài khoản demo đổi sang username; README/hướng dẫn đăng nhập cập nhật.
- DOMAIN_MODEL §Employee, GLOSSARY "Tên đăng nhập" = `username`.

## 6. UI
- Màn đăng nhập: "Tên đăng nhập" thay "Email".
- Form nhân viên: khối "Thông tin đăng nhập" như ảnh mẫu — checkbox "Thay đổi thông tin đăng nhập", ô "Tên đăng nhập" (khoá mặc định), "Trạng thái" (dùng `is_active` hiện có). Khi tạo mới: ô tên đăng nhập ẩn, tên được hiện sau khi lưu.
- Danh sách nhân viên hiển thị tên đăng nhập dưới họ tên.

## 7. Kịch bản UAT thủ công
1. Sau khi cập nhật, mọi nhân viên cũ đăng nhập bằng tên đăng nhập mới (Manager xem ở danh sách để báo từng người).
2. Tạo "Nguyễn Trần Tâm" hai lần → `tam.nt`, `tam.nt2`.
3. Đăng nhập bằng email → bị từ chối.

## 8. Giả định & câu hỏi
- Q106: Manager được sửa tên đăng nhập (theo ảnh mẫu) — mặc định có.
- Q108 (chốt): mật khẩu tạm = ngày sinh `ddmmyyyy` (vd `30071985`), bắt đổi lần đầu. Rủi ro đã biết: ngày sinh dễ đoán → giảm thiểu bằng bắt đổi lần đầu + cấm đặt lại đúng ngày sinh + khoá tài khoản khi sai nhiều lần.
- Giả định: chưa có ngày sinh → mật khẩu tạm ngẫu nhiên; nếu mật khẩu tạm ngắn hơn độ dài tối thiểu hiện tại thì quy tắc độ dài chỉ áp cho mật khẩu do người dùng đặt.
- **Ảnh hưởng vận hành:** sau khi deploy, mọi người phải dùng tên đăng nhập mới — cần báo trước cho nhân viên.
- Không cần sửa `spec/*.yaml` (endpoint `/auth/login` vẫn công khai).
