# M17-02b — Nhân viên chọn phòng ban từ danh sách

- **Status:** Approved (2026-10-28, chủ dự án duyệt nguyên các giả định ở §8, gồm Q102–Q104 theo mặc định)
- **Backlog:** M17-02b · **Milestone:** M17 · **Phụ thuộc:** M17-02a
- **Liên quan:** `backend/app/modules/employees/` (`Department` Literal), `backend/app/modules/identity/` (`DEPARTMENTS`, bootstrap Manager, `/me`), `frontend/src/features/employees/` (`DEPARTMENT_LABELS`, `EmployeeFormSheet`); DOMAIN_MODEL §Employee; khuôn mẫu M16-08 (`division` enum → `division_id`)

## 1. Mục tiêu
Là Manager, khi tạo/sửa nhân viên tôi muốn chọn phòng ban từ danh sách đã khai báo ở màn "Phòng ban", thay cho 3 bộ phận cố định trong code.

## 2. Phạm vi
- Trong phạm vi:
  - `employees.department` (enum chuỗi `MANAGEMENT`/`SALES`/`TECHNICAL`) → `employees.department_id uuid not null` FK `departments.id`. Migration map dữ liệu cũ theo UUID seed ở M17-02a: `MANAGEMENT`→"Ban quản lý", `SALES`→"Kinh doanh", `TECHNICAL`→"Kỹ thuật"; xoá cột + check constraint cũ.
  - API nhân viên: request đổi `department` → `department_id`; response trả `department: { id, name, is_active }`. `/auth/me` trả `employee.department` dạng `{ id, name }`.
  - Validate: `department_id` phải **tồn tại**; khi **tạo mới** hoặc **đổi sang phòng khác** thì phòng đích phải đang hoạt động. Giữ nguyên phòng đã ngừng hoạt động khi sửa trường khác là hợp lệ.
  - Lệnh bootstrap Manager đầu tiên gán phòng "Ban quản lý".
  - UI: ô "Bộ phận" đổi tên thành **"Phòng ban"**, `<select>` lấy từ `GET /api/v1/departments?is_active=true`; xoá `DEPARTMENT_LABELS`.
  - Audit sửa nhân viên vẫn ghi `changed_fields` như hiện tại (trường tên `department_id`).
- Ngoài phạm vi: lọc danh sách nhân viên theo phòng ban; báo cáo theo phòng ban; phòng ban ảnh hưởng quyền.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-052 | DB trước migration có Phạm Minh Tú `TECHNICAL`, Lê Văn Bình `SALES`, An `MANAGEMENT` | chạy migration | Tú → "Kỹ thuật", Bình → "Kinh doanh", An → "Ban quản lý"; không nhân viên nào thiếu phòng; downgrade trả lại đúng enum cũ | integration (migration) |
| AC-EMP-053 | An (MANAGER); "Kế Toán - tài chính" đang hoạt động | `POST /api/v1/employees` với `department_id` của phòng đó | 201; response `department.name="Kế Toán - tài chính"` | integration |
| AC-EMP-054 | Phòng "Kinh doanh" đã ngừng hoạt động | An tạo nhân viên mới với `department_id` của "Kinh doanh" | 422 `DEPARTMENT_INACTIVE` tại trường `department_id` | integration |
| AC-EMP-055 | `department_id` là UUID không tồn tại / thiếu trường | An tạo nhân viên | 422 (`DEPARTMENT_NOT_FOUND` / `VALIDATION_ERROR`) tại `department_id` | integration |
| AC-EMP-056 | Bình thuộc "Kinh doanh", phòng này đã ngừng hoạt động | An `PATCH` Bình chỉ đổi `phone` (không gửi `department_id` hoặc gửi đúng id cũ) | 200; Bình vẫn ở "Kinh doanh" | integration |
| AC-EMP-057 | Bình thuộc "Kinh doanh" | An `PATCH` Bình `department_id` → "Phát Triển Kinh Tế" (đang hoạt động) | 200; audit EMPLOYEE `update` `changed_fields` chứa `department_id`; sang phòng đã ngừng hoạt động → 422 `DEPARTMENT_INACTIVE` | integration |
| AC-EMP-058 | Tú đăng nhập | `GET /api/v1/auth/me` | `employee.department = { id, name: "Kỹ thuật" }` | integration |
| AC-EMP-059 | DB trống | chạy lệnh bootstrap Manager đầu tiên | Manager được tạo với phòng "Ban quản lý" | integration |
| AC-EMP-060 | An mở "Thêm nhân viên" | mở ô "Phòng ban" | Chỉ liệt kê phòng đang hoạt động (6 phòng seed nếu chưa ngừng phòng nào); bỏ trống → "Vui lòng chọn phòng ban." | component |
| AC-EMP-061 | An mở sửa Bình (phòng "Kinh doanh" đã ngừng hoạt động) | xem form | Ô "Phòng ban" vẫn hiện "Kinh doanh (ngừng hoạt động)" là giá trị hiện tại; lưu không đổi phòng → thành công | component |
| AC-EMP-062 | Hoa (TECH_LEAD) xem chi tiết nhân viên Tú | render | Dòng "Phòng ban: Kỹ thuật" (tên lấy từ API, không còn nhãn hard-code) | component |
| AC-EMP-063 | An ở 390px và 1440px | tạo nhân viên chọn "Nhân sự/marketing" end-to-end | Lưu thành công, danh sách nhân viên hiển thị phòng ban mới | e2e |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/employees | employee.manage | body `department` → `department_id: uuid` (bắt buộc) |
| PATCH | /api/v1/employees/{id} | employee.manage | body `department` → `department_id: uuid` (tuỳ chọn) |
| GET | /api/v1/employees, /employees/{id} | employee.read | `department: { id, name, is_active }` |
| GET | /api/v1/auth/me | (đăng nhập) | `employee.department: { id, name }` |

Lỗi mới: 422 `DEPARTMENT_INACTIVE`, 422 `DEPARTMENT_NOT_FOUND`. Chạy `make contract`.

## 5. Dữ liệu / Migration
- Thêm `employees.department_id uuid` FK `departments.id` (`ON DELETE RESTRICT`), index; backfill theo map ở §2; set `NOT NULL`; drop `employees.department` + `ck_employees_department`. Downgrade map ngược (phòng không thuộc 3 phòng cũ → `MANAGEMENT`).
- DOMAIN_MODEL §Employee: `department` enum → `department_id` → Department; GLOSSARY "Bộ phận" → "Phòng ban".

## 6. UI
- `EmployeeFormSheet`: nhãn "Phòng ban"; `<select>` từ API (hook dùng lại của M17-02a), placeholder "Chọn phòng ban"; nếu phòng hiện tại đã ngừng hoạt động thì thêm 1 option "<tên> (ngừng hoạt động)".
- Chế độ xem chi tiết: "Phòng ban" + `department.name`.
- Không đổi layout khác.

## 7. Kịch bản UAT thủ công
1. Mở "Nhân sự & phân quyền" → nhân viên cũ vẫn hiện đúng phòng ("Kinh doanh", "Kỹ thuật"…).
2. Thêm nhân viên mới, chọn "Kế Toán - tài chính" → lưu, kiểm tra chi tiết.
3. Ngừng hoạt động "Kinh doanh" ở màn "Phòng ban" → form thêm nhân viên không còn "Kinh doanh"; sửa 1 nhân viên đang ở "Kinh doanh" vẫn lưu được.

## 8. Giả định & câu hỏi
- Phụ thuộc Q102 (M17-02a): nếu chủ dự án chọn chỉ seed 3 phòng mới, bảng map §2 đổi theo map được chốt.
- Giả định: phòng ban vẫn **bắt buộc** với mọi nhân viên (như hiện nay).
- Giả định: không chặn ngừng hoạt động phòng đang có nhân viên; nhân viên giữ phòng cũ cho tới khi Manager đổi.
- Giả định: đổi nhãn UI "Bộ phận" → "Phòng ban" ở mọi chỗ.
- Không cần sửa `spec/*.yaml`.
