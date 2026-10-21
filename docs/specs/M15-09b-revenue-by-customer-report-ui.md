# M15-09b — Báo cáo Doanh thu theo khách hàng — Giao diện

- **Status:** Draft
- **Backlog:** M15-09b · **Milestone:** M15
- **Liên quan:** M15-09a (API); `docs/specs/M8-01b-kpi-report-ui.md` (mẫu màn báo cáo KPI, bộ lọc, nút xuất file); `docs/design/UI_GUIDELINES.md`

## 1. Mục tiêu
Là Manager/Sale/QLKT/CSKH, tôi muốn xem báo cáo doanh thu theo khách hàng dưới dạng bảng có thể lọc, bấm vào từng khách hàng để xem đơn, bấm vào đơn để xem dòng hàng, và xuất file.

## 2. Phạm vi
- Trong phạm vi:
  - Trang `/reports/revenue-by-customer`: bộ lọc (khoảng ngày mặc định đầu tháng→hôm nay, dropdown khách hàng mặc định "Tất cả", toggle trạng thái "Đã hoàn tất"/"Chưa xong" mặc định "Đã hoàn tất") + bảng kết quả (mã KH, tên KH, người liên hệ+SĐT, người bán, tổng số đơn, tổng tiền hàng, lợi nhuận) + nút "Xuất Excel" (tải CSV theo M15-09a).
  - Click 1 dòng → mở drilldown cấp 1 (sheet/dialog hoặc trang con): danh sách đơn của khách hàng đó cùng điều kiện lọc.
  - Click 1 đơn trong drilldown cấp 1 → mở drilldown cấp 2: bảng dòng hàng chi tiết của đơn đó (dùng lại `OrderLinesTable` nếu đã có component từ M3).
  - Cột "Lợi nhuận" hiện "—" (không phải "0") khi `profit = null` (thiếu giá vốn snapshot), kèm tooltip "Một số dòng hàng chưa có giá vốn tại thời điểm tạo đơn."
- Ngoài phạm vi: menu điều hướng tới trang này (M15-11).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-010 | An (MANAGER) mở `/reports/revenue-by-customer` | render lần đầu | Bộ lọc hiện sẵn: ngày = đầu tháng→hôm nay, khách hàng = "Tất cả", trạng thái = "Đã hoàn tất"; bảng tự tải theo mặc định | component |
| AC-RPT-011 | Bảng có dòng `KH00001` | Bấm vào dòng đó | Mở drilldown danh sách đơn của `KH00001` | component |
| AC-RPT-012 | Drilldown đơn đang mở, có đơn `DH2609-0010` | Bấm vào đơn đó | Mở drilldown dòng hàng chi tiết của `DH2609-0010` | component |
| AC-RPT-013 | Dòng khách hàng có `profit = null` | render bảng | Cột "Lợi nhuận" hiện "—" + tooltip giải thích, không hiện "0 ₫" (tránh hiểu nhầm lỗ/không lãi) | component |
| AC-RPT-014 | Bộ lọc hiện tại đang áp dụng | Bấm "Xuất Excel" | Tải file CSV đúng tên, đúng điều kiện lọc hiện tại (không phải toàn bộ dữ liệu) | component |
| AC-RPT-015 | Màn này trên mobile (390px) | render | Bảng chuyển dạng thẻ (1 thẻ/khách hàng, các cột thu gọn thành danh sách nhãn-giá trị), bộ lọc xếp dọc | component |

## 4. API
Không có route mới — dùng `GET /reports/revenue-by-customer`, `.../orders`, `.../export` (M15-09a) + `GET /orders/{id}/lines` (đã có).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Theo mẫu bảng/bộ lọc của `/reports/kpi` (M8-01b) để nhất quán — tái dùng component `DateRangeFilter`, `ExportButton` nếu đã tồn tại.
- Copy: nút "Xuất Excel", tooltip lợi nhuận như §3, toggle "Đã hoàn tất" / "Chưa xong".

## 7. Kịch bản UAT thủ công
1. Mở trang, xem mặc định đúng, đổi khoảng ngày → bảng cập nhật.
2. Bấm vào 1 khách hàng → thấy đơn → bấm vào 1 đơn → thấy dòng hàng.
3. Bấm "Xuất Excel" → mở file bằng Excel, dấu tiếng Việt đúng.

## 8. Giả định & câu hỏi
- Không có thêm giả định mới ngoài M15-09a.
