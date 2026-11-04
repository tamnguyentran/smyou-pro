# M21-01a — API: Thiết lập doanh thu KPI (chỉ tiêu "Thu nhập thuần" theo tháng)

- **Status:** Approved (2026-11-01, chủ dự án chốt Q146–Q156)
- **Backlog:** M21-01a · **Milestone:** M21
- **Liên quan:** spec/permissions.yaml#kpi_target.manage (mới), DOMAIN_MODEL (thực thể mới `employee_kpi_targets`), M17-02b (phòng ban của nhân viên), M20-08 (tìm nhân viên theo tên/SĐT/email)

## 1. Mục tiêu
Là Manager, tôi muốn đặt chỉ tiêu "Thu nhập thuần" (VND) cho từng nhân viên theo từng tháng, giữ lịch sử từng tháng, và copy nhanh chỉ tiêu sang các tháng sau, để làm mốc so sánh trong "Báo cáo KPI" (M21-02a).

## 2. Phạm vi
- Trong phạm vi:
  - Bảng mới `employee_kpi_targets`: mỗi (nhân viên, tháng) tối đa 1 bản ghi. Tháng cũ giữ nguyên khi đặt tháng mới → lịch sử theo tháng.
  - `GET /kpi-targets?month=YYYY-MM&department_id=&q=` — danh sách nhân viên **đang hoạt động** + nhân viên đã nghỉ **có** chỉ tiêu trong tháng đó; mỗi dòng có chỉ tiêu (hoặc `null`). `q` khớp tên / SĐT / email (không phân biệt hoa thường, bỏ dấu cách đầu/cuối — cùng cách khớp với `GET /employees`). Sắp theo mã NV tăng.
  - `PUT /kpi-targets/{employee_id}/{month}` — đặt/sửa chỉ tiêu (upsert), có `version` khi sửa bản ghi đã có.
  - `DELETE /kpi-targets/{employee_id}/{month}` — xoá chỉ tiêu tháng đó (về "chưa đặt").
  - `POST /kpi-targets/copy` — copy toàn bộ chỉ tiêu của tháng nguồn sang các tháng từ `from_month + 1` đến `to_month` (tối đa 12 tháng). `overwrite=false` (mặc định): chỉ điền nhân viên chưa có chỉ tiêu ở tháng đích; `overwrite=true`: ghi đè.
  - Mọi thay đổi ghi `audit_events` (`entity_type=KPI_TARGET`, `action ∈ kpi_target.set | kpi_target.delete | kpi_target.copy`).
  - Capability mới `kpi_target.manage: { MANAGER: all }`.
- Ngoài phạm vi: UI (M21-01b); báo cáo so sánh (M21-02a); chỉ tiêu theo chỉ số khác ngoài "Thu nhập thuần".

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-KPI-031 | NV005 Trần Thị Hoa, NV007 Lê Văn Tuấn đang hoạt động; tháng 2026-11 chưa đặt chỉ tiêu | An (MANAGER) `GET /kpi-targets?month=2026-11` | 200; có dòng NV005 và NV007, `target=null`, sắp theo mã NV | integration |
| AC-KPI-032 | Như AC-031 | An `PUT /kpi-targets/{Hoa}/2026-11` `{ net_revenue_target: 30000000 }` | 200; dòng Hoa `target=30000000`, `version=1`; 1 audit `kpi_target.set` có `data.month="2026-11"`, `data.to=30000000`, `data.from=null` | integration |
| AC-KPI-033 | Hoa có chỉ tiêu 2026-10 = 25.000.000 và 2026-11 = 30.000.000 | An sửa 2026-11 thành 35.000.000 | Tháng 2026-10 vẫn 25.000.000 (lịch sử giữ nguyên); 2026-11 = 35.000.000; audit `data.from=30000000, data.to=35000000` | integration |
| AC-KPI-034 | Hoa có chỉ tiêu 2026-11 `version=2` | An PUT với `version=1` | 409 `STALE_VERSION` | integration |
| AC-KPI-035 | — | PUT `net_revenue_target = -1`, hoặc `1.5`, hoặc > 10^13; hoặc `month=2026-13` / `2026-1` | 422 | integration |
| AC-KPI-036 | Hoa có chỉ tiêu 2026-11 | An `DELETE /kpi-targets/{Hoa}/2026-11` | 204; GET tháng 2026-11 dòng Hoa `target=null`; audit `kpi_target.delete` có `data.from` | integration |
| AC-KPI-037 | 2026-11: Hoa 30tr, Tuấn 20tr. 2026-12: Tuấn đã có 22tr | An `POST /kpi-targets/copy { from_month:"2026-11", to_month:"2027-01", overwrite:false }` | 200 `{ created: 3, overwritten: 0, skipped: 1 }`; 2026-12: Hoa 30tr, Tuấn **22tr** (giữ); 2027-01: Hoa 30tr, Tuấn 20tr; 1 audit `kpi_target.copy` tổng hợp | integration |
| AC-KPI-038 | Như AC-037 | Copy với `overwrite:true` | `{ created: 3, overwritten: 1, skipped: 0 }`; 2026-12 Tuấn = 20tr | integration |
| AC-KPI-039 | — | Copy với `to_month <= from_month`, hoặc `to_month` cách `from_month` > 12 tháng | 422 | integration |
| AC-KPI-040 | Tháng nguồn không có chỉ tiêu nào | Copy | 200 `{ created: 0, overwritten: 0, skipped: 0 }` | integration |
| AC-KPI-041 | Hoa thuộc phòng "Phát Triển Kinh Tế", Ngọc thuộc "Kế Toán - Tài chính" | `GET ?month=2026-11&department_id=<PTKT>` | Chỉ có Hoa | integration |
| AC-KPI-042 | Hoa SĐT 0903123456, email hoa@smyou.vn | `q=hoa`, `q=0903123`, `q=HOA@SMYOU` | Mỗi lần đều trả dòng Hoa, không trả Tuấn | integration |
| AC-KPI-043 | NV009 Phạm Minh đã nghỉ (INACTIVE), có chỉ tiêu 2026-10, không có 2026-11 | GET 2026-10 và 2026-11 | 2026-10 có Minh (kèm `employee_status=INACTIVE`); 2026-11 không có Minh | integration |
| AC-KPI-044 | Đăng nhập SALE, CUSTOMER_CARE, TECH_LEAD, TECHNICIAN | gọi bất kỳ endpoint `/kpi-targets*` | 403 | integration |
| AC-KPI-045 | — | PUT cho `employee_id` không tồn tại | 404 | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/kpi-targets | kpi_target.manage | `month` (bắt buộc, `YYYY-MM`), `department_id?`, `q?` | `list[KpiTargetRowOut]` `{ employee_id, employee_code, employee_name, department_name, employee_status, phone, email, target: int\|null, version: int\|null, updated_at\|null }` | 403, 422 |
| PUT | /api/v1/kpi-targets/{employee_id}/{month} | kpi_target.manage | `{ net_revenue_target: int, version?: int }` | `KpiTargetRowOut` | 403, 404, 409, 422 |
| DELETE | /api/v1/kpi-targets/{employee_id}/{month} | kpi_target.manage | — | 204 | 403, 404 |
| POST | /api/v1/kpi-targets/copy | kpi_target.manage | `{ from_month, to_month, overwrite: bool = false }` | `{ created, overwritten, skipped }` | 403, 422 |

## 5. Dữ liệu / Migration
- Bảng `employee_kpi_targets`: `id uuid PK`, `employee_id FK employees NOT NULL`, `month date NOT NULL` (luôn ngày 01, CHECK `extract(day from month)=1`), `net_revenue_target BIGINT NOT NULL CHECK >= 0`, `version int NOT NULL default 1`, `created_at/updated_at timestamptz`, `updated_by FK employees`. `UNIQUE (employee_id, month)`.
- `EntityType` thêm `KPI_TARGET`.
- `spec/permissions.yaml`: thêm `kpi_target.manage: { MANAGER: all }` (diff ở §8).

## 6. UI
Không có (M21-01b).

## 7. Kịch bản UAT thủ công
Kiểm qua UI ở M21-01b.

## 8. Giả định & câu hỏi
- Chốt 2026-11-01: copy có tuỳ chọn ghi đè, mặc định giữ chỉ tiêu đã có.
- Chốt Q146 (2026-11-01): màn hình quản lý và thiết lập chỉ tiêu **chỉ Manager** thấy và thao tác (`kpi_target.manage: { MANAGER: all }`, mọi vai trò khác 403 — AC-KPI-044, ẩn menu — kiểm ở M21-01b). Danh sách đặt chỉ tiêu gồm mọi nhân viên đang hoạt động.
- Chốt Q147 (2026-11-01, đồng ý giả định): Manager **sửa được cả tháng đã qua** (mọi lần sửa ghi audit). Không khoá tháng cũ.
- Chốt Q148 (2026-11-01, đồng ý giả định): Copy lấy **toàn bộ** chỉ tiêu tháng nguồn, không theo bộ lọc phòng ban/tìm kiếm đang dùng.
- Diff YAML đề xuất:
  ```yaml
  # capabilities, sau company.manage
  kpi_target.manage:     { MANAGER: all }   # M21-01a
  # menu organization.children, ngay sau employees
  - { id: kpi-targets, label: Thiết lập doanh thu KPI, icon: Target, path: /settings/kpi-targets, capability: kpi_target.manage }
  ```
