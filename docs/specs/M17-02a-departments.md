# M17-02a — Danh sách phòng ban

- **Status:** Approved (2026-10-28, chủ dự án duyệt nguyên các giả định ở §8, gồm Q102–Q104 theo mặc định)
- **Backlog:** M17-02a · **Milestone:** M17
- **Liên quan:** `spec/permissions.yaml` (`employee.read`/`employee.manage`, menu mới `departments`); khuôn mẫu M16-07 (`docs/specs/M16-07-product-service-groups.md`); DOMAIN_MODEL §Employee (`department`); tiếp theo: M17-02b (nối nhân viên vào danh sách này)

## 1. Mục tiêu
Là Manager, tôi muốn tự quản lý danh sách phòng ban (thêm, đổi tên, ngừng/mở lại hoạt động) thay vì 3 giá trị cố định trong code, để khai báo đúng cơ cấu thực tế của SMYou.

## 2. Phạm vi
- Trong phạm vi:
  - Entity mới `departments` (`id`, `name`, `is_active`, `version`, `created_at`, `updated_at`) — cùng khuôn `product_service_groups` (M16-07).
  - Tạo, sửa tên, ngừng hoạt động / mở lại hoạt động (command riêng, không `PATCH is_active`). **Không xoá cứng.**
  - `name` bắt buộc, trim, 1–100 ký tự; duy nhất (không phân biệt hoa/thường, sau trim) trong các phòng ban **đang hoạt động**.
  - Mọi thao tác ghi `audit_events` (`entity_type="DEPARTMENT"`, action `create` / `rename` / `deactivate` / `activate` — cùng kiểu audit của nhân viên).
  - Seed bằng migration, UUID cố định, đều `is_active=true` — xem §8 Q102 về 3 phòng cũ:
    - 3 phòng chủ dự án yêu cầu: "Phát Triển Kinh Tế", "Nhân sự/marketing", "Kế Toán - tài chính".
    - 3 phòng ứng với enum hiện tại (để M17-02b chuyển nhân viên cũ không mất thông tin): "Ban quản lý" (`MANAGEMENT`), "Kinh doanh" (`SALES`), "Kỹ thuật" (`TECHNICAL`).
  - Màn hình "Phòng ban" (`/settings/departments`) + menu.
- Ngoài phạm vi: gắn phòng ban vào nhân viên (M17-02b); trưởng phòng, phòng ban cha/con; phòng ban quyết định quyền (vẫn chỉ là thông tin tổ chức — GLOSSARY); import CSV.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-033 | DB vừa migrate xong | Nguyễn Văn An (MANAGER) gọi `GET /api/v1/departments` | 200; đúng 6 phòng ban seed ở §2, đều `is_active=true`, `version=1`, sắp theo tên | integration |
| AC-EMP-034 | An (MANAGER) | `POST /api/v1/departments` `{"name": "  Chăm sóc khách hàng "}` | 201; `name="Chăm sóc khách hàng"` (đã trim), `is_active=true`, `version=1`; 1 audit DEPARTMENT `create` actor=An | integration |
| AC-EMP-035 | Đã có "Kế Toán - tài chính" đang hoạt động | An `POST` `{"name": "kế toán - TÀI CHÍNH"}` | 409 `DUPLICATE_NAME`; không tạo bản ghi | integration |
| AC-EMP-036 | "Kinh doanh" đã ngừng hoạt động | An `POST` `{"name": "Kinh doanh"}` | 201 (trùng tên phòng đã ngừng hoạt động vẫn tạo được) | integration |
| AC-EMP-037 | An | `POST` với `name` rỗng/chỉ khoảng trắng, hoặc 101 ký tự | 422 `VALIDATION_ERROR`, lỗi ở trường `name` | integration |
| AC-EMP-038 | "Nhân sự/marketing" `version=1` | An `PATCH /api/v1/departments/{id}` `{"name": "Nhân sự - Marketing", "version": 1}` | 200; tên đổi, `version=2`; audit DEPARTMENT `rename` có tên cũ + mới | integration |
| AC-EMP-039 | "Nhân sự/marketing" đã lên `version=2` | An `PATCH` hoặc `POST .../deactivate` kèm `version: 1` | 409 `STALE_VERSION`; dữ liệu không đổi | integration |
| AC-EMP-040 | Đổi tên trùng 1 phòng khác đang hoạt động ("Kỹ thuật") | An `PATCH` `{"name": "kỹ thuật", "version": n}` | 409 `DUPLICATE_NAME` | integration |
| AC-EMP-041 | "Phát Triển Kinh Tế" đang hoạt động | An `POST .../deactivate` `{version}` → rồi `POST .../activate` `{version}` | lần 1: 200 `is_active=false`, audit DEPARTMENT `deactivate`; lần 2: 200 `is_active=true`, audit DEPARTMENT `activate` | integration |
| AC-EMP-042 | Phòng đã ngừng hoạt động | `POST .../deactivate` lại | 409 `INVALID_STATE` (tương tự `activate` khi đang hoạt động) | integration |
| AC-EMP-043 | Mở lại 1 phòng trong khi đã có phòng khác đang hoạt động cùng tên | `POST .../activate` | 409 `DUPLICATE_NAME`; vẫn `is_active=false` | integration |
| AC-EMP-044 | Trần Thị Hoa (TECH_LEAD, có `employee.read`) | `GET /api/v1/departments` / `POST /api/v1/departments` | GET 200; POST 403 `FORBIDDEN` | integration |
| AC-EMP-045 | Lê Văn Bình (SALE), Phạm Minh Tú (TECHNICIAN), Đỗ Thu (CUSTOMER_CARE) | gọi bất kỳ endpoint `/departments` | 403 `FORBIDDEN` | integration + generated |
| AC-EMP-046 | `GET /api/v1/departments?is_active=true&q=kinh` | gọi | chỉ trả phòng đang hoạt động có tên chứa "kinh" (không dấu/hoa thường như tìm sản phẩm) | integration |
| AC-EMP-047 | An mở menu "Phòng ban", desktop 1440px | render | Bảng cột "Tên phòng ban", "Trạng thái" (badge "Đang hoạt động"/"Ngừng hoạt động"), "Thao tác"; nút "Thêm phòng ban"; ô tìm kiếm + lọc trạng thái | component + e2e |
| AC-EMP-048 | An ở 390px | render | Danh sách dạng thẻ (tên + badge), nút "Thêm phòng ban" vùng chạm ≥ 44px; không cuộn ngang | e2e |
| AC-EMP-049 | An bấm "Thêm phòng ban", nhập tên trùng | Lưu | Sheet hiện lỗi dưới ô "Tên phòng ban": "Tên phòng ban đã tồn tại."; thành công → toast "Đã thêm phòng ban." và dòng mới trong danh sách | component |
| AC-EMP-050 | An bấm "Ngừng hoạt động" trên 1 phòng | xác nhận hộp thoại | toast "Đã ngừng hoạt động phòng ban."; badge đổi; bấm "Mở lại hoạt động" → toast "Đã mở lại hoạt động phòng ban." | component |
| AC-EMP-051 | Hoa (TECH_LEAD) / Bình (SALE) | xem menu | không thấy mục "Phòng ban"; vào thẳng `/settings/departments` → màn "Không có quyền" | component |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/departments | employee.read | `q`, `is_active`, `limit`, `offset` | `Page[Department]` | 403 |
| GET | /api/v1/departments/{id} | employee.read | — | `Department` | 403, 404 |
| POST | /api/v1/departments | employee.manage | `{ name }` | `Department` (201) | 403, 409, 422 |
| PATCH | /api/v1/departments/{id} | employee.manage | `{ name, version }` | `Department` | 403, 404, 409, 422 |
| POST | /api/v1/departments/{id}/deactivate | employee.manage | `{ version }` | `Department` | 403, 404, 409 |
| POST | /api/v1/departments/{id}/activate | employee.manage | `{ version }` | `Department` | 403, 404, 409 |

`Department = { id, name, is_active, version, created_at, updated_at }`. Không capability mới.

## 5. Dữ liệu / Migration
- Bảng `departments` (`id uuid pk`, `name varchar(100) not null`, `is_active boolean not null default true`, `version int not null default 1`, `created_at`, `updated_at timestamptz`); unique index `lower(btrim(name)) WHERE is_active`.
- Seed 6 dòng với UUID cố định (M17-02b dùng 3 UUID của "Ban quản lý"/"Kinh doanh"/"Kỹ thuật" để map `employees.department`).
- Chưa đụng bảng `employees` ở item này.

## 6. UI
- Menu: mục mới "Phòng ban" (icon `Network`, path `/settings/departments`, capability `employee.manage`) ngay dưới "Nhân sự & phân quyền".
- Màn hình rút gọn từ màn "Nhóm sản phẩm/dịch vụ" (M16-07): bảng (desktop) / thẻ (mobile), Sheet thêm/sửa chỉ có ô "Tên phòng ban" (bắt buộc), nút "Ngừng hoạt động"/"Mở lại hoạt động" có hộp thoại xác nhận.
- Copy: "Phòng ban", "Thêm phòng ban", "Sửa phòng ban", "Tên phòng ban", "Lưu", "Huỷ"; lỗi: "Vui lòng nhập tên phòng ban.", "Tên phòng ban đã tồn tại.", "Dữ liệu đã thay đổi, vui lòng tải lại." (STALE_VERSION); trống: "Chưa có phòng ban nào."

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → menu "Phòng ban" → thấy 6 phòng seed.
2. Thêm "Chăm sóc khách hàng"; thử thêm lại "chăm sóc khách hàng" → báo trùng.
3. Đổi tên "Nhân sự/marketing" → "Nhân sự - Marketing"; ngừng hoạt động rồi mở lại.
4. Đăng nhập Sale → không thấy menu "Phòng ban".

## 8. Giả định & câu hỏi
- **Q102 (cần chốt):** Nhân viên hiện có đang ở 3 bộ phận cũ "Ban quản lý"/"Kinh doanh"/"Kỹ thuật", không khớp 3 phòng mới yêu cầu. Mặc định đề xuất: seed **6** phòng (3 mới + 3 cũ) để không mất dữ liệu nhân viên cũ; anh/chị tự chuyển nhân viên sang phòng mới và ngừng hoạt động phòng cũ khi muốn. Phương án khác: chỉ seed 3 phòng mới và chỉ định map cũ → mới (vd. Kinh doanh → "Phát Triển Kinh Tế"?; Kỹ thuật → ?).
- **Q103:** Quyền: dùng lại `employee.manage` (chỉ Manager) để thêm/sửa, `employee.read` (Manager, QLKT) để xem — không tạo capability mới (giống M16-07 dùng lại `catalog.*`).
- **Q104:** Vị trí menu: mục riêng "Phòng ban" dưới "Nhân sự & phân quyền" (không gộp thành tab trong màn Nhân sự).
- Giả định: được ngừng hoạt động phòng ban đang có nhân viên (nhân viên vẫn giữ phòng đó — chi tiết ở M17-02b); không xoá cứng.
- Không cần sửa `spec/state_machines.yaml`. `spec/permissions.yaml` chỉ thêm menu:
  ```yaml
  +  - id: departments
  +    label: Phòng ban
  +    icon: Network
  +    path: /settings/departments
  +    capability: employee.manage
  ```
