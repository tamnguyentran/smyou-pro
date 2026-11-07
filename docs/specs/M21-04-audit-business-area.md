# M21-04 — Nhật ký hệ thống: hiện "Nghiệp vụ" (màn hình) và đối tượng của mọi sự kiện

- **Status:** Approved (2026-11-01, chủ dự án chốt Q146–Q156)
- **Backlog:** M21-04 · **Milestone:** M21
- **Liên quan:** spec/permissions.yaml#audit.read, M1-05 (audit framework), backend/app/modules/audit, frontend/src/features/audit

## 1. Mục tiêu
Là Manager, tôi muốn mỗi dòng nhật ký cho biết thao tác thuộc nghiệp vụ / màn hình nào (Đơn hàng, Quản lý đầu việc, …) và đối tượng cụ thể (mã đơn, tên khách…), để tra cứu ai đã làm gì ở đâu.

## 2. Phạm vi
Hiện trạng: `audit_events` đã ghi sự kiện của đơn hàng, đầu việc, phân công, khách hàng, danh mục, quà tặng…, nhưng trang Nhật ký chỉ có nhãn cho Nhân viên/Công ty/Phòng ban; bộ lọc chỉ có "Nhân viên"; sự kiện đơn/đầu việc hiện mã kỹ thuật thô (`add_line_after_submit`…).
- Trong phạm vi:
  - Backend thêm vào `AuditEventOut`: `business_area` (mã nghiệp vụ) và `entity_label` (chuỗi đọc được: mã đơn `DH2611-0001`, mã đầu việc, tên khách hàng, tên SP/DV, tên nhân viên + mã, tên phòng ban…; không tra được → `null`).
  - Bảng ánh xạ `entity_type`/`action` → `business_area` (một nơi duy nhất, backend):

    | business_area | Nhãn UI | Nguồn |
    |---|---|---|
    | `ORDERS` | Đơn hàng | `ORDER` |
    | `TASKS` | Quản lý đầu việc | `TASK` |
    | `ASSIGNMENTS` | Việc của tôi (kỹ thuật viên) | `ASSIGNMENT` |
    | `CUSTOMERS` | Khách hàng | `CUSTOMER` |
    | `CUSTOMER_GIFTS` | Ghi nhận quà tặng KH | `CUSTOMER_GIFT` |
    | `CATALOG` | Danh mục | `PRODUCT`, `SERVICE` |
    | `EMPLOYEES` | Nhân sự & phân quyền | `EMPLOYEE` trừ nhóm đăng nhập |
    | `AUTH` | Đăng nhập | `EMPLOYEE` với `login`, `login_failed`, `login_refused`, `account_locked`, `password_changed` |
    | `COMPANY` | Thông tin Công ty | `COMPANY_PROFILE` |
    | `DEPARTMENTS` | Phòng ban | `DEPARTMENT` |
    | `KPI_TARGETS` | Thiết lập doanh thu KPI | `KPI_TARGET` (M21-01a) |
  - `GET /audit-events` thêm lọc `business_area` (thay dần bộ lọc `entity_type` ở UI; API vẫn nhận `entity_type`).
  - UI: cột/nhãn "Nghiệp vụ" (desktop: cột thứ 2 sau Thời gian; mobile: badge đầu thẻ); bộ lọc "Nghiệp vụ" đủ các mục trên; nhãn tiếng Việt cho **mọi** `action` đang có (danh sách §6); đối tượng hiện `entity_label`.
  - Test bảo vệ: mọi `EntityType` đều có `business_area`; mọi `action` được ghi trong code đều có nhãn ở UI (test quét giống test capability).
- Ngoài phạm vi: ghi thêm loại sự kiện mới; ghi thao tác chỉ xem (đọc báo cáo, mở trang).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-138 | Hoa (SALE) thêm dòng hàng vào đơn DH2611-0003 sau khi gửi | An (MANAGER) `GET /audit-events` | Sự kiện có `business_area="ORDERS"`, `entity_label="DH2611-0003"`, `action="add_line_after_submit"` | integration |
| AC-SYS-139 | Bình (TECH_LEAD) tạo đầu việc cho đơn DH2611-0003; Khang (KTV) tiếp nhận phân công | `GET /audit-events` | Sự kiện tạo task `business_area="TASKS"`; sự kiện accept `business_area="ASSIGNMENTS"`; cả hai có `entity_label` chứa "DH2611-0003" | integration |
| AC-SYS-140 | Có sự kiện `login` và `roles` cùng `entity_type=EMPLOYEE` | `GET /audit-events?business_area=AUTH` | Chỉ trả `login`; `?business_area=EMPLOYEES` chỉ trả `roles` | integration |
| AC-SYS-141 | — | `?business_area=FOO` | 422 | integration |
| AC-SYS-142 | Mỗi giá trị `EntityType` | test quét | Đều ánh xạ được ra `business_area`; thêm `EntityType` mới mà không ánh xạ → test đỏ | unit |
| AC-SYS-143 | Mọi chuỗi `action=` được ghi trong `backend/app/modules` | test quét | Đều có nhãn trong `ACTION_LABELS` của UI | unit |
| AC-SYS-144 | SALE, CSKH, QLKT, KTV | `GET /audit-events` | 403 (không đổi) | integration |
| AC-SYS-145 | An mở Nhật ký 1440px | render dữ liệu AC-138 | Bảng có cột "Nghiệp vụ" = "Đơn hàng"; Đối tượng "Đơn hàng DH2611-0003"; Thao tác "Thêm dòng hàng sau khi gửi" | component |
| AC-SYS-146 | An | chọn bộ lọc Nghiệp vụ "Quản lý đầu việc" | Gọi API `business_area=TASKS` | component |
| AC-SYS-147 | 390px | mở Nhật ký | Mỗi thẻ có badge nghiệp vụ, thao tác, đối tượng; không cuộn ngang | e2e |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| GET | /api/v1/audit-events | audit.read | query thêm `business_area?: BusinessArea`; `AuditEventOut` thêm `business_area: str`, `entity_label: str \| null` |

## 5. Dữ liệu / Migration
Không đổi bảng. `business_area` tính khi đọc (ánh xạ); lọc theo `business_area` dịch ra điều kiện `entity_type`/`action`. `entity_label` tra theo lô (1 truy vấn / loại đối tượng trong trang), không N+1.

## 6. UI
Nhãn thao tác đề xuất (bổ sung vào `ACTION_LABELS`): `accept` Tiếp nhận · `reject` Từ chối · `start` Bắt đầu · `complete` Hoàn thành · `cancel` Huỷ · `reopen` Mở lại · `add_assignee` Thêm người thực hiện · `remove` Gỡ/Xoá · `add_line` Thêm dòng hàng · `update_line` Sửa dòng hàng · `remove_line` Xoá dòng hàng · `add_line_after_submit` Thêm dòng hàng sau khi gửi · `update_line_after_submit` Sửa dòng hàng sau khi gửi · `remove_line_after_submit` Xoá dòng hàng sau khi gửi · `add_line_on_site` KTV thêm dòng hàng · `update_line_on_site` KTV sửa dòng hàng · `remove_line_on_site` KTV xoá dòng hàng · `all_tasks_done` Xong mọi đầu việc · `confirmation_upload` Tải ảnh xác nhận · `csat_recorded` Ghi phản hồi KH · `revision_requested` Yêu cầu chỉnh sửa · `edit_contact` Sửa liên hệ · `image` Cập nhật ảnh · `kpi_target.set` Đặt chỉ tiêu KPI · `kpi_target.delete` Xoá chỉ tiêu KPI · `kpi_target.copy` Copy chỉ tiêu KPI · `potential_note` Ghi tiềm năng KH (M21-05a). Thao tác chuyển trạng thái đơn khác (nếu có trong code khi implement) bổ sung theo test AC-SYS-143.
- Screenshot 390px + 1440px → `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. Sale tạo + gửi đơn; QLKT tạo đầu việc; KTV tiếp nhận.
2. Manager mở Nhật ký → thấy cột Nghiệp vụ "Đơn hàng", "Quản lý đầu việc", "Việc của tôi (kỹ thuật viên)" với mã đơn.
3. Lọc "Đơn hàng" → chỉ còn sự kiện đơn.

## 8. Giả định & câu hỏi
- Giả định (Q153): "ghi nhận nghiệp vụ thực hiện" = **hiển thị + lọc** theo nghiệp vụ/màn hình cho các sự kiện đã ghi, không ghi thêm thao tác chỉ xem.
