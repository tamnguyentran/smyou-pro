# M1-04a — Quản lý nhân viên & vai trò: API

- **Status:** Done
- **Approval:** chủ dự án duyệt nội dung + Q31–Q38 theo đề xuất (2026-09-26). Sửa câu chữ AC-EMP-007/008 cho khớp Q35 (tự khoá luôn là `CANNOT_DEACTIVATE_SELF`; khoá Manager cuối cùng chỉ xảy ra khi hai Manager khoá nhau cùng lúc) — không đổi luật
- **Backlog:** M1-04a · **Milestone:** M1
- **Liên quan:** DOMAIN_MODEL §1 (Employee, `employee_roles`, "luôn còn ≥ 1 MANAGER đang hoạt động"); `spec/permissions.yaml` (`employee.read`: MANAGER all, TECH_LEAD all; `employee.manage`: MANAGER all); PRD §4 ("Manager tạo tài khoản, gán nhiều vai trò, khoá tài khoản"); M1-01a (mật khẩu Q21, phiên, `must_change_password`); M1-02 (`require`, scope); M1-03a (menu "Nhân sự & phân quyền" → `/employees`)

## 1. Mục tiêu
Là Quản lý chung, tôi tạo tài khoản cho nhân viên mới, gán một hay nhiều vai trò, sửa thông tin, khoá tài khoản khi nhân viên nghỉ và cấp lại mật khẩu khi họ quên — mà không bao giờ tự làm công ty mất quyền quản trị (luôn còn ít nhất một Quản lý chung đang hoạt động). Quản lý kỹ thuật xem được danh sách nhân viên để giao việc.

## 2. Phạm vi
Tách 2 phần (Q31 ✅); spec này là **M1-04a**, giao diện ở `M1-04b-employees-ui.md`:
- **M1-04a — API:** danh sách/tìm/lọc, xem chi tiết, tạo, sửa thông tin, đặt vai trò, khoá/mở, cấp lại mật khẩu; luật "Manager cuối cùng"; test RBAC/scope.
- **M1-04b — Giao diện:** trang Nhân sự (danh sách dạng bảng trên máy tính, dạng thẻ trên điện thoại), form tạo/sửa, hộp xác nhận khoá/mở/cấp lại mật khẩu, hiển thị mật khẩu tạm một lần.
- Ngoài: ghi `audit_events` (M1-05, như Q23 — tạm ghi log ứng dụng), xử lý đầu việc đang giao cho người bị khoá (M4-02), ảnh đại diện, nhập nhân viên từ Excel, xoá hẳn nhân viên (không bao giờ — dùng khoá).

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Bình** NV002 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN].


| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-001 | 5 nhân viên trên, Khoa đã bị khoá | An gọi `GET /employees?q=kho&is_active=false&role=TECHNICIAN&limit=20&offset=0` | 200 `{items, total, limit, offset}`; `q` tìm không phân biệt hoa thường/dấu trong tên, mã, email, SĐT; lọc theo vai trò và trạng thái; sắp theo mã; mỗi item `{id, code, full_name, email, phone, department, title, roles, is_active, is_locked, version}` — **không** có `password_hash`, `failed_login_count`; `limit` > 100 → 422 | integration |
| AC-EMP-002 | Tuấn (TECH_LEAD, `employee.read` all) / Hoa (SALE) / Khoa (TECHNICIAN) | `GET /employees`, `GET /employees/{id}` | Tuấn: 200 (chỉ đọc); Hoa, Khoa: 403 `FORBIDDEN`. Tuấn gọi bất kỳ lệnh ghi nào bên dưới → 403 | integration |
| AC-EMP-003 | An | `POST /employees {full_name:"Lê Thị Hoa", email:"hoa.le@smyou.vn", phone:"0932068787", department:"SALES", title:"Nhân viên kinh doanh", roles:["SALE"]}` | 201; mã tự sinh tiếp theo (vd `NV016`, Q32); `must_change_password=true`; response có `temporary_password` (chỉ trả **một lần**, Q33) đúng luật Q21; đăng nhập bằng mật khẩu tạm → buộc đổi mật khẩu (M1-01) | integration |
| AC-EMP-004 | An | tạo với: email đã tồn tại (khác hoa thường) / email sai định dạng / SĐT không phải 10 số bắt đầu 0 / `roles` rỗng hoặc vai trò lạ / `full_name` rỗng / `department` lạ | lần lượt 409 `CONFLICT` field `email` "Email đã được dùng cho nhân viên khác." / 422 với `errors[].field` đúng tên trường, thông điệp tiếng Việt | integration |
| AC-EMP-005 | An, Hoa có `version=1` | `PATCH /employees/{hoa} {version:1, full_name, phone, department, title, email}` | 200, `version=2`; sửa lại với `version:1` → 409 `STALE_VERSION`; đổi email trùng người khác → 409 `CONFLICT` | integration |
| AC-EMP-006 | An | `POST /employees/{hoa}/roles {version, roles:["SALE","TECHNICIAN"]}` | 200; Hoa có 2 vai trò; `/me` của Hoa phản ánh ngay ở request kế tiếp (không phải đăng nhập lại) | integration |
| AC-EMP-007 | An và Bình là 2 Manager đang hoạt động | An bỏ vai trò MANAGER của Bình → 200. Sau đó An (Manager cuối cùng) bỏ MANAGER của chính mình | 409 `LAST_MANAGER` "Phải còn ít nhất một Quản lý chung đang hoạt động."; dữ liệu không đổi | integration |
| AC-EMP-008 | An, Bình cùng là Manager | hai request đồng thời: An bỏ MANAGER của Bình **và** Bình bỏ MANAGER của An; **hoặc** An khoá Bình **và** Bình khoá An | mỗi cặp: đúng một request thành công, request kia 409 `LAST_MANAGER` (tuần tự hoá bằng khoá, không bao giờ còn 0 Manager đang hoạt động) | integration |
| AC-EMP-009 | An; Khoa đang đăng nhập trên điện thoại | `POST /employees/{khoa}/deactivate {version}` | 200 `is_active=false`; **mọi phiên** của Khoa bị thu hồi (request kế tiếp của Khoa → 401); Khoa đăng nhập đúng mật khẩu → 403 `ACCOUNT_DISABLED` (M1-01a). An tự khoá chính mình → 409 `CANNOT_DEACTIVATE_SELF` "Bạn không thể tự khoá tài khoản của mình." (Q35) | integration |
| AC-EMP-010 | Khoa đang bị khoá | `POST /employees/{khoa}/activate {version}` | 200 `is_active=true`; Khoa đăng nhập lại được bằng mật khẩu cũ. Khoá người đã khoá / mở người đang mở → 409 `INVALID_TRANSITION` | integration |
| AC-EMP-011 | Khoa quên mật khẩu, đang bị tạm khoá do sai 5 lần | An `POST /employees/{khoa}/reset-password {version}` | 200 `{temporary_password}` (một lần); `must_change_password=true`; bộ đếm sai và `locked_until` về rỗng (Q37); mọi phiên cũ của Khoa bị thu hồi; mật khẩu cũ không còn dùng được | integration |
| AC-EMP-012 | — | mọi route mới | khai báo đúng 1 capability (`employee.read` cho GET, `employee.manage` cho lệnh ghi); nằm trong ma trận RBAC route thật (AC-AUTH-035); mật khẩu tạm không xuất hiện trong log; mỗi lệnh ghi một dòng log ứng dụng có người làm, người bị tác động, hành động (Q38) | generated + integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/employees | employee.read | `q, role, is_active, limit≤100, offset` | `{items, total, limit, offset}` | 422 |
| GET | /api/v1/employees/{id} | employee.read | — | `EmployeeDetail` | 404 |
| POST | /api/v1/employees | employee.manage | `EmployeeCreate` | 201 `EmployeeCreated` (+ `temporary_password`) | 409, 422 |
| PATCH | /api/v1/employees/{id} | employee.manage | `{version, full_name?, email?, phone?, department?, title?}` | `EmployeeDetail` | 404, 409, 422 |
| POST | /api/v1/employees/{id}/roles | employee.manage | `{version, roles[]}` | `EmployeeDetail` | 404, 409 (`LAST_MANAGER`, `STALE_VERSION`), 422 |
| POST | /api/v1/employees/{id}/deactivate | employee.manage | `{version}` | `EmployeeDetail` | 404, 409 |
| POST | /api/v1/employees/{id}/activate | employee.manage | `{version}` | `EmployeeDetail` | 404, 409 |
| POST | /api/v1/employees/{id}/reset-password | employee.manage | `{version}` | `{temporary_password, employee}` | 404, 409 |

PATCH chỉ sửa thông tin (không có trường `is_active`/`roles`/`status`): trạng thái đổi qua lệnh có tên (CLAUDE.md quy tắc 4).

## 5. Dữ liệu / Migration
- Bảng `code_sequences(scope, period, last_value)` (ARCHITECTURE §5) nếu chưa có; scope `employee` → mã `NV` + ≥ 3 chữ số, tiếp nối mã lớn nhất hiện có (NV001 từ CLI) (Q32).
- Index `employees(is_active)`; tìm không dấu: extension `unaccent` + index hàm trên `full_name` (hoặc cột chuẩn hoá) — chọn khi làm, có test.

## 7. Kịch bản UAT thủ công (API — giao diện ở M1-04b)
1. `make up`; đăng nhập Manager trên trình duyệt, mở `/smyoutask/api/docs` (dev) → thử `POST /employees` → nhận `temporary_password`.
2. Đăng nhập bằng mật khẩu tạm ở cửa sổ ẩn danh → bị yêu cầu đổi mật khẩu.
3. Thử bỏ vai trò Manager của chính mình khi chỉ có một Manager → 409 `LAST_MANAGER`.

## 8. Giả định & quyết định (Q31–Q38 ✅ theo đề xuất, 2026-09-26)
- **Q31** Tách M1-04 thành M1-04a (API) và M1-04b (giao diện)? *Đề xuất: có* — giống M1-01; phần luật "Manager cuối cùng" và thu hồi phiên là code bảo mật nên duyệt riêng.
- **Q32** Mã nhân viên do hệ thống tự sinh hay Manager nhập? *Đề xuất: tự sinh* `NV` + số tiếp theo (NV016…), không sửa được — tránh trùng/sai định dạng.
- **Q33** Mật khẩu ban đầu và khi cấp lại: hệ thống tự tạo hay Manager tự gõ? *Đề xuất: hệ thống tạo* mật khẩu tạm ngẫu nhiên, dễ đọc (10 ký tự, không có ký tự dễ nhầm 0/O, 1/l), chỉ hiện **một lần** cho Manager chép gửi nhân viên; nhân viên buộc đổi ở lần đăng nhập đầu (không có email để gửi — PRD §5).
- **Q34** Khoá tài khoản có đăng xuất nhân viên ngay trên mọi thiết bị? *Đề xuất: có* (thu hồi mọi phiên). Đầu việc đang giao cho người bị khoá xử lý ở M4-02 (thành "Cần giao lại").
- **Q35** Manager có được tự khoá chính mình? *Đề xuất: không* (tránh tự khoá mình ra ngoài). Được bỏ vai trò Manager của chính mình nếu vẫn còn Manager khác đang hoạt động.
- **Q36** Quản lý kỹ thuật (có `employee.read` trong YAML) xem được những gì? *Đề xuất:* danh sách + chi tiết (tên, mã, email, SĐT, bộ phận, chức danh, vai trò, trạng thái), chỉ đọc, mở bằng đường dẫn `/employees` (menu "Nhân sự" vẫn chỉ cho Manager theo YAML; màn "Lịch & tải việc" ở M4-04 sẽ dùng dữ liệu này).
- **Q37** Nhân viên bị **tạm khoá** do sai mật khẩu 5 lần: Manager mở bằng cách nào? *Đề xuất:* "Cấp lại mật khẩu" xoá luôn trạng thái tạm khoá; không có nút riêng (tạm khoá tự hết sau 15').
- **Q38** Ghi nhật ký các thao tác này? *Đề xuất:* như Q23 — ghi log ứng dụng ngay (không kèm mật khẩu), chuyển sang `audit_events` khi có M1-05.
- Giả định kỹ thuật: email đổi được (duy nhất, không phân biệt hoa thường), đổi email không đăng xuất phiên; tìm kiếm không dấu ("kho" khớp "Khoa", "tuan" khớp "Tuấn"); danh sách không trả nhân viên đã xoá (không có xoá).
