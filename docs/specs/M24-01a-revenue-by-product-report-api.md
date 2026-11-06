# M24-01a — Báo cáo "Doanh thu theo SP/DV" (theo nhóm / theo từng sản phẩm) — API

- **Status:** Approved
- **Backlog:** M24-01a · **Milestone:** M24
- **Phụ thuộc:** M16-05 (doanh thu theo dòng hàng, công thức lợi nhuận, scope `own` theo `credited_employee_id`), M16-07/M16-08 (`product_service_groups`, `orders.division_id`), M21-08 (giá vốn bắt buộc)
- **Liên quan:** spec/permissions.yaml#report.revenue.read (dùng lại, không đổi), DOMAIN_MODEL §6 (order_lines)

## 1. Mục tiêu
Là Manager/Sale/CSKH/QLKT, tôi muốn xem doanh thu, lợi nhuận gom theo **nhóm sản phẩm/dịch vụ** hoặc theo **từng sản phẩm/dịch vụ** để biết mảng nào, mặt hàng nào đem lại doanh thu.

## 2. Phạm vi
- Trong phạm vi:
  - Dùng lại capability `report.revenue.read` (`MANAGER: all, TECH_LEAD: all, SALE: own, CUSTOMER_CARE: own`) — **không** thêm capability. `own` = dòng hàng có `credited_employee_id = tôi` (đúng như M16-05); dòng chưa ghi ai chỉ scope `all` thấy.
  - **Tập dòng tính** giống hệt "Doanh thu theo nhân viên" (M16-05): `status=COMPLETED` (mặc định) → đơn `COMPLETED`, lọc `completed_at` trong khoảng; `status=NOT_COMPLETED` → đơn `PENDING_DISPATCH, IN_PROGRESS, AWAITING_CONFIRMATION, REVISION`, lọc `created_at`; không gồm `DRAFT`, `CANCELLED`. Mặc định `from` = đầu tháng, `to` = hôm nay (giờ `Asia/Ho_Chi_Minh`). Dòng quà tặng vẫn tính (doanh thu 0, lợi nhuận âm theo giá vốn) như báo cáo theo nhân viên.
  - Công thức: `subtotal_revenue` = Σ `line_total`; `profit` = Σ (`line_total − cost_price_snapshot × quantity`), làm tròn half-up về số nguyên VND; nhóm có ≥1 dòng thiếu `cost_price_snapshot` → `profit = null`; `order_count` = số đơn khác nhau có dòng trong nhóm; `quantity` = Σ `quantity`.
  - `GET /api/v1/reports/revenue-by-product?mode=group|item&from=&to=&status=&group_id=`
    - `mode=group` (mặc định): gom theo **nhóm SP/DV của đơn** (`orders.division_id`, như Q149/M23a); đơn không có nhóm → 1 dòng "Chưa phân nhóm" (`key="ungrouped"`) ở cuối.
    - `mode=item`: gom theo SP/DV: khoá `product:<product_id>` / `service:<service_id>`; dòng `CUSTOM` cũ gom theo `custom:<name_snapshot>`, **không phân biệt hoa/thường, bỏ khoảng trắng đầu/cuối** ("Cáp" và "cáp" là 1 dòng — chủ SP 2026-11-05); nhãn/key dùng 1 tên lúc bán đại diện (tên nhỏ nhất theo thứ tự chuỗi), `/lines?key=custom:<tên>` khớp theo cùng quy tắc. Nhãn = mã + tên **hiện tại** trong danh mục (đơn vị tính = `unit` hiện tại); dòng `CUSTOM` dùng `name_snapshot`, `unit_snapshot`, không có mã.
    - `group_id` (tuỳ chọn, cả 2 mode): chỉ tính dòng của đơn thuộc nhóm đó; `group_id=ungrouped` → đơn không có nhóm.
    - Mỗi dòng: `{ key, label, code: str|None, item_type: PRODUCT|SERVICE|CUSTOM|None (None ở mode group), unit: str|None, quantity: Decimal|None (None ở mode group), order_count, subtotal_revenue, profit }`. Sắp `subtotal_revenue` giảm dần, bằng nhau → `label` A→Z; "Chưa phân nhóm" luôn cuối.
    - Kèm `summary: { subtotal_revenue, profit }` tổng của mọi dòng (profit null nếu có dòng null).
  - `GET /api/v1/reports/revenue-by-product/lines?mode=&key=&from=&to=&status=&group_id=` — drilldown: danh sách dòng hàng (`RevenueLineOut` của M16-05) của 1 `key`. `key` sai định dạng hoặc không khớp `mode` → 422. Áp cùng scope.
  - `GET /api/v1/reports/revenue-by-product/export?...` — CSV UTF-8 BOM cùng mẫu báo cáo doanh thu khác, tên file `doanh-thu-theo-nhom-sp-dv-{from}_{to}.csv` (mode group) / `doanh-thu-theo-san-pham-{from}_{to}.csv` (mode item).
- Ngoài phạm vi: UI (M24-01b); gắn nhóm vào từng sản phẩm trong danh mục.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-139 | Tháng này: đơn A (`COMPLETED`, nhóm "Thiết bị an ninh") có dòng Camera Dahua 2MP ×4 = 4.400.000 (giá vốn 800.000/cái) + dòng Lắp đặt camera ×4 = 1.200.000 (giá vốn 150.000); đơn B (`COMPLETED`, nhóm "Thiết bị văn phòng") có dòng Máy in Canon LBP2900 ×1 = 3.850.000 (giá vốn 3.000.000) | An (MANAGER) `GET /reports/revenue-by-product` | 200; `mode=group`; 2 dòng: "Thiết bị an ninh" `subtotal_revenue=5600000, profit=1800000, order_count=1` trước "Thiết bị văn phòng" `3850000 / 850000 / 1`; `summary.subtotal_revenue=9450000` | integration |
| AC-RPT-140 | Như AC-139 | An `?mode=item` | 3 dòng sắp doanh thu giảm: Camera Dahua 2MP (`item_type=PRODUCT, quantity=4, subtotal_revenue=4400000, profit=1200000`), Máy in Canon LBP2900, Lắp đặt camera (`item_type=SERVICE`) | integration |
| AC-RPT-141 | Camera Dahua 2MP bán ở đơn A và đơn C (cùng `product_id`); sau đó danh mục đổi tên thành "Camera Dahua 2MP HFW1230" | An `?mode=item` | 1 dòng duy nhất cho sản phẩm, `order_count=2`, `label` mang tên mới trong danh mục | integration |
| AC-RPT-142 | Đơn D `COMPLETED` không có nhóm (`division_id=null`), 1 dòng 500.000 | An `?mode=group` | Dòng cuối `key="ungrouped"`, `label="Chưa phân nhóm"`, `subtotal_revenue=500000` | integration |
| AC-RPT-143 | Đơn cũ có dòng `CUSTOM` "Dây cáp mạng Cat6" | An `?mode=item` | Dòng `item_type=CUSTOM`, `code=null`, `key="custom:Dây cáp mạng Cat6"` | integration |
| AC-RPT-144 | Như AC-139 | An `?mode=item&group_id=<Thiết bị an ninh>` | Chỉ Camera Dahua 2MP và Lắp đặt camera | integration |
| AC-RPT-145 | Đơn A: dòng Camera ghi doanh số cho Hoa (SALE), dòng Lắp đặt ghi cho Tuấn; đơn B chưa ghi ai | Hoa `GET /reports/revenue-by-product?mode=item` | Chỉ 1 dòng Camera Dahua 2MP (scope `own`); không thấy Lắp đặt, Máy in | integration |
| AC-RPT-146 | Đơn E `IN_PROGRESS` tạo tháng này, đơn F `CANCELLED`, đơn G `DRAFT` | An `?status=NOT_COMPLETED` | Chỉ dòng của đơn E được tính | integration |
| AC-RPT-147 | Như AC-139 | An `GET /reports/revenue-by-product/lines?mode=item&key=product:<Camera>` | 200; 1 dòng hàng: `order_code` của đơn A, `quantity=4`, `line_total=4400000` | integration |
| AC-RPT-148 | — | `/lines?mode=group&key=product:<id>` hoặc `key=abc` hoặc thiếu `key` | 422 | integration |
| AC-RPT-149 | Đức (TECHNICIAN) | `GET /reports/revenue-by-product`, `/lines`, `/export` | 403 | integration + generated |
| AC-RPT-150 | Như AC-139 | An `GET /reports/revenue-by-product/export?mode=item` | 200 CSV UTF-8 BOM, tên file `doanh-thu-theo-san-pham-{from}_{to}.csv`, cột: Mã, Tên, Loại, ĐVT, Số lượng, Số đơn, Doanh thu, Lợi nhuận | integration |
| AC-RPT-151 | Đơn có 1 dòng thiếu `cost_price_snapshot` | An `?mode=group` | Nhóm đó `profit=null`; `summary.profit=null` | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/reports/revenue-by-product | report.revenue.read | `mode, from, to, status, group_id` | `{from, to, mode, items[], summary, total}` | 403, 422 |
| GET | /api/v1/reports/revenue-by-product/lines | report.revenue.read | `mode, key, from, to, status, group_id` | `list[RevenueLineOut]` | 403, 422 |
| GET | /api/v1/reports/revenue-by-product/export | report.revenue.read | như báo cáo | `text/csv` | 403, 422 |

## 5. Dữ liệu / Migration
Không có — truy vấn tổng hợp trên `order_lines` + `orders`, join `products`/`services`/`product_service_groups` để lấy nhãn hiện tại.

## 6. UI
Không có ở item này — xem M24-01b.

## 7. Kịch bản UAT thủ công
1. Tạo 2 đơn ở 2 nhóm khác nhau, hoàn tất.
2. Gọi báo cáo `mode=group` → đúng tổng theo nhóm; `mode=item` → đúng theo từng mặt hàng.
3. Đăng nhập Sale → chỉ thấy mặt hàng được ghi doanh số cho mình.

## 8. Giả định & câu hỏi
- **Q176** "Nhóm sản phẩm/dịch vụ" = nhóm của **đơn** (`orders.division_id`), vì danh mục sản phẩm hiện không gắn nhóm (M16-07). Hệ quả: đơn "Thiết bị an ninh" có dòng máy in thì máy in tính vào "Thiết bị an ninh". Phương án khác: gom theo **loại hàng trong danh mục** (Camera, Máy in, Lắp đặt…) — cần chủ SP chọn.
- **Q177** Chế độ theo sản phẩm: nhãn lấy tên/mã **hiện tại** trong danh mục (1 sản phẩm = 1 dòng dù đã đổi tên); dòng tự nhập cũ gom theo tên, không phân biệt hoa/thường (cập nhật 2026-11-05).
- **Q178** Scope, tập trạng thái, cách tính lợi nhuận, quà tặng: giống hệt "Doanh thu theo nhân viên" (M16-05).
- Không cần sửa `spec/*.yaml` ở item này (capability cũ). Menu: xem M24-01b.
