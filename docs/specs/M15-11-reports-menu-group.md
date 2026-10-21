# M15-11 — Gộp menu "Báo cáo" (KPI + 2 báo cáo doanh thu mới)

- **Status:** Draft
- **Backlog:** M15-11 · **Milestone:** M15
- **Liên quan:** M15-09b, M15-10b (path `/reports/revenue-by-customer`, `/reports/revenue-by-employee`); `spec/permissions.yaml#menu` (mục `reports` hiện tại là 1 path đơn `/reports/kpi`)

## 1. Mục tiêu
Là người dùng có quyền xem báo cáo, tôi muốn vào 1 menu "Báo cáo" rồi chọn loại báo cáo cần xem (KPI, Doanh thu theo khách hàng, Doanh thu theo nhân viên), thay vì mỗi báo cáo nằm rải rác.

## 2. Phạm vi
- Trong phạm vi:
  - `spec/permissions.yaml#menu`: đổi mục `reports` từ path đơn thành nhóm có `children`, theo đúng cấu trúc các nhóm khác đã có (`dispatch`, `sales`, `catalog`):
    ```yaml
    - id: reports
      label: Báo cáo
      icon: BarChart3
      capability: kpi.read   # hoặc report.revenue.read — xem §8
      children:
        - { id: reports-kpi,      label: Báo cáo KPI,                 icon: BarChart3,   path: /reports/kpi }
        - { id: reports-revenue-customer, label: Doanh thu theo khách hàng, icon: Users,  path: /reports/revenue-by-customer, capability: report.revenue.read }
        - { id: reports-revenue-employee, label: Doanh thu theo nhân viên,  icon: UserCog, path: /reports/revenue-by-employee, capability: report.revenue.read }
    ```
  - Test đồng bộ `menu.ts` ↔ `permissions.yaml` (đã có từ trước) tự động phủ item này, không cần test mới.
  - Một người chỉ có `kpi.read` (vd TECHNICIAN) thấy nhóm "Báo cáo" chỉ còn mục con "Báo cáo KPI" (menu luôn là hình chiếu của quyền — CLAUDE.md quy tắc 5); người chỉ có `report.revenue.read` mà không có `kpi.read` (không xảy ra theo bảng quyền hiện tại vì cả hai đều gán cho cùng tập vai trò, trừ TECHNICIAN chỉ có `kpi.read`) thấy đủ 3 mục trừ khi thiếu quyền tương ứng.
- Ngoài phạm vi: nội dung từng báo cáo con (đã làm ở M8-01, M15-09b, M15-10b).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-040 | An (MANAGER) | `GET /api/v1/me` rồi render menu | Nhóm "Báo cáo" có 3 mục con: Báo cáo KPI, Doanh thu theo khách hàng, Doanh thu theo nhân viên | component |
| AC-RPT-041 | Đức (TECHNICIAN, chỉ có `kpi.read`, không có `report.revenue.read`) | render menu | Nhóm "Báo cáo" chỉ còn 1 mục con "Báo cáo KPI" | component |
| AC-RPT-042 | Test đồng bộ menu (đã có từ M1-03a) | chạy `make check-fast` | Vẫn xanh — `frontend/src/app/menu.ts` khớp `spec/permissions.yaml#menu` sau khi sửa | integration |

## 4. API
Không có — chỉ đổi cấu hình menu (đọc từ `GET /api/v1/me` + `permissions.yaml`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Menu desktop/mobile: nhóm "Báo cáo" mở rộng thành submenu như nhóm "Điều phối kỹ thuật"/"Đơn hàng" đã có.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → menu "Báo cáo" → thấy 3 mục con.
2. Bấm từng mục → đúng trang.
3. Đăng nhập Kỹ thuật viên → chỉ thấy "Báo cáo KPI".

## 8. Giả định & câu hỏi
- Giả định: nhóm cha "Báo cáo" hiện khi có **ít nhất 1** trong các capability con (giống nhóm `sales`/`dispatch` hiện tại dùng capability của mục đầu tiên làm điều kiện hiện nhóm) — cần xác nhận cơ chế hiện/ẩn nhóm cha khi các mục con có capability khác nhau đã được code hỗ trợ đúng cách này từ M1-03a, hay cần sửa thêm logic frontend.
- Làm **sau cùng** trong milestone M15 (phụ thuộc M15-09a/b, M15-10a/b đã có path thật).
