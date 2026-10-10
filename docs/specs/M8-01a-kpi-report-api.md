# M8-01a — Báo cáo KPI thô theo KTV: API + xuất CSV

- **Status:** Done
- **Backlog:** M8-01 (tách a/b theo mẫu M6-03) · **Milestone:** M8
- **Liên quan:** `spec/permissions.yaml#kpi.read` (`MANAGER: all, TECH_LEAD: all, TECHNICIAN: self` — capability đã có sẵn, dùng luôn, không sửa YAML; menu `reports` → `/reports/kpi` đã gắn capability này); `docs/product/OPEN_QUESTIONS_ARCHIVE.md` Q10 (✅ "v1 chỉ thu thập sự kiện + báo cáo số liệu thô; chưa chấm điểm" — item này KHÔNG tính điểm, chỉ số liệu thô); `docs/product/DOMAIN_MODEL.md` §1 (Employee/`employee_roles`) §8 (Task — `due_at`, `estimated_hours`) §9 (Assignment — `status`, `reject_reason_code`, `accepted_at/started_at/done_at/rejected_at`, `actual_hours`) §10 (DefectRecord — `excluded_from_kpi` đã có cột, chưa có route đọc/sửa); `docs/specs/M6-03a-revision-reopen-api.md` §5 (migration tạo `defect_records`, cột `excluded_from_kpi` "chỉ tạo sẵn cho M8-01"); `docs/specs/M1-05-audit-framework.md` AC-SYS-070 (mẫu `occurred_from`/`occurred_to`, biên ngày theo giờ Việt Nam); `docs/specs/M7-02-role-dashboard.md` (mẫu `_vn_day_start_utc`, response theo vai trò); `backend/app/modules/dispatch/models.py` (`Assignment`, `DefectRecord`), `backend/app/modules/employees/models.py` (`Employee`, `employee_roles`).

## 1. Mục tiêu
Là Quản lý kỹ thuật (QLKT) hoặc Quản lý (Manager), tôi muốn xem/xuất báo cáo số liệu thô theo từng kỹ thuật viên (KTV) trong một khoảng ngày — số task xong, % đúng hạn, số lần từ chối theo lý do, số lỗi bị ghi nhận, giờ ước tính so với thực tế — để theo dõi hiệu suất mà không cần tự cộng tay từ nhiều trang. Kỹ thuật viên xem được số liệu của chính mình.

## 2. Phạm vi
- **Trong phạm vi:**
  - `GET /api/v1/kpi/report?from=&to=&employee_id=` (capability `kpi.read`, dùng đúng scope có sẵn): trả 1 dòng số liệu **cho mỗi nhân viên có vai trò TECHNICIAN** (bất kể `is_active`, vì có thể đã nghỉ nhưng vẫn cần xem lại số liệu cũ), lọc theo `employee_id` nếu có.
    - `from`, `to`: ngày (`YYYY-MM-DD`, giờ Việt Nam), **bắt buộc**; biên bao gồm cả 2 ngày (00:00 ngày `from` → 23:59:59 ngày `to`, giờ VN), theo đúng mẫu `occurred_from/occurred_to` của `M1-05`.
    - `employee_id` (uuid, tuỳ chọn): MANAGER/TECH_LEAD dùng để lọc đúng 1 KTV; **bị bỏ qua** (không lỗi) khi actor chỉ có scope `self` (TECHNICIAN) — luôn chỉ trả dòng của chính actor.
    - Mỗi dòng gồm: `employee_id, employee_code, employee_full_name, employee_is_active` (để UI `M8-01b` hiện badge "Đã nghỉ" khi `false`), `completed_task_count` (số **assignment** `DONE` của người đó, `done_at` trong khoảng — 1 task nhiều người thì mỗi người tính riêng phần mình, theo đúng nguyên tắc "trạng thái phân công của chính người đó" đã dùng ở `M5-01`), `on_time_count`/`on_time_rate` (trong số `completed_task_count`, bao nhiêu có `done_at <= task.due_at`; `on_time_rate = null` nếu `completed_task_count == 0`, ngược lại số thực 0–1 làm tròn 4 chữ số), `rejection_counts` (object 5 khoá `BUSY/SICK/SKILL/DISTANCE/OTHER`, đếm assignment `REJECTED` của người đó với `rejected_at` trong khoảng, nhóm theo `reject_reason_code`) + `rejection_total`, `defect_count` (số `defect_records.employee_id = người đó` với `created_at` trong khoảng và `excluded_from_kpi = false`), `estimated_hours_total` (tổng `task.estimated_hours` của các assignment `DONE` tính ở `completed_task_count`), `actual_hours_total` + `actual_hours_missing_count` (tổng `assignment.actual_hours` **không null**; đếm riêng bao nhiêu assignment DONE thiếu `actual_hours` vì trường này tuỳ chọn — không được cộng như 0 làm sai lệch số liệu).
    - Không chấm điểm/xếp hạng (Q10) — chỉ số liệu thô, sắp theo `employee_code` tăng dần.
  - `GET /api/v1/kpi/report/export?from=&to=&employee_id=` — cùng capability/scope/tham số, trả file CSV (`text/csv; charset=utf-8`, BOM UTF-8 để Excel đọc đúng dấu, `Content-Disposition: attachment; filename="bao-cao-kpi-{from}_{to}.csv"`), các cột tương ứng 1:1 với JSON trên (không tổng hợp lại, không định dạng %, để số thô cho người dùng tự xử lý trong Excel nếu cần).
- **Ngoài phạm vi (không làm ở item này):**
  - Công thức chấm điểm/xếp hạng KTV (Q10 — chưa chốt, giữ mặc định "chưa chấm điểm").
  - API đánh dấu `excluded_from_kpi` trên `defect_records` (DOMAIN_MODEL §10 có đề cập QLKT đánh dấu được, nhưng backlog M8-01 không yêu cầu; không có item nào mở route này — thêm câu hỏi mới ở §8).
  - UI trang `/reports/kpi` (bảng, bộ lọc, nút xuất CSV) — `M8-01b`.
  - Lọc theo vai trò khác ngoài TECHNICIAN (vd KPI cho Sale/QLKT) — không có trong backlog, DOMAIN_MODEL chỉ nói KPI nhân viên kỹ thuật.
  - Phân trang — số lượng KTV nhỏ (thực tế công ty), trả hết 1 lần như `GET /me`.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-KPI-001 | Khoa (TECHNICIAN): 2 assignment `DONE` trong khoảng — A1 task T1 `due_at=2026-09-10 17:00`, `done_at=2026-09-10 15:00` (đúng hạn); A2 task T2 `due_at=2026-09-12 09:00`, `done_at=2026-09-12 14:00` (trễ); T1 `estimated_hours=2`, A1 `actual_hours=1.5`; T2 `estimated_hours=3`, A2 `actual_hours` không khai (null) | An (MANAGER) `GET /api/v1/kpi/report?from=2026-09-01&to=2026-09-30` | 200; có dòng Khoa: `completed_task_count=2`, `on_time_count=1`, `on_time_rate=0.5`, `estimated_hours_total=5`, `actual_hours_total=1.5`, `actual_hours_missing_count=1` | integration |
| AC-KPI-002 | Khoa có 3 assignment `REJECTED` trong khoảng: 2×`DISTANCE`, 1×`SICK`; 1 assignment `REJECTED` khác nhưng `rejected_at` **ngoài** khoảng (không tính) | An `GET /api/v1/kpi/report?from=…&to=…` (khoảng chỉ trùm 3 cái đầu) | dòng Khoa: `rejection_counts={BUSY:0,SICK:1,SKILL:0,DISTANCE:2,OTHER:0}`, `rejection_total=3` | integration |
| AC-KPI-003 | Khoa có 2 `defect_records` trong khoảng (`employee_id=Khoa`), 1 cái `excluded_from_kpi=true` (QLKT đã loại trừ) | An `GET /api/v1/kpi/report?from=…&to=…` | dòng Khoa: `defect_count=1` (chỉ cái chưa bị loại trừ) | integration |
| AC-KPI-004 | Công ty có 3 KTV đang `is_active=true` (Khoa, Minh, Lan) và 1 KTV đã `is_active=false` (Đạt, có dữ liệu DONE cũ trong khoảng); không ai lọc `employee_id` | An `GET /api/v1/kpi/report?from=…&to=…` | 200; **4** dòng (gồm cả Đạt dù đã nghỉ), sắp theo `employee_code` tăng; KTV không có hoạt động nào trong khoảng vẫn có dòng với mọi số = 0, `on_time_rate=null` (không bị loại khỏi danh sách) | integration |
| AC-KPI-005 | Như AC-KPI-004 | An `GET /api/v1/kpi/report?from=…&to=…&employee_id=Khoa.id` | 200; chỉ **1** dòng (Khoa) | integration |
| AC-KPI-006 | — | An `GET /api/v1/kpi/report?from=…&to=…&employee_id=<id của Hoa, SALE không có vai trò TECHNICIAN>` | 404 `NOT_FOUND` | integration |
| AC-KPI-007 | Tuấn (TECH_LEAD) | `GET /api/v1/kpi/report?from=…&to=…` (như AC-KPI-004) | 200; kết quả giống hệt An (MANAGER) — scope `all` cho cả 2 vai trò | integration |
| AC-KPI-008 | Khoa (TECHNICIAN) có dữ liệu như AC-KPI-001/002/003; Minh (TECHNICIAN khác) cũng có dữ liệu trong khoảng | Khoa `GET /api/v1/kpi/report?from=…&to=…` (không truyền `employee_id`) | 200; **chỉ 1 dòng** — của chính Khoa; không thấy dòng của Minh | integration |
| AC-KPI-009 | Khoa (TECHNICIAN) | `GET /api/v1/kpi/report?from=…&to=…&employee_id=<id của Minh>` | 200; **vẫn chỉ 1 dòng của Khoa** (tham số `employee_id` bị bỏ qua đối với scope `self`, không lỗi, không lộ số liệu của Minh) | integration |
| AC-KPI-010 | Hoa (SALE, không có capability `kpi.read`) | `GET /api/v1/kpi/report?from=…&to=…` | 403 `FORBIDDEN` | integration |
| AC-KPI-011 | — | An `GET /api/v1/kpi/report?from=2026-09-30&to=2026-09-01` (đảo ngược) / thiếu `from` hoặc `to` / `from`/`to` sai định dạng ngày | mỗi trường hợp 422 `VALIDATION_ERROR` | integration |
| AC-KPI-012 | Assignment A `done_at = 2026-09-01 00:30` giờ UTC tức **2026-09-01 07:30 giờ VN** | An `GET /api/v1/kpi/report?from=2026-09-01&to=2026-09-01` | A được tính vào khoảng (biên ngày quy đổi theo giờ Việt Nam, không phải UTC — giống `M1-05` AC-SYS-070) | integration |
| AC-KPI-013 | Dữ liệu như AC-KPI-001/002/003 | An `GET /api/v1/kpi/report/export?from=…&to=…` | 200; `Content-Type: text/csv; charset=utf-8`; `Content-Disposition` có `attachment; filename="bao-cao-kpi-2026-09-01_2026-09-30.csv"`; nội dung có BOM UTF-8 ở đầu; dòng header tiếng Việt đúng tên cột (§4); 1 dòng dữ liệu/KTV, số liệu khớp với JSON của AC-KPI-001/002/003 | integration |
| AC-KPI-014 | Hoa (SALE) | `GET /api/v1/kpi/report/export?from=…&to=…` | 403 `FORBIDDEN` (cùng capability, không có ngoại lệ cho export) | integration |
| AC-KPI-015 | Khoa (TECHNICIAN) | `GET /api/v1/kpi/report/export?from=…&to=…` | 200; CSV chỉ có 1 dòng dữ liệu (chính Khoa), cùng quy tắc scope như AC-KPI-008 | integration |

## 4. API

| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/kpi/report | kpi.read | query: `from, to` (bắt buộc, `date`), `employee_id` (tuỳ chọn, uuid) | `KpiReportOut` | 422, 403, 404 |
| GET | /api/v1/kpi/report/export | kpi.read | như trên | `text/csv` (file) | 422, 403, 404 |

`KpiReportOut`:
```jsonc
{
  "from": "2026-09-01", "to": "2026-09-30",
  "rows": [
    {
      "employee_id": "…", "employee_code": "NV010", "employee_full_name": "Trần Văn Khoa", "employee_is_active": true,
      "completed_task_count": 2, "on_time_count": 1, "on_time_rate": 0.5,
      "rejection_counts": { "BUSY": 0, "SICK": 1, "SKILL": 0, "DISTANCE": 2, "OTHER": 0 },
      "rejection_total": 3,
      "defect_count": 1,
      "estimated_hours_total": 5, "actual_hours_total": 1.5, "actual_hours_missing_count": 1
    }
  ]
}
```
CSV: header tiếng Việt, cùng thứ tự cột — `Mã KTV, Họ tên, Số task xong, Số đúng hạn, Tỷ lệ đúng hạn, Từ chối - Bận việc khác, Từ chối - Ốm/bệnh, Từ chối - Không đúng chuyên môn, Từ chối - Quá xa, Từ chối - Khác, Tổng từ chối, Số lỗi ghi nhận, Giờ ước tính, Giờ thực tế, Số lần thiếu khai giờ thực tế`. `on_time_rate` để trống (không phải `0`) khi `completed_task_count = 0`.

## 5. Dữ liệu / Migration
Không có bảng/cột mới — toàn bộ đã có từ `M1-04` (`employees`, `employee_roles`), `M4-01`/`M6-03a` (`tasks`, `assignments`, `defect_records` kèm `excluded_from_kpi`).

## 6. UI
Không có ở item này (API-only) — xem `M8-01b`.

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập Manager, mở `/smyoutask/api/docs` (dev) → `GET /api/v1/kpi/report?from=2026-09-01&to=2026-09-30` → thấy 1 dòng/KTV với số liệu hợp lý.
2. Đổi `employee_id` → chỉ còn 1 dòng đúng người đó.
3. `GET /api/v1/kpi/report/export?from=…&to=…` → tải file CSV, mở bằng Excel/LibreOffice → dấu tiếng Việt hiển thị đúng, số khớp bước 1.
4. Đăng nhập một KTV → gọi lại API → chỉ thấy dòng của chính mình, dù truyền `employee_id` của người khác.

## 8. Giả định & câu hỏi
- Giả định: "số task xong" tính theo **assignment** `DONE` của từng người (không phải số task duy nhất), vì 1 task có thể nhiều người tham gia và mỗi người cần được tính công riêng — khớp nguyên tắc "trạng thái của chính người đó" đã dùng ở `M5-01`. Nếu chủ dự án muốn tính theo task duy nhất (không đếm trùng khi nhiều người cùng task), cần nêu rõ vì sẽ đổi cách đếm.
- Giả định: "đúng hạn" so `assignment.done_at` với `task.due_at` **hiện tại** (không snapshot `due_at` tại thời điểm hoàn thành) — vì `due_at` có thể bị QLKT sửa sau đó qua lệnh `update`; trường hợp hiếm (sửa `due_at` sau khi đã `DONE`) chấp nhận sai số nhỏ cho v1.
- Giả định: danh sách KTV trong báo cáo là **mọi nhân viên có vai trò TECHNICIAN** bất kể `is_active`, để không mất số liệu của người đã nghỉ khi xem lại khoảng ngày cũ.
- **Câu hỏi mới — Q78 (đề xuất: để sau, không làm ở M8-01)**: DOMAIN_MODEL §10 nói QLKT có thể đánh dấu `excluded_from_kpi` kèm lý do, nhưng chưa item nào (kể cả M6-03a lẫn M8-01) mở route cho việc này — cột đã có trong DB nhưng mãi mãi `false` cho tới khi có item riêng. *Đề xuất:* backlog thêm `M8-02` (API `POST /defect-records/{id}/exclude`) nếu chủ dự án cần dùng thật; M8-01 chỉ đọc cột này, không có cách set.
