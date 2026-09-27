# M1-05 — Audit framework: ghi `audit_events` & trang Nhật ký hệ thống

- **Status:** Approved
- **Backlog:** M1-05 · **Milestone:** M1
- **Liên quan:** DOMAIN_MODEL §12 (`AuditEvent`); `spec/permissions.yaml` (`audit.read`: MANAGER all; menu `audit` → `/audit`); WORKFLOWS.md §5 (effect `audit` — dùng lại bởi ORD/DSP từ M3/M4, chưa nằm trong phạm vi item này); OPEN_QUESTIONS Q23 (đăng nhập/sai mật khẩu/khoá), Q38 (thao tác nhân viên); M1-01a (`identity.service`: login/refresh/logout/change_password); M1-04a (`employees.service`: create/update/set_roles/deactivate/activate/reset_password, hàm `_log` hiện tại chỉ ghi log ứng dụng); M1-02 (`require`, `Actor`, scope); M1-03a (menu, route guard, trang 403)

## 1. Mục tiêu
Là Quản lý chung, tôi muốn mọi thao tác quan trọng (đăng nhập, khoá tài khoản, sửa nhân viên…) được ghi lại thành một dòng nhật ký không thể sửa/xoá, và xem/lọc được nó trong một trang riêng, để có thể tra soát khi cần và làm nền cho báo cáo KPI sau này.

## 2. Phạm vi
- **Trong phạm vi:**
  - Bảng `audit_events` (migration) + module `audit` (`domain.py`, `models.py`, `service.py`, `schemas.py`, `router.py`) cung cấp hàm dùng chung `record(...)` mà các module khác gọi để ghi một dòng, và truy vấn đọc có lọc/phân trang.
  - Nối `record(...)` vào các lệnh ghi **đã tồn tại**: `identity.service` (`login`, `change_password` — gồm hai đường dẫn dẫn tới khoá tài khoản) và `employees.service` (`create_employee`, `update_employee`, `set_roles`, `deactivate`, `activate`, `reset_password`). Đây là bằng chứng framework hoạt động đúng; các module chưa tồn tại (Đơn hàng, Đầu việc…) sẽ tự nối vào `record(...)` khi được xây (M3, M4, M6 — hiệu ứng `audit` đã khai báo sẵn trong `spec/state_machines.yaml`).
  - Trang **Nhật ký hệ thống** (`/audit`, chỉ Manager — menu đã có sẵn từ M1-03a, hiện đang trỏ tới trang "đang phát triển"): danh sách lọc theo loại đối tượng / người thực hiện / khoảng ngày, phân trang.
- **Ngoài phạm vi (không làm ở item này):**
  - Nối hiệu ứng `audit` vào máy trạng thái Đơn hàng/Đầu việc (M3, M4, M6) — các module đó chưa tồn tại.
  - Ghi audit cho `logout`, làm mới token (`refresh`), phát hiện refresh-token bị dùng lại (`SESSION_REVOKED`) — không phải sự kiện Q23 nhắm tới (đăng nhập/sai mật khẩu/khoá).
  - Ghi audit cho lần đăng nhập với **email không tồn tại** — không có `Employee` để gắn `entity_id` (chỉ còn log ứng dụng như hiện tại).
  - Trigger DB chặn UPDATE/DELETE trên `audit_events` — v1 chỉ chặn ở tầng ứng dụng (không có route sửa/xoá); xem giả định §8.
  - Xem chi tiết một dòng nhật ký ở trang riêng — mọi trường đã hiển thị ngay trong danh sách.

## 3. Acceptance Criteria
Dữ liệu mẫu (giống M1-04a): **An** NV001 [MANAGER]; **Bình** NV002 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN].

### Framework dùng chung

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-052 | Trong một transaction chưa commit | code gọi `audit.service.record(session, actor_id=An.id, entity_type="EMPLOYEE", entity_id=Hoa.id, action="update", data={"changed_fields": ["phone"]})` rồi transaction đó commit | đúng 1 dòng mới trong `audit_events`: `occurred_at` ≈ thời điểm gọi (± 1s), đúng `actor_id`/`entity_type`/`entity_id`/`action`/`data`; `from_status`/`to_status` = null khi không truyền; nếu gọi trong 1 request có header `X-Request-Id` thì `request_id` khớp giá trị đó | unit + integration |
| AC-SYS-053 | An gọi `POST /employees` với email Hoa đã dùng (trùng, không phân biệt hoa thường — kịch bản AC-EMP-004) | request trả 409 `CONFLICT` | 0 dòng `audit_events` mới được tạo cho lệnh này (lệnh thất bại trước khi ghi audit, không có dòng audit "rác"); dòng `audit_events` chỉ xuất hiện cùng transaction với lệnh **thành công** | integration |
| AC-SYS-054 | — | `record(...)` được gọi với `entity_type` không thuộc enum đã khai báo (ví dụ `"FOO"`) | ném `ValueError` ngay, không insert gì — lỗi sớm khi một module tương lai gọi sai, thay vì âm thầm ghi rác | unit |
| AC-SYS-055 | — | quét toàn bộ route đã đăng ký thuộc module `audit` | chỉ có `GET`; không có `POST`/`PUT`/`PATCH`/`DELETE` nào tác động `audit_events` (append-only — DOMAIN_MODEL §12) | generated |
| AC-SYS-056 | — | route mới `GET /api/v1/audit-events` | khai báo đúng 1 capability `audit.read`; nằm trong ma trận RBAC route thật (như AC-AUTH-035/AC-EMP-012) | generated |

### Nối vào nghiệp vụ Nhân sự (M1-04a, Q38)

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-057 | An | `POST /employees {...}` tạo Hoa (SALE) | request 201 như AC-EMP-003 **và** thêm 1 `audit_events`: `entity_type="EMPLOYEE"`, `entity_id`=Hoa.id, `actor_id`=An.id, `action="create"`, `data` chứa `roles` — **không** chứa `password_hash` lẫn `temporary_password` | integration |
| AC-SYS-058 | An, Hoa `version=1` | `PATCH /employees/{hoa}` sửa `phone`, `department` (như AC-EMP-005) | 1 `audit_events`: `action="update"`, `data.changed_fields=["phone","department"]` (chỉ tên trường, không phải giá trị cũ/mới) | integration |
| AC-SYS-059 | An, Hoa đang có vai trò `["SALE"]` | `POST /employees/{hoa}/roles {roles:["SALE","TECHNICIAN"]}` (như AC-EMP-006) | 1 `audit_events`: `action="roles"`, `data={"roles_before":["SALE"],"roles_after":["SALE","TECHNICIAN"]}` | integration |
| AC-SYS-060 | An, Khoa đang hoạt động | `POST /employees/{khoa}/deactivate` rồi sau đó `POST /employees/{khoa}/activate` (như AC-EMP-009/010) | 2 dòng `audit_events` liên tiếp: dòng 1 `action="deactivate"`, `from_status="ACTIVE"`, `to_status="INACTIVE"`; dòng 2 `action="activate"`, `from_status="INACTIVE"`, `to_status="ACTIVE"` | integration |
| AC-SYS-061 | An, Khoa quên mật khẩu (như AC-EMP-011) | `POST /employees/{khoa}/reset-password` | 1 `audit_events`: `action="reset-password"`, `entity_id`=Khoa.id; `data` (và toàn bộ dòng) **không** chứa mật khẩu tạm dưới bất kỳ dạng nào | integration |

### Nối vào Đăng nhập (M1-01a, Q23)

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-062 | An đang hoạt động | `POST /auth/login` đúng mật khẩu (như AC-AUTH-001) | 1 `audit_events`: `entity_type="EMPLOYEE"`, `entity_id`=An.id, `actor_id`=An.id (tự xác thực chính mình), `action="login"` | integration |
| AC-SYS-063 | An đang hoạt động | `POST /auth/login` sai mật khẩu (như AC-AUTH-002, tài khoản có thật) | 1 `audit_events`: `entity_id`=An.id, `actor_id`=**null** (chưa xác thực được ai), `action="login_failed"`, `data={"reason":"invalid_password"}` | integration |
| AC-SYS-064 | — | `POST /auth/login` với email không tồn tại trong hệ thống | 0 dòng `audit_events` mới (không có `Employee` để gắn — chỉ log ứng dụng như hiện tại, xem §2) | integration |
| AC-SYS-065 | An có `failed_login_count=4`; **hoặc** Khoa đang đăng nhập và có `failed_login_count=0` (Q25) | An login sai lần thứ 5 (AC-AUTH-004) **hoặc** Khoa đổi mật khẩu, gõ sai mật khẩu hiện tại 5 lần (AC-AUTH-020) | mỗi trường hợp thêm 1 `audit_events`: `action="account_locked"`, `data.source` = `"login"` hoặc `"change_password"` tương ứng | integration |
| AC-SYS-066 | Khoa đã bị khoá tài khoản (`is_active=false`) | Khoa `POST /auth/login` đúng mật khẩu cũ (như AC-EMP-009) | 1 `audit_events`: `action="login_refused"`, `data={"reason":"account_disabled"}` | integration |
| AC-SYS-067 | Khoa đang đăng nhập | `POST /auth/change-password` đổi mật khẩu thành công | 1 `audit_events`: `actor_id`=Khoa.id, `entity_id`=Khoa.id, `action="password_changed"`; `data` không chứa mật khẩu cũ/mới | integration |

### API đọc & phân quyền

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-068 | 5 dòng `audit_events` đã tồn tại (đủ đa dạng `occurred_at`) | An gọi `GET /audit-events?limit=20&offset=0` | 200 `{items, total, limit, offset}`; `items` sắp giảm theo `occurred_at`; mỗi item `{id, occurred_at, actor: {id, code, full_name} \| null, entity_type, entity_id, action, from_status, to_status, data}`; `limit>100` → 422 | integration |
| AC-SYS-069 | Sự kiện của cả An và Bình tồn tại | An gọi `GET /audit-events?entity_type=EMPLOYEE&actor_id={binh.id}` | chỉ trả về các dòng `actor_id=Bình`; `entity_type` lạ (không thuộc enum) → 422 | integration |
| AC-SYS-070 | Sự kiện xảy ra ở 2 ngày khác nhau | An gọi `GET /audit-events?occurred_from=2026-09-20&occurred_to=2026-09-20` | chỉ trả về sự kiện xảy ra trong ngày đó (biên bao gồm cả ngày, theo giờ `Asia/Ho_Chi_Minh`); `occurred_from` > `occurred_to` → 422 | integration |
| AC-SYS-071 | Tuấn (TECH_LEAD) / Hoa (SALE) / Khoa (TECHNICIAN) | `GET /audit-events` | 403 `FORBIDDEN` cho cả ba (chỉ Manager có `audit.read`) | integration |

### Giao diện — trang Nhật ký hệ thống

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-072 | An đăng nhập, có ≥ 1 dòng nhật ký | mở `/audit` ở 1440px | bảng cột: Thời gian · Người thực hiện · Đối tượng · Hành động · Trước → Sau; phân trang 20 dòng/trang kiểu trang Nhân sự (AC-EMP-001); dòng có `actor=null` hiển thị "Hệ thống"; `action` hiển thị nhãn tiếng Việt (ví dụ `deactivate` → "Khoá") | component + e2e |
| AC-SYS-073 | như trên | mở `/audit` ở 390px | danh sách dạng thẻ (không bảng ngang), không cuộn ngang trang | component + e2e |
| AC-SYS-074 | trang đã có dữ liệu | chọn "Loại đối tượng: Nhân viên", chọn "Người thực hiện: Bình", đặt "Từ ngày"/"Đến ngày" | danh sách gọi lại API với đúng query tương ứng và chỉ hiện kết quả khớp; bấm "Xoá lọc" → về danh sách đầy đủ, offset về 0 | component |
| AC-SYS-075 | bộ lọc không khớp dòng nào | — | hiện `EmptyState` "Chưa có nhật ký nào khớp với bộ lọc." | component |
| AC-SYS-076 | Hoa (SALE) đăng nhập | vào menu | không thấy mục "Nhật ký hệ thống"; gõ trực tiếp URL `/audit` | trang 403 (route guard M1-03a) | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/audit-events | audit.read | `entity_type?, actor_id?, occurred_from? (date), occurred_to? (date), limit≤100 (default 20), offset` | `{items: AuditEventOut[], total, limit, offset}` | 422 |

`AuditEventOut`: `{ id, occurred_at, actor: {id, code, full_name} | null, entity_type, entity_id, action, from_status, to_status, data }`.
`entity_type` enum v1: `EMPLOYEE` (mở rộng bởi các module sau: `ORDER`, `TASK`… khi M3/M4/M6 nối `audit`).

## 5. Dữ liệu / Migration
Bảng mới `audit_events` (append-only, không `updated_at`):
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| occurred_at | timestamptz NOT NULL DEFAULT now() | UTC |
| actor_id | uuid NULL FK → employees.id | null = hệ thống/chưa xác thực |
| entity_type | text NOT NULL | enum tầng ứng dụng |
| entity_id | uuid NOT NULL | |
| action | text NOT NULL | mã ổn định, ví dụ `create`, `login_failed` |
| from_status | text NULL | |
| to_status | text NULL | |
| data | jsonb NULL | trường thay đổi / lý do — không bao giờ chứa mật khẩu |
| request_id | text NULL | khớp header `X-Request-Id` (`core/request_id.py`) |

Index: `(entity_type, entity_id)`, `(actor_id)`, `(occurred_at DESC)`.
Module mới `backend/app/modules/audit/` (`domain.py`, `models.py`, `service.py`, `schemas.py`, `router.py`) theo cấu trúc ARCHITECTURE §3. `employees/service.py` và `identity/service.py` gọi `audit.service.record(...)` (module khác gọi qua service public — như `identity.service.revoke_all_sessions` đã làm).

## 6. UI
- Trang `/audit` (menu "Nhật ký hệ thống", đã khai báo ở M1-03a, chỉ Manager thấy).
- Bộ lọc trên cùng: chọn "Loại đối tượng" (hiện tại chỉ có "Nhân viên"), chọn "Người thực hiện" (ô tìm nhân viên, dùng lại danh sách từ `employee.read`), "Từ ngày"/"Đến ngày", nút "Xoá lọc".
- Desktop (`lg:`): bảng, cột Thời gian (giờ VN) · Người thực hiện (tên + mã, "Hệ thống" nếu null) · Đối tượng (nhãn loại + mã/tên nếu tra được) · Hành động (nhãn tiếng Việt) · Trước → Sau (badge trạng thái nếu có, "—" nếu không).
- Mobile (< `lg:`): thẻ xếp dọc, mỗi thẻ: Hành động + Đối tượng ở dòng đầu, Người thực hiện + Thời gian ở dòng phụ.
- Nhãn hành động (Việt hoá cho các action đã nối ở item này): `create`→"Tạo", `update`→"Cập nhật", `roles`→"Đổi vai trò", `deactivate`→"Khoá", `activate`→"Mở khoá", `reset-password`→"Cấp lại mật khẩu", `login`→"Đăng nhập", `login_failed`→"Đăng nhập sai", `account_locked`→"Tạm khoá", `login_refused`→"Từ chối đăng nhập", `password_changed`→"Đổi mật khẩu".
- Empty state: "Chưa có nhật ký nào khớp với bộ lọc."

## 7. Kịch bản UAT thủ công
1. Đăng nhập bằng An (Manager) → vào "Nhân sự", khoá tài khoản Khoa.
2. Vào menu "Nhật ký hệ thống".
3. Lọc "Người thực hiện: An", "Từ ngày"/"Đến ngày" = hôm nay → thấy dòng "Khoá — Khoa (NV014) — bởi An" vừa tạo.
4. Bấm "Xoá lọc" → thấy thêm các dòng đăng nhập cũ hơn.
5. Mở lại trên điện thoại (390px) → cùng dữ liệu hiển thị dạng thẻ, không cuộn ngang.

## 8. Giả định & câu hỏi
- Giả định: `entity_type` v1 chỉ có `EMPLOYEE`; enum mở rộng dần (không cần migration) khi M3/M4/M6 nối hiệu ứng `audit` của `spec/state_machines.yaml` vào các module Đơn hàng/Đầu việc — đúng như WORKFLOWS.md §5 đã mô tả effect này từ trước.
- Giả định: chặn append-only chỉ ở tầng ứng dụng (không có route sửa/xoá) cho v1; chưa thêm rule/trigger DB — có thể bổ sung sau nếu cần chống một thao tác `UPDATE` chạy thẳng bằng tay/psql.
- Giả định: theo Q23, chỉ audit các sự kiện đăng nhập/sai mật khẩu/khoá và (mở rộng tự nhiên) đổi mật khẩu thành công — **không** audit `logout`, làm mới token, hay lần đăng nhập với email không tồn tại (không có thực thể để gắn).
- Giả định: `data` của `update`/`roles` chỉ ghi tên trường thay đổi hoặc giá trị vai trò trước/sau — không ghi giá trị cũ/mới đầy đủ (giảm dữ liệu cá nhân trùng lặp trong nhật ký); có thể mở rộng sau nếu KPI (M8) cần diff đầy đủ.
- Không có câu hỏi mới — Q23 và Q38 đã được chủ dự án chốt đúng hướng của item này.
