# M23b — UI: màn "Biểu đồ kinh doanh" (3 nhóm biểu đồ), chỉ Manager

- **Status:** Approved (2026-11-04 — chủ dự án đồng ý mặc định Q173–Q174)
- **Backlog:** M23b · **Milestone:** M23
- **Phụ thuộc:** M23a (3 endpoint `/reports/business-charts/*`, menu, capability), M21-06a (`DateField` kiểu tháng)
- **Liên quan:** docs/design/UI_GUIDELINES.md §2 (token màu), §4 (mobile), §8 (a11y); ADR mới — thư viện biểu đồ (Q173)

> **Cập nhật bởi M25-01 (2026-11-04):** bộ lọc "Từ tháng – Đến tháng" chung cho cả trang (mặc định 12 tháng) đã bị bỏ; mỗi card có bộ chọn kỳ riêng — xem `docs/specs/M25-01-business-charts-per-card-period.md`. Phần "kỳ" trong AC-RPT-123/125–129/131/137 và toàn bộ AC-RPT-132 nay áp dụng cho bộ chọn trong từng card; test đã cập nhật theo (chủ SP đồng ý 2026-11-04).

## 1. Mục tiêu
Là Manager, tôi muốn xem trên một màn các biểu đồ doanh thu/lợi nhuận, cơ cấu, khách mới/quay lại, Pareto, bán chạy/bán chậm, giờ phân công và tỷ lệ KPI theo kỳ tôi chọn, để nắm nhanh tình hình kinh doanh trên cả điện thoại lẫn máy tính.

## 2. Phạm vi
- Trong phạm vi:
  - Trang `/reports/business-charts`, tiêu đề "Biểu đồ kinh doanh"; bộ lọc "Từ tháng" – "Đến tháng" (`DateField` kiểu `MM/yyyy`, mặc định 12 tháng gần nhất, `max` = tháng hiện tại).
  - 3 tab: "Kết quả kinh doanh" (mặc định), "Bán hàng & sản phẩm", "Nhân sự & KPI"; mỗi tab gọi đúng 1 endpoint M23a, chỉ tải khi mở tab; tab đang chọn lưu trên URL (`?tab=sales`).
  - **Kết quả kinh doanh**: (1) biểu đồ kết hợp "Doanh thu & Lợi nhuận theo tháng" — cột Doanh thu + đường Lợi nhuận; (2) biểu đồ tròn "Cơ cấu" — radio "Doanh thu / Lợi nhuận" + chọn chiều "Nhóm SP/DV / Sản phẩm – Dịch vụ / Loại khách hàng"; (3) cột nhóm "Khách hàng mới & quay lại" theo tháng.
  - **Bán hàng & sản phẩm**: (4) Pareto 80/20 — radio "Doanh thu / Lợi nhuận", cột giá trị + đường % luỹ kế (trục phải 0–100%) + đường tham chiếu 80%, cột nhóm "vital" tô màu đậm; (5) cột ngang "Top bán chạy" và (6) "Top bán chậm" (số lượng + đơn vị).
  - **Nhân sự & KPI**: (7) cột "Giờ được phân công theo kỹ thuật viên"; (8) cột + bảng "Tỷ lệ hoàn thành KPI theo nhân viên" (tháng cuối kỳ), vạch 100%.
  - Thư viện biểu đồ mới (đề xuất Recharts, nạp lười theo route) + ADR.
- Ngoài phạm vi: xuất Excel/ảnh biểu đồ; bấm vào biểu đồ để xem chi tiết đơn; lọc phòng ban/nhân viên.

## 3. Acceptance Criteria
Dữ liệu mẫu: như M23a §3 (kỳ 09–10/2026).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-123 | An (MANAGER) | mở menu "Báo cáo" → "Biểu đồ kinh doanh" | URL `/reports/business-charts`, tiêu đề "Biểu đồ kinh doanh", tab "Kết quả kinh doanh" đang chọn, bộ lọc "Từ tháng 12/2025 – Đến tháng 11/2026" (hôm nay 04/11/2026) | component + e2e |
| AC-RPT-124 | Hoa (SALE) | mở thẳng URL `/reports/business-charts` | Không thấy mục menu; trang hiện "Bạn không có quyền xem trang này" (như các báo cáo khác); không gọi API biểu đồ | component |
| AC-RPT-125 | Dữ liệu mẫu, chọn kỳ 09/2026–10/2026 | xem tab "Kết quả kinh doanh" | Biểu đồ kết hợp có 2 nhóm tháng "T9/2026", "T10/2026"; tooltip tháng 10: "Doanh thu: 3.700.000 ₫", "Lợi nhuận: 950.000 ₫"; trục Y rút gọn ("3,7 tr") | component |
| AC-RPT-126 | Như trên | chọn radio "Lợi nhuận", chiều "Loại khách hàng" ở biểu đồ Cơ cấu | Biểu đồ tròn đổi sang lợi nhuận theo "Cá nhân"/"Tổ chức", chú giải có % làm tròn 1 chữ số; không gọi lại API | component |
| AC-RPT-127 | Như trên | xem "Khách hàng mới & quay lại" | 2 cột mỗi tháng, màu khác nhau, chú giải "Khách mới", "Khách quay lại"; tooltip ghi số khách | component |
| AC-RPT-128 | Dữ liệu AC-RPT-109 | mở tab "Bán hàng & sản phẩm" | URL `?tab=sales`; gọi `GET .../sales?metric=revenue` 1 lần; Pareto có 5 cột, 2 cột đầu tô đậm, đường luỹ kế điểm cuối 100%, đường tham chiếu nhãn "80%" | component |
| AC-RPT-129 | Như trên | chọn radio "Lợi nhuận" ở Pareto | Gọi `GET .../sales?metric=profit`; biểu đồ vẽ lại | component |
| AC-RPT-130 | Dữ liệu AC-RPT-112/113 | xem "Top bán chạy", "Top bán chậm" | Cột ngang, nhãn tên SP/DV đầy đủ (cắt "…" nếu quá dài, tooltip hiện đủ); giá trị "4 Cái"; mục bán chậm 0 hiện "0" (không ẩn) | component |
| AC-RPT-131 | Dữ liệu AC-RPT-114/116 | mở tab "Nhân sự & KPI" | Biểu đồ giờ: Quân 8 giờ, Long 5,5 giờ; KPI: tiêu đề "Tỷ lệ hoàn thành KPI theo nhân viên — 10/2026", Tuấn 125%, Hoa 80%, có vạch 100%; bảng dưới có Mai "—" | component |
| AC-RPT-132 | Chọn "Từ tháng" 11/2026, "Đến tháng" 09/2026 | — | Không gọi API; lỗi dưới ô: "Tháng bắt đầu phải trước hoặc bằng tháng kết thúc"; kỳ > 24 tháng: "Chỉ xem tối đa 24 tháng" | component |
| AC-RPT-133 | Kỳ không có dữ liệu | xem từng tab | Mỗi biểu đồ không có dữ liệu hiện ô trống "Chưa có dữ liệu trong kỳ này" (không vẽ trục rỗng); biểu đồ theo tháng vẫn vẽ cột 0 | component |
| AC-RPT-134 | API trả 500 | mở tab | Khối lỗi "Không tải được số liệu" + nút "Thử lại" (≥ 44px); đang tải hiện skeleton đúng chiều cao biểu đồ | component |
| AC-RPT-135 | Màn hình 390px | mở từng tab | Bộ lọc 2 ô xếp dọc; tab cuộn ngang được, chạm ≥ 44px; biểu đồ rộng 100%, cao 280px, xếp 1 cột, không cuộn ngang trang; chú giải nằm dưới biểu đồ | e2e (mobile) + screenshot |
| AC-RPT-136 | Màn hình 1440px | mở tab "Kết quả kinh doanh" | Biểu đồ kết hợp chiếm full chiều ngang; "Cơ cấu" và "Khách hàng mới & quay lại" xếp 2 cột; cao 320px | e2e (desktop) + screenshot |
| AC-RPT-137 | Mỗi biểu đồ | kiểm tra a11y (axe) | Mỗi biểu đồ có `role="img"` + `aria-label` tóm tắt (vd "Doanh thu và lợi nhuận theo tháng, 09/2026–10/2026"); màu lấy từ token UI_GUIDELINES §2, cặp màu đạt tương phản; axe 0 vi phạm nghiêm trọng | component + e2e |
| AC-RPT-138 | Người dùng không mở trang biểu đồ | tải ứng dụng | Thư viện biểu đồ nằm trong chunk riêng của route (không vào bundle chính) — kiểm bằng build output | unit (build check) |

## 4. API
Không có endpoint mới — dùng 3 endpoint M23a (TS types sinh bằng `make contract`).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Vị trí: menu "Báo cáo" → "Biểu đồ kinh doanh" (icon `ChartPie`), chỉ Manager.
- Mỗi biểu đồ nằm trong card (style card hiện có), tiêu đề card + điều khiển (radio/chọn chiều) ở góc phải desktop, xuống dòng dưới tiêu đề trên mobile.
- Định dạng: tiền trong tooltip/bảng `12.500.000 ₫`; trục rút gọn "tr"/"tỷ"; giờ `5,5 giờ`; % `80,0%`; tháng "T10/2026".
- Màu: Doanh thu = primary, Lợi nhuận = success/xanh lá token, lợi nhuận âm dùng token danger; khách mới / quay lại 2 token phân biệt rõ.
- Copy: "Kết quả kinh doanh", "Bán hàng & sản phẩm", "Nhân sự & KPI", "Doanh thu & Lợi nhuận theo tháng", "Cơ cấu doanh thu", "Cơ cấu lợi nhuận", "Nhóm SP/DV", "Sản phẩm – Dịch vụ", "Loại khách hàng", "Khách hàng mới & quay lại", "Phân tích Pareto 80/20", "Top bán chạy", "Top bán chậm", "Giờ được phân công theo kỹ thuật viên", "Tỷ lệ hoàn thành KPI theo nhân viên", "Chưa có dữ liệu trong kỳ này", "Không tải được số liệu", "Thử lại".

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → "Báo cáo" → "Biểu đồ kinh doanh": thấy 3 biểu đồ của 12 tháng gần nhất.
2. Đổi kỳ 09/2026–10/2026, rê chuột tháng 10 → số doanh thu khớp "Báo cáo KPI" tháng 10.
3. Đổi radio "Lợi nhuận" ở biểu đồ tròn và Pareto → biểu đồ đổi.
4. Mở tab "Nhân sự & KPI" → thấy giờ phân công từng KTV và % KPI tháng 10.
5. Mở trên điện thoại → biểu đồ xếp dọc, không phải kéo ngang.

## 8. Giả định & câu hỏi
- **Q173** — Thư viện biểu đồ: dùng **Recharts** (React, SVG, phổ biến, hỗ trợ combo/Pareto/ngang), nạp lười theo route; ghi ADR-016. Phương án khác: Chart.js (canvas, nhẹ hơn nhưng khó test DOM).
- **Q174** — Bố cục 3 **tab** (mỗi tab 1 lần gọi API) thay vì 1 trang dài cuộn hết 8 biểu đồ.
- Thừa hưởng Q165–Q172 của M23a.
