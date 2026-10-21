# M15-10b — Báo cáo Doanh thu theo nhân viên — Giao diện

- **Status:** Draft
- **Backlog:** M15-10b · **Milestone:** M15
- **Liên quan:** M15-10a (API); M15-09b (cùng mẫu UI, chỉ đổi trục nhóm)

## 1. Mục tiêu
Là Manager/Sale/QLKT/CSKH, tôi muốn xem báo cáo doanh thu theo nhân viên dưới dạng bảng lọc được, bấm vào từng nhân viên để xem đơn, bấm vào đơn để xem dòng hàng, và xuất file — cùng kiểu trải nghiệm với báo cáo doanh thu theo khách hàng (M15-09b).

## 2. Phạm vi
- Trong phạm vi: trang `/reports/revenue-by-employee`, cấu trúc bộ lọc/bảng/drilldown 2 cấp/nút "Xuất Excel" **giống hệt** M15-09b (tái dùng component), chỉ đổi: dropdown lọc "Nhân viên" (mặc định "Tất cả", sắp theo mã NV) thay cho "Khách hàng"; cột bảng: mã NV, tên NV, tổng số đơn, tổng tiền hàng, lợi nhuận (bỏ cột "Người liên hệ"/"Người bán" vì chính là trục nhóm).
- Ngoài phạm vi: menu điều hướng (M15-11).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-030 | An (MANAGER) mở `/reports/revenue-by-employee` | render lần đầu | Bộ lọc mặc định đầu tháng→hôm nay, nhân viên = "Tất cả", trạng thái = "Đã hoàn tất" | component |
| AC-RPT-031 | Bảng có dòng `NV005` | Bấm vào dòng | Mở drilldown danh sách đơn do NV005 tạo | component |
| AC-RPT-032 | Drilldown đơn đang mở | Bấm vào 1 đơn | Mở drilldown dòng hàng chi tiết | component |
| AC-RPT-033 | Bộ lọc hiện tại | Bấm "Xuất Excel" | Tải CSV đúng điều kiện lọc | component |
| AC-RPT-034 | Màn này trên mobile (390px) | render | Bảng chuyển dạng thẻ, bộ lọc xếp dọc (giống M15-09b) | component |

## 4. API
Không có route mới — dùng `GET /reports/revenue-by-employee`, `.../orders`, `.../export` (M15-10a) + `GET /orders/{id}/lines`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Tái dùng component bảng/bộ lọc/drilldown của M15-09b (đổi field nhóm + cột như §2).

## 7. Kịch bản UAT thủ công
1. Mở trang, kiểm mặc định.
2. Drilldown 2 cấp.
3. Xuất file, mở kiểm tra.

## 8. Giả định & câu hỏi
Không có giả định mới ngoài M15-10a/M15-09b.
