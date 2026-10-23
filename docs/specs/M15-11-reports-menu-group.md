# M15-11 — Gộp menu "Báo cáo" (KPI + 2 báo cáo doanh thu mới)

- **Status:** Done (review + verify 2026-10-23, `reports/review-M15-11.md`)
- **Backlog:** M15-11 · **Milestone:** M15
- **Liên quan:** M15-09b, M15-10b (route `/reports/revenue-by-customer`, `/reports/revenue-by-employee`, hiện tự kiểm capability riêng, không có mục menu); `spec/permissions.yaml#menu` (mục `reports` hiện là 1 path đơn `/reports/kpi`); `frontend/src/app/menu.ts` (`visibleMenu`, `holds`)

## 1. Mục tiêu
Là người dùng có quyền xem báo cáo, tôi muốn vào 1 menu "Báo cáo" rồi chọn loại báo cáo cần xem (KPI, Doanh thu theo khách hàng, Doanh thu theo nhân viên), thay vì mỗi báo cáo nằm rải rác hoặc chỉ vào được bằng URL trực tiếp.

## 2. Phạm vi
- Trong phạm vi:
  - `spec/permissions.yaml#menu`: đổi mục `reports` từ path đơn thành nhóm có `children`:
    ```yaml
    - id: reports
      label: Báo cáo
      icon: BarChart3
      children:
        - { id: reports-kpi,             label: Báo cáo KPI,                 icon: BarChart3, path: /reports/kpi,                 capability: kpi.read }
        - { id: reports-revenue-customer, label: Doanh thu theo khách hàng,  icon: Users,     path: /reports/revenue-by-customer, capability: report.revenue.read }
        - { id: reports-revenue-employee, label: Doanh thu theo nhân viên,   icon: UserCog,   path: /reports/revenue-by-employee, capability: report.revenue.read }
    ```
  - **Quan trọng — khác với bản nháp trước:** mục cha `reports` **không có `capability` riêng** (không còn `capability: kpi.read` ở cấp cha). Lý do (xem §8): `report.revenue.read` được gán cho SALE và CUSTOMER_CARE (scope `own`), nhưng hai vai trò này **không có** `kpi.read`. Nếu cha vẫn gắn `capability: kpi.read`, `visibleMenu()` (`frontend/src/app/menu.ts:84-91`) sẽ ẩn cả nhóm với SALE/CUSTOMER_CARE dù họ có quyền xem báo cáo doanh thu. Để cha không có `capability`, `holds(capabilities, null)` luôn `true` (dòng 80-81) → nhóm hiện khi **ít nhất 1** mục con hiện, đúng hành vi mong muốn, không cần sửa code `menu.ts`.
  - Test đồng bộ `menu.ts` ↔ `permissions.yaml` (đã có từ M1-03a) tự động phủ cấu trúc mới, không cần test mới cho việc đó.
- Ngoài phạm vi: nội dung từng báo cáo con (đã làm ở M8-01, M15-09b, M15-10b); đổi route guard của từng trang con (đã tự kiểm capability riêng).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-050 | An (MANAGER, có `kpi.read` + `report.revenue.read`) | `GET /api/v1/me` rồi render menu | Nhóm "Báo cáo" hiện, có đủ 3 mục con: Báo cáo KPI, Doanh thu theo khách hàng, Doanh thu theo nhân viên | component |
| AC-RPT-051 | Đức (TECHNICIAN, chỉ có `kpi.read`, không có `report.revenue.read`) | render menu | Nhóm "Báo cáo" hiện, chỉ còn 1 mục con "Báo cáo KPI" | component |
| AC-RPT-052 | Hoa (SALE, chỉ có `report.revenue.read` scope `own`, không có `kpi.read`) | render menu | Nhóm "Báo cáo" **vẫn hiện**, có 2 mục con "Doanh thu theo khách hàng" và "Doanh thu theo nhân viên", **không có** "Báo cáo KPI" | component |
| AC-RPT-053 | Lan (CUSTOMER_CARE, chỉ có `report.revenue.read` scope `own`, không có `kpi.read`) | render menu | Giống AC-RPT-052: nhóm "Báo cáo" hiện với 2 mục doanh thu, không có KPI | component |
| AC-RPT-054 | Một vai trò giả định không có cả `kpi.read` và `report.revenue.read` (không xảy ra trong bảng vai trò hiện tại, nhưng kiểm bằng capability rỗng) | render menu với `capabilities = {}` | Nhóm "Báo cáo" **không hiện** (không mục con nào hiện → cha cũng ẩn, theo `visibleMenu`) | component |
| AC-RPT-055 | Test đồng bộ menu (đã có từ M1-03a) | chạy `make check-fast` | Vẫn xanh — `frontend/src/app/menu.ts`/`menu.json` khớp `spec/permissions.yaml#menu` sau khi sửa (sinh lại qua `make contract`) | integration |

## 4. API
Không có — chỉ đổi cấu hình menu (đọc từ `GET /api/v1/me` + `permissions.yaml`, sinh `menu.json` qua `make contract`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Menu desktop/mobile: nhóm "Báo cáo" mở rộng thành submenu như nhóm "Điều phối kỹ thuật"/"Đơn hàng" đã có (cùng component, không có biến thể mới).
- Icon nhóm cha giữ `BarChart3`; icon mục con theo bảng YAML ở §2 (đã có sẵn trong `ICONS` map của `menu.ts`, không cần thêm icon mới: `Users`, `UserCog` đã dùng ở nơi khác).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → menu "Báo cáo" → thấy 3 mục con, bấm từng mục → đúng trang.
2. Đăng nhập Kỹ thuật viên → chỉ thấy "Báo cáo KPI".
3. Đăng nhập Sale → thấy "Báo cáo" với 2 mục doanh thu, không thấy "Báo cáo KPI"; bấm vào vẫn vào được trang (đã tự kiểm scope `own` từ M15-09a/10a).

## 8. Giả định & câu hỏi
- **Đã xác minh (không phải giả định còn mở):** cơ chế hiện/ẩn nhóm cha trong `visibleMenu()` (`frontend/src/app/menu.ts:84-91`) đã hỗ trợ đúng nhu cầu "cha hiện nếu có ≥1 con hiện" miễn là cha **không gắn `capability` riêng** — xác nhận bằng cách đọc code, không cần sửa logic frontend. Bản nháp trước của spec này đề xuất gắn `capability: kpi.read` cho cha, điều đó sẽ **ẩn nhầm** nhóm "Báo cáo" với SALE/CUSTOMER_CARE (có `report.revenue.read` nhưng không có `kpi.read`, xem `spec/permissions.yaml:56-57`) — đã sửa trong §2/§3 ở trên, không cần hỏi chủ dự án.
- Làm **sau cùng** trong milestone M15 vì phụ thuộc M15-09a/b, M15-10a/b đã có path thật — các phụ thuộc này đã Done (`docs/backlog/BACKLOG.md`), có thể làm ngay.
