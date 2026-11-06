# M21-02b — UI: đổi tên "Công việc theo nhân viên", màn "Báo cáo KPI", KPI của tôi ở Thông tin tài khoản

- **Status:** Approved (2026-11-01, chủ dự án chốt Q146–Q156)
- **Backlog:** M21-02b · **Milestone:** M21
- **Phụ thuộc:** M21-02a
- **Liên quan:** spec/permissions.yaml#menu.reports, frontend/src/features/kpi, frontend/src/features/profile

## 1. Mục tiêu
Là Manager, tôi muốn báo cáo cũ có tên đúng nội dung ("Công việc theo nhân viên") và một "Báo cáo KPI" mới theo tháng. Là nhân viên, tôi muốn xem KPI doanh số của mình trong trang Thông tin tài khoản.

## 2. Phạm vi
- Trong phạm vi:
  - Đổi nhãn menu + tiêu đề trang `/reports/kpi`: "Báo cáo KPI" → "Công việc theo nhân viên" (chỉ đổi chữ; đường dẫn, API, quyền giữ nguyên).
  - Trang mới `/reports/kpi-sales` "Báo cáo KPI": bộ lọc Tháng–Năm (mặc định tháng hiện tại), Phòng ban, Nhóm dịch vụ, Nhân viên; bảng STT, Mã NV, Họ tên, Tổng doanh số, Doanh thu thuần, Mục tiêu, Tỷ lệ đạt (%); dòng tổng; nút "Xuất Excel" (chỉ desktop, như các báo cáo khác).
  - Trang Thông tin tài khoản: thẻ "KPI doanh số của tôi" với nút chuyển tháng ‹ › (mặc định tháng hiện tại).
  - Cập nhật `permissionLabels.ts` + khối "Cách phân quyền hoạt động" + `docs/product/PERMISSIONS.md`.
- Ngoài phạm vi: biểu đồ.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-087 | An (MANAGER) | mở menu "Báo cáo" | Thứ tự: "Công việc theo nhân viên", "Báo cáo KPI", "Doanh thu theo khách hàng", "Doanh thu theo nhân viên", "Chi phí quà tặng KH"; không còn mục nào tên "Báo cáo KPI" trỏ tới `/reports/kpi` | component |
| AC-RPT-088 | An mở `/reports/kpi` | render | Tiêu đề trang "Công việc theo nhân viên"; nội dung như cũ | component |
| AC-RPT-089 | Hôm nay 01/11/2026 | An mở `/reports/kpi-sales` | Bộ chọn tháng = "11/2026"; gọi API `month=2026-11`; bảng có đủ 7 cột theo thứ tự trên; tiền định dạng `130.000.000 ₫`; tỷ lệ `125,0%` | component |
| AC-RPT-090 | Dòng có `achievement_pct ≥ 100` / `< 100` / `null` | render | Tỷ lệ tô xanh (`completed`) / mặc định / hiện "—"; `target=null` hiện "Chưa đặt"; `net_revenue=null` hiện "—" kèm chú thích "Thiếu giá vốn" | component |
| AC-RPT-091 | — | An chọn Phòng ban, Nhóm dịch vụ (từ danh mục Nhóm SP/DV), Nhân viên | Gọi API với `department_id`, `group_id`, `employee_id` tương ứng | component |
| AC-RPT-092 | Không có dòng | render | "Chưa có dữ liệu KPI cho tháng 11/2026" | component |
| AC-RPT-093 | 1440px | bấm "Xuất Excel" | Tải `bao-cao-kpi-2026-11.csv`; 390px không có nút | component |
| AC-RPT-094 | 390px | mở trang | Mỗi nhân viên 1 thẻ (STT · Mã NV · Họ tên, 4 số liệu 2×2); không cuộn ngang | e2e |
| AC-RPT-095 | Sale/CSKH/QLKT/KTV | menu "Báo cáo" / truy cập `/reports/kpi-sales` | Không thấy mục "Báo cáo KPI"; vào URL trực tiếp → trang "Không có quyền" | component |
| AC-RPT-096 | Hoa (SALE) | mở Thông tin tài khoản | Thẻ "KPI doanh số của tôi — Tháng 11/2026": Tổng doanh số, Doanh thu thuần, Mục tiêu, Tỷ lệ đạt | component |
| AC-RPT-097 | Hoa | bấm nút "Tháng trước" (‹) để sang 10/2026 | Gọi `/me/kpi-sales?month=2026-10`, thẻ cập nhật | component |
| AC-RPT-098 | Khang (KTV) chưa có chỉ tiêu | mở Thông tin tài khoản | Thẻ hiện Mục tiêu "Chưa đặt", Tỷ lệ "—" | component |
| AC-RPT-099 | Hoa (SALE) | mở Thông tin tài khoản ở tablet/desktop (≥ 768px) / điện thoại 390px | ≥ 768px: thẻ thông tin cá nhân và thẻ "KPI doanh số của tôi" nằm cùng 1 hàng (2 cột); 390px: xếp dọc, thẻ KPI bên dưới (chủ sản phẩm yêu cầu 2026-11-03) | component + e2e |

## 4. API
Dùng API M21-02a; `/reports/kpi` giữ nguyên.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `/reports/kpi-sales` theo bố cục các báo cáo doanh thu (M15-09b/M15-10b): header "Báo cáo KPI", hàng bộ lọc, bảng desktop / thẻ mobile, dòng tổng cuối bảng in đậm "Tổng cộng".
- Ô Nhân viên dùng `GET /employees/lookup` (M16-11) như ô "Người nhận doanh số".
- Thẻ trong Thông tin tài khoản đặt dưới phần thông tin cá nhân, tiêu đề "KPI doanh số của tôi", 2 nút ‹ "Tháng trước" / › "Tháng sau" bên phải tiêu đề — **không dùng ô nhập** để trang Cá nhân vẫn "chỉ xem" (AC-EMP-073); chủ dự án chốt 2026-11-03.
- Screenshot 390px + 1440px cho cả 2 màn → `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. Manager → Báo cáo: thấy "Công việc theo nhân viên" (báo cáo cũ) và "Báo cáo KPI".
2. Mở Báo cáo KPI tháng hiện tại → so sánh với chỉ tiêu đã đặt ở M21-01b.
3. Lọc nhóm "Thiết bị an ninh" → số liệu giảm đúng.
4. Đăng nhập Sale → Thông tin tài khoản → thẻ KPI của mình; đổi tháng.

## 8. Giả định & câu hỏi
- Không thêm câu hỏi mới (xem Q149, Q150 ở M21-02a).
