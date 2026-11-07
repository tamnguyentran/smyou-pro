# M20-07 — Dữ liệu: gộp "Phòng ban" về 3 phòng chuẩn + chặn ngừng phòng còn nhân viên

- **Status:** Approved (2026-11-01 — chủ dự án duyệt; Q137, Q138 theo mặc định; phòng cũ **xoá hẳn** sau khi chuyển nhân viên)
- **Backlog:** M20-07 · **Milestone:** M20
- **Liên quan:** `docs/specs/M17-02a-departments.md` (bảng `departments`, 6 UUID seed cố định `d1111111-…` → `d6666666-…`), `docs/specs/M17-02b-employee-department-link.md` (`employees.department_id`), spec mẫu cùng kiểu `docs/specs/M20-06-product-service-groups-consolidate.md`

## 1. Mục tiêu
Là Manager, tôi muốn danh sách "Phòng ban" chỉ còn 3 phòng "Phát Triển Kinh Tế", "Nhân sự/Marketing", "Kế Toán - Tài chính"; nhân viên đang ở các phòng cũ (Ban quản lý, Kinh doanh, Kỹ thuật, và các phòng tự thêm như QLKT/Sale/CSKH) được chuyển sang "Phát Triển Kinh Tế"; và từ nay không ngừng hoạt động được phòng ban còn nhân viên trực thuộc.

## 2. Phạm vi
- Trong phạm vi:
  1. **1 Alembic migration dữ liệu mới** (không đổi schema):
     - Đặt lại 3 phòng chuẩn theo **UUID cố định** của M17-02a: `d4444444-…` "Phát Triển Kinh Tế", `d5555555-…` "Nhân sự/Marketing", `d6666666-…` "Kế Toán - Tài chính" — `name` đúng chính tả ở backlog (Q137), `is_active=true` (kể cả khi trước đó bị đổi tên/ngừng).
     - Mọi nhân viên (đang hoạt động **và** đã nghỉ) có `department_id` **không thuộc** 3 UUID trên → đổi thành "Phát Triển Kinh Tế", `version + 1`.
     - Mọi phòng không thuộc 3 UUID chuẩn (đang hoạt động hay đã ngừng) → **xoá hẳn** (chủ dự án chốt 2026-11-01), làm **sau** bước chuyển nhân viên. Bảng duy nhất có khoá ngoại tới `departments` là `employees.department_id` (`ON DELETE RESTRICT`) — đã chuyển hết nên xoá an toàn. Dòng `audit_events` cũ của các phòng này giữ nguyên (append-only, chỉ là lịch sử).
     - Downgrade: no-op dữ liệu (không khôi phục được mapping cũ — ghi trong docstring).
  2. **Luật mới ở command `deactivate`** (`POST /api/v1/departments/{id}/deactivate`): phòng còn ≥ 1 nhân viên **đang hoạt động** trực thuộc → 409 `DEPARTMENT_HAS_EMPLOYEES`, thông báo "Phòng ban còn {n} nhân viên đang hoạt động, hãy chuyển họ sang phòng khác trước khi ngừng hoạt động." (Q138 — nhân viên đã nghỉ không tính). Thay giả định cũ của M17-02a §8 ("được ngừng phòng đang có nhân viên").
  3. Code đang gán cứng phòng cũ phải trỏ sang "Phát Triển Kinh Tế": Manager bootstrap (`identity/service.py` — đang dùng `LEGACY_DEPARTMENT_IDS["MANAGEMENT"]`), seed e2e (`seed_e2e.py` — đang dùng `TECHNICAL`). Thêm hằng số UUID "Phát Triển Kinh Tế" cạnh `LEGACY_DEPARTMENT_IDS`.
  4. UI trang "Phòng ban": khi ngừng bị từ chối → hộp thoại xác nhận **giữ mở** và hiện thông báo lỗi trên (theo M20-04), badge không đổi.
- Ngoài phạm vi: chặn nút "Thêm phòng ban" (chốt 2026-10-31: **vẫn cho Thêm**); ghi `audit_events` cho thay đổi do migration (sửa dữ liệu, không phải chuyển trạng thái — như M20-06); đổi quyền (phòng ban vẫn không quyết định quyền); M20-08/09.

## 3. Acceptance Criteria

Dữ liệu chung cho AC-EMP-091…095 (DB ngay trước khi chạy migration M20-07):
- Phòng: "Ban quản lý", "Kinh doanh", "Kỹ thuật" (seed cũ, active); "Phát Triển Kinh Tế" (active); "Nhân sự/marketing" (seed, active); "Kế Toán - tài chính" (đã bị ngừng); "CSKH" (tự thêm, active).
- Nhân viên: Nguyễn Văn An (MANAGER) → "Ban quản lý", `version` 2; Lê Văn Bình (SALE) → "Kinh doanh"; Phạm Minh Tú (TECHNICIAN) → "Kỹ thuật"; Đỗ Thu (CUSTOMER_CARE) → "CSKH"; Trần Văn Khoa (TECHNICIAN, **đã nghỉ**) → "Kỹ thuật"; Vũ Thị Lan (MANAGER) → "Kế Toán - tài chính", `version` 1.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-091 | Dữ liệu chung | `alembic upgrade` tới revision M20-07 | `GET /api/v1/departments?is_active=true` trả **đúng 3** phòng: "Kế Toán - Tài chính", "Nhân sự/Marketing", "Phát Triển Kinh Tế", đúng UUID `d6666666-…`/`d5555555-…`/`d4444444-…` | integration (migration) |
| AC-EMP-092 | Như trên | upgrade | An, Bình, Tú, Thu **và** Khoa (đã nghỉ) có `department_id` = "Phát Triển Kinh Tế"; `version` của An 2 → 3; vai trò, trạng thái hoạt động, tài khoản của họ không đổi | integration (migration) |
| AC-EMP-093 | Như trên | upgrade | Lan vẫn ở "Kế Toán - Tài chính", `version` vẫn 1 | integration (migration) |
| AC-EMP-094 | Như trên | upgrade | "Ban quản lý", "Kinh doanh", "Kỹ thuật", "CSKH" **không còn trong bảng `departments`** (xoá hẳn; `GET /api/v1/departments` không lọc trả đúng 3 phòng); `GET /api/v1/departments/{id Kỹ thuật}` → 404 `NOT_FOUND`; các dòng `audit_events` DEPARTMENT cũ của 4 phòng này vẫn còn | integration (migration) |
| AC-EMP-095 | Như trên | upgrade | Không phát sinh `audit_events` mới; chạy lại phần dữ liệu của migration trên DB đã chuẩn → không đổi gì, không lỗi (idempotent) | integration (migration) |
| AC-EMP-096 | Sau migration; "Phát Triển Kinh Tế" có 4 nhân viên đang hoạt động, `version` n | An (MANAGER) `POST /api/v1/departments/{PTKT}/deactivate` `{version: n}` | 409 `DEPARTMENT_HAS_EMPLOYEES`, message "Phòng ban còn 4 nhân viên đang hoạt động, hãy chuyển họ sang phòng khác trước khi ngừng hoạt động."; phòng vẫn `is_active=true`, `version` n; không có audit `deactivate` | integration |
| AC-EMP-097 | An thêm phòng "Kho vận"; chuyển Bình vào "Kho vận" rồi chuyển Bình ra lại "Phát Triển Kinh Tế" | An `POST .../{Kho vận}/deactivate` `{version}` | 200, `is_active=false`, audit DEPARTMENT `deactivate` (luồng cũ AC-EMP-041 vẫn đúng khi phòng trống) | integration |
| AC-EMP-098 | "Kho vận" chỉ còn Khoa (nhân viên **đã nghỉ**) trực thuộc — Q138 | An `POST .../deactivate` | 200 (nhân viên đã nghỉ không chặn); Khoa vẫn giữ `department_id` "Kho vận" | integration |
| AC-EMP-099 | "Kho vận" có Bình, An gửi `deactivate` với `version` cũ | gọi | 409 `STALE_VERSION` (kiểm `version` trước luật nhân viên — thứ tự như `_locked` hiện có) | integration |
| AC-EMP-100 | Trần Thị Hoa (TECH_LEAD), Bình (SALE) | `POST .../deactivate` lên phòng có/không có nhân viên | 403 `FORBIDDEN` (không lộ số nhân viên) | integration |
| AC-EMP-101 | DB mới tinh (chưa có nhân viên), chạy bootstrap tạo Manager đầu tiên | bootstrap | Manager thuộc "Phát Triển Kinh Tế" (không thuộc phòng đã ngừng) | integration |
| AC-EMP-102 | Sau migration; An mở "Nhân sự" → "Thêm nhân viên", desktop 1440px và mobile 390px | mở ô chọn "Phòng ban" | Chỉ 3 lựa chọn "Phát Triển Kinh Tế", "Nhân sự/Marketing", "Kế Toán - Tài chính" | e2e |
| AC-EMP-103 | An ở trang "Phòng ban", bấm "Ngừng hoạt động" trên "Phát Triển Kinh Tế" → xác nhận | API trả 409 `DEPARTMENT_HAS_EMPLOYEES` | Hộp thoại **vẫn mở**, hiện thông báo lỗi của server; badge vẫn "Đang hoạt động"; không có toast thành công | component |
| AC-EMP-104 | Sau migration; An mở trang "Phòng ban", 390px | render, lần lượt lọc "Tất cả" / "Ngừng hoạt động" | "Tất cả" thấy đúng 3 phòng chuẩn; "Ngừng hoạt động" trống — không còn "Ban quản lý", "Kinh doanh", "Kỹ thuật" | e2e |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/departments/{id}/deactivate | employee.manage | thêm lỗi 409 `DEPARTMENT_HAS_EMPLOYEES` (response OpenAPI liệt kê sẵn 409 — chỉ thêm `code` mới) |

Không endpoint mới, không đổi schema request/response.

## 5. Dữ liệu / Migration
- `make migration name=consolidate_departments`. Thứ tự trong `upgrade()` (tránh vi phạm unique index `lower(btrim(name)) WHERE is_active`):
  1. `UPDATE employees SET department_id = '<PTKT>', version = version + 1, updated_at = now() WHERE department_id NOT IN (<3 UUID>)`
  2. `DELETE FROM departments WHERE id NOT IN (<3 UUID>)`
  3. Với từng UUID chuẩn: `UPDATE … SET name = '<tên chuẩn>', is_active = true, version = version + 1 WHERE id = … AND (name <> '<tên chuẩn>' OR NOT is_active)`; không tồn tại → `INSERT` UUID cố định.
- `departments.service.set_active(active=False)`: sau `_locked` + kiểm `INVALID_STATE`, đếm `employees WHERE department_id = :id AND is_active` → > 0 thì 409.

## 6. UI
- Trang "Phòng ban": chỉ cần hộp thoại ngừng hoạt động giữ mở + hiện lỗi khi 409 (nếu `ConfirmDialog` đã làm theo M20-04 thì chỉ thêm test). Không màn mới.
- Hệ quả nhìn thấy: ô "Phòng ban" ở form nhân viên chỉ còn 3 lựa chọn; cột "Phòng ban" ở danh sách nhân sự hiện "Phát Triển Kinh Tế" cho người từ phòng cũ.

## 7. Kịch bản UAT thủ công
1. Trước nâng cấp: ghi lại vài nhân viên đang ở "Kinh doanh"/"Kỹ thuật"/phòng tự thêm.
2. Nâng cấp → "Phòng ban": chỉ còn 3 phòng chuẩn; phòng cũ đã bị xoá hẳn (lọc "Ngừng hoạt động" trống).
3. "Nhân sự": các nhân viên ở bước 1 giờ thuộc "Phát Triển Kinh Tế"; sửa 1 người sang "Nhân sự/Marketing" → lưu được.
4. "Phòng ban" → ngừng "Phát Triển Kinh Tế" → bị từ chối, thông báo số nhân viên còn lại.
5. Thêm phòng "Kho vận" (trống) → ngừng hoạt động được.

## 8. Giả định & câu hỏi
- **Chốt 2026-11-01:** phòng ngoài 3 phòng chuẩn bị **xoá hẳn** trong migration (không chỉ ngừng hoạt động). Luồng "Ngừng hoạt động" trên UI sau này vẫn là ngừng mềm như M17-02a.
- **Q137 (chốt 2026-11-01 — theo mặc định):** Seed hiện tại viết "Nhân sự/marketing", "Kế Toán - tài chính"; backlog viết "Nhân sự/Marketing", "Kế Toán - Tài chính". Mặc định: migration **đổi tên theo backlog** (viết hoa "Marketing", "Tài chính").
- **Q138 (chốt 2026-11-01 — theo mặc định):** "Chỉ ngừng hoạt động khi không còn nhân viên trực thuộc" — có tính nhân viên **đã nghỉ** không? Mặc định: **chỉ tính nhân viên đang hoạt động** (người đã nghỉ vẫn giữ phòng cũ, không chặn); riêng migration chuyển **cả** người đã nghỉ sang "Phát Triển Kinh Tế" để danh sách sạch.
- Giả định: không ghi `audit_events` cho việc migration chuyển phòng nhân viên (sửa dữ liệu một lần, giống M20-06); thay đổi phòng ban không ảnh hưởng quyền (GLOSSARY) nên không cần sửa `permissions.yaml`/khối "Cách phân quyền hoạt động".
- Giả định: "Ban quản lý" cũng gộp vào "Phát Triển Kinh Tế" (backlog ghi "cũ" — gồm cả 3 phòng seed cũ).
- Không cần đổi `spec/*.yaml` (luật mới là guard dữ liệu của danh mục phòng ban, không phải máy trạng thái trong `state_machines.yaml`).
