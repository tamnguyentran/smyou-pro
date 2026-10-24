# M16-02b — Báo cáo "Chi phí quà tặng KH" — UI

- **Status:** Approved (2026-10-24)
- **Backlog:** M16-02b · **Milestone:** M16
- **Liên quan:** `M16-02a` (API); `docs/specs/M15-09b-revenue-by-customer-report-ui.md` (mẫu UI báo cáo nhóm theo khách hàng, tái dùng component `Filters`/`Table`/`DrilldownSheet`); `spec/permissions.yaml` (menu)

## 1. Mục tiêu
Manager/Sale/CSKH xem báo cáo "Chi phí quà tặng KH" trong menu Báo cáo, lọc theo ngày/khách hàng, drilldown từng lần tặng, xuất CSV.

## 2. Phạm vi
- Trong phạm vi:
  - Thêm mục menu "Chi phí quà tặng KH" trong nhóm "Báo cáo" (`spec/permissions.yaml#menu`, cạnh 2 báo cáo doanh thu, icon `Gift`), path `/reports/customer-gifts`, capability `report.customer_gift.read`.
  - Trang: bộ lọc ngày (mặc định đầu tháng→hôm nay) + chọn khách hàng (tuỳ chọn) — tái dùng `Filters`/`SelectField` của `features/revenueReport`.
  - Bảng: Mã KH, Tên KH, Người liên hệ, Số lần tặng, Tổng chi phí — sắp theo mã KH.
  - Bấm 1 dòng → drilldown sheet: danh sách từng lần tặng (dịp/lễ, ngày, gói quà, SL×đơn giá, chi phí khác, thành tiền, người thực hiện, người yêu cầu, ảnh nếu có).
  - Nút "Xuất Excel" gọi endpoint export CSV (Q100 — tên nút tiếng Việt vẫn ghi "Xuất Excel" dù định dạng là CSV BOM, vì mở đúng bằng Excel; giống cách 2 báo cáo doanh thu đang đặt tên nút).
- Ngoài phạm vi: không có.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-GFT-040 | An (MANAGER) | mở `/reports/customer-gifts` | 200; bảng hiện đúng cột, mặc định đầu tháng→hôm nay | component |
| AC-GFT-041 | Bảng có ≥1 dòng | bấm vào 1 dòng | Drilldown sheet hiện đúng danh sách lần tặng của khách hàng đó | component |
| AC-GFT-042 | Trang báo cáo | bấm "Xuất Excel" | Gọi đúng endpoint export với filter hiện tại, tải file | component |
| AC-GFT-043 | Đức (TECHNICIAN, không có capability) | mở `/reports/customer-gifts` | 403 (trang + menu không hiện mục này) | component |

## 4. API
Dùng nguyên API của M16-02a, không route mới.

## 5. Dữ liệu / Migration
Không.

## 6. UI
Icon `Gift` (lucide-react) cho mục menu — nhất quán với M16-01b.

## 7. Kịch bản UAT thủ công
1. Vào menu Báo cáo → thấy mục "Chi phí quà tặng KH" → mở đúng trang.
2. Lọc theo khách hàng → bảng thu hẹp đúng.
3. Xuất Excel → mở file đọc đúng dấu tiếng Việt.

## 8. Giả định & câu hỏi
- Không có — kế thừa toàn bộ quyết định của M16-01a/b và M16-02a.
