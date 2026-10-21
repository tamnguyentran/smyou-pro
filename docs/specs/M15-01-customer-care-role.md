# M15-01 — Vai trò CSKH & ràng buộc gán vai trò cho Manager

- **Status:** Approved
- **Approval:** chủ dự án duyệt theo giả định mặc định ở §8 (2026-10-21) — "bắt đầu thực hiện"
- **Backlog:** M15-01 · **Milestone:** M15
- **Liên quan:** `spec/permissions.yaml` (roles, capabilities `order.create`/`order.edit_draft`/`customer.manage`/`catalog.read`); `docs/product/DOMAIN_MODEL.md` §1 (`employee_roles`, "luôn còn ≥ 1 MANAGER đang hoạt động"); `docs/specs/M1-04a-employees-api.md` (`POST /employees/{id}/roles`, Q35 "Manager cuối cùng"); `docs/specs/M1-04b-employees-ui.md` (form gán vai trò); `docs/product/GLOSSARY.md`

## 1. Mục tiêu
Là Quản lý chung, tôi muốn có thêm vai trò **CSKH** và ràng buộc hợp lý khi gán vai trò, để một nhân viên có thể kết hợp Sale/CSKH/Kỹ thuật viên tuỳ nhu cầu, còn người giữ vai trò Manager luôn có đủ quyền Sale/CSKH/Quản lý kỹ thuật nhưng không thể đồng thời là Nhân viên kỹ thuật.

## 2. Phạm vi
- Trong phạm vi:
  - Thêm role `CUSTOMER_CARE` (nhãn "Chăm sóc khách hàng") vào `spec/permissions.yaml#roles`.
  - Capability mới `customer_care.manage_feedback` (dùng ở M15-02a) — khai báo khung ở item này, gán quyền ở M15-02a.
  - Mở rộng cho `CUSTOMER_CARE`: `order.create: all`, `order.edit_draft: own`, `customer.manage: all`, `catalog.read: all` (giống `SALE`) — để CSKH tạo đơn mới khi khách gọi đặt hàng (yêu cầu gốc mục 1, nhánh "tạo đơn hàng mới").
  - `order.read`: thêm `CUSTOMER_CARE: all` (CSKH cần tra cứu mọi đơn để gọi khảo sát, không chỉ đơn do mình tạo) — dùng ở M15-02a nhưng khai báo quyền tại đây vì đụng cùng dòng YAML.
  - Ràng buộc gán vai trò ở `POST /employees/{id}/roles` (không đổi chữ ký API, chỉ thêm luật xác thực): nếu `roles[]` gửi lên **có** `MANAGER` → server (a) từ chối nếu `roles[]` cũng có `TECHNICIAN` (422 `ROLE_CONFLICT`), (b) lưu lại là **hợp của** `roles[]` và `{MANAGER, SALE, CUSTOMER_CARE, TECH_LEAD}` (tự thêm 3 role còn thiếu). Nếu `roles[]` gửi lên **không có** `MANAGER` → lưu đúng y như gửi lên (API vốn đã thay **toàn bộ** tập vai trò, nên gỡ `MANAGER` ở lần sửa sau tự nhiên gỡ luôn các vai trò kèm theo nếu admin không liệt kê lại chúng — không cần logic "tự gỡ" riêng).
  - UI gán vai trò (M1-04b): khi tick "Quản lý chung" → tự tick và khoá (không cho bỏ tick) "Sale", "CSKH", "Quản lý kỹ thuật"; ẩn hoặc khoá-không-tick-được ô "Nhân viên kỹ thuật"; bỏ tick "Quản lý chung" → mở khoá lại toàn bộ ô.
- Ngoài phạm vi: màn hình/API nghiệp vụ riêng của CSKH (tra cứu đơn, ghi phản hồi, yêu cầu chỉnh sửa) — xem M15-02a/b, M15-03. Dashboard/menu cho CSKH — xem M15-04, M15-11.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-019 | An (MANAGER) sửa vai trò của Hoa, `version` đúng | `POST /employees/{hoa}/roles {version, roles:["MANAGER"]}` | 200; `EmployeeDetail.roles` = `["MANAGER","SALE","CUSTOMER_CARE","TECH_LEAD"]` (thứ tự không quan trọng) | integration |
| AC-EMP-020 | An sửa vai trò của Hoa | `POST /employees/{hoa}/roles {version, roles:["MANAGER","TECHNICIAN"]}` | 422 `ROLE_CONFLICT`, `errors[].field = "roles"`, thông điệp "Quản lý chung không thể đồng thời là Nhân viên kỹ thuật."; không lưu thay đổi | integration |
| AC-EMP-021 | An sửa vai trò của Khoa (không phải Manager) | `POST /employees/{khoa}/roles {version, roles:["SALE","CUSTOMER_CARE"]}` | 200; `roles = ["SALE","CUSTOMER_CARE"]` đúng y, không tự thêm gì khác | integration |
| AC-EMP-022 | An sửa vai trò của Khoa | `POST /employees/{khoa}/roles {version, roles:["SALE","CUSTOMER_CARE","TECHNICIAN"]}` | 200 — kết hợp tự do kể cả Kỹ thuật viên khi không có Manager trong danh sách | integration |
| AC-EMP-023 | An hiện có `roles=["MANAGER","SALE","CUSTOMER_CARE","TECH_LEAD"]`; còn ≥1 Manager khác đang hoạt động | An tự sửa vai trò mình: `roles:["TECH_LEAD"]` | 200; `roles = ["TECH_LEAD"]` — các vai trò từng kèm theo Manager bị gỡ theo vì không được liệt kê lại (không có logic "giữ lại" riêng) | integration |
| AC-EMP-024 | Form sửa vai trò (M1-04b), chưa tick gì | Tick "Quản lý chung" | "Sale", "CSKH", "Quản lý kỹ thuật" tự tick và khoá (disabled, không gỡ tick được); ô "Nhân viên kỹ thuật" bị khoá ở trạng thái chưa tick; bỏ tick "Quản lý chung" → tất cả mở khoá lại, giữ nguyên lựa chọn hiện tại | component |
| AC-EMP-025 | Lan chỉ có vai trò `CUSTOMER_CARE` | Lan gọi `POST /api/v1/orders {...}` | 201 (trước item này sẽ là 403 vì `order.create` chưa cấp cho `CUSTOMER_CARE`) | integration |
| AC-EMP-026 | Lan chỉ có vai trò `CUSTOMER_CARE` | Lan gọi `GET /api/v1/orders/{id}` của đơn do Sale khác tạo | 200 (scope `all`, không bị chặn như `own`) | integration |

## 4. API
Không có route mới. Sửa guard của route đã có:

| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/employees/{id}/roles | employee.manage | Thêm kiểm `ROLE_CONFLICT` + hợp vai trò khi `roles[]` chứa `MANAGER`, như §3 |
| POST | /api/v1/orders | order.create | Thêm `CUSTOMER_CARE` vào bảng quyền |
| GET | /api/v1/orders, /api/v1/orders/{id} | order.read | Thêm `CUSTOMER_CARE: all` |

## 5. Dữ liệu / Migration
Không có migration DB (role là enum trong code/YAML, không phải bảng riêng — thêm 1 giá trị enum `CUSTOMER_CARE` vào `employee_roles.role` nếu cột này là Postgres enum type, cần 1 migration `ALTER TYPE ... ADD VALUE`).

## 6. UI
- Form gán vai trò (trang Nhân sự, M1-04b): thêm checkbox "CSKH"; hành vi khoá/tự-tick như AC-EMP-024.
- Không có màn hình mới ở item này.

## 7. Kịch bản UAT thủ công
1. Vào "Nhân sự & phân quyền", mở 1 nhân viên, tick "Quản lý chung" → quan sát 3 ô Sale/CSKH/QLKT tự tick và khoá, ô Kỹ thuật viên bị khoá.
2. Lưu lại, mở lại nhân viên khác (không Manager), tick tự do Sale + CSKH + Kỹ thuật viên cùng lúc → lưu thành công.
3. Tạo 1 nhân viên chỉ có vai trò CSKH, đăng nhập, vào "Đơn hàng" → tạo đơn mới thành công.

## 8. Giả định & câu hỏi
- Giả định: kết hợp TECH_LEAD + TECHNICIAN (không có MANAGER) vẫn được phép — yêu cầu gốc chỉ cấm Manager+Kỹ thuật viên, không cấm QLKT+Kỹ thuật viên trên cùng 1 người.
- Giả định: `customer_care.manage_feedback` chỉ khai *tên* capability ở item này; gán cho role nào + dùng ở route nào quyết ở M15-02a (tránh 1 item đụng 2 chỗ không liên quan).
- Câu hỏi mới (→ `OPEN_QUESTIONS.md`): nhãn hiển thị tiếng Việt chính xác cho role `CUSTOMER_CARE` trên badge/menu là "CSKH" hay "Chăm sóc khách hàng" đầy đủ? Giả định dùng "CSKH" cho badge ngắn (bảng/thẻ), "Chăm sóc khách hàng" cho nơi còn chỗ (dropdown chọn vai trò).
