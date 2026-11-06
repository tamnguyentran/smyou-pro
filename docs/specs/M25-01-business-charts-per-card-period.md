# M25-01 — "Biểu đồ kinh doanh": khoảng thời gian riêng cho từng card biểu đồ

- **Status:** Approved
- **Backlog:** M25-01 · **Milestone:** M25
- **Phụ thuộc:** M23a (3 endpoint `/reports/business-charts/{results,sales,staff}` nhận `from`/`to` dạng `YYYY-MM`), M23b (màn 3 tab, `ChartCard` có khe `controls`), M21-06a (`DateField mode="month"`)
- **Liên quan:** docs/design/UI_GUIDELINES.md §4 (mobile), §8 (a11y)

## 1. Mục tiêu
Là Manager, tôi muốn mỗi card biểu đồ có bộ chọn thời gian riêng với mặc định hợp lý cho chính biểu đồ đó, thay vì 1 bộ lọc chung 12 tháng cho cả trang.

## 2. Phạm vi
- Trong phạm vi (chỉ frontend — **không** đổi API, quyền, menu):
  - **Bỏ** bộ lọc "Từ tháng – Đến tháng" chung ở đầu trang (yêu cầu chủ SP 2026-11-04).
  - Mỗi card có bộ chọn riêng trong khe `controls` của `ChartCard`, gọi endpoint M23a hiện có với `from`/`to` của chính card đó:

    | # | Card (tab) | Kiểu chọn | Mặc định (T = tháng hiện tại, giờ VN) | Endpoint / phần dữ liệu dùng |
    |---|---|---|---|---|
    | 1 | Doanh thu & Lợi nhuận theo tháng (Kết quả KD) | Từ tháng – Đến tháng | T−2 → T (3 tháng gần nhất) | `/results` → `monthly` |
    | 2 | Cơ cấu doanh thu/lợi nhuận (Kết quả KD) | Từ tháng – Đến tháng | T → T | `/results` → `composition` |
    | 3 | Khách hàng mới & quay lại (Kết quả KD) | Từ tháng – Đến tháng | T → T | `/results` → `customers_monthly` |
    | 4 | Phân tích Pareto 80/20 (Bán hàng & SP) | Từ tháng – Đến tháng | T−2 → T | `/sales?metric=` → `pareto` |
    | 5a | Top bán chạy (Bán hàng & SP) | Từ tháng – Đến tháng | T−2 → T | `/sales` → `top_selling` |
    | 5b | Top bán chậm (Bán hàng & SP) | Từ tháng – Đến tháng | T−2 → T | `/sales` → `slow_selling` |
    | 6 | Giờ được phân công theo KTV (Nhân sự & KPI) | 1 ô chọn tháng | T | `/staff?from=M&to=M` → `hours_by_technician` |
    | 7 | Tỷ lệ hoàn thành KPI theo nhân viên (Nhân sự & KPI) | 1 ô chọn tháng | T | `/staff?from=M&to=M` → `kpi_completion` |
  - Kiểm tra khoảng của từng card giống bộ lọc cũ: Từ > Đến → "Tháng bắt đầu phải trước hoặc bằng tháng kết thúc"; quá 24 tháng → "Chỉ xem tối đa 24 tháng"; sau tháng hiện tại → "Không được sau tháng MM/YYYY". Lỗi hiện ngay dưới bộ chọn của card đó (`role="alert"`), card đó không gọi API; các card khác không bị ảnh hưởng.
  - Đổi khoảng ở 1 card chỉ tải lại card đó (các card cùng endpoint nhưng khác khoảng là các query riêng; cùng khoảng thì dùng chung cache).
  - Các thứ đang có trên card giữ nguyên: radio Doanh thu/Lợi nhuận (card 2, card 4), popup chi tiết/xuất Excel, tooltip, skeleton khi đang tải.
  - Mobile 390px: bộ chọn xuống dòng dưới tiêu đề card, 2 ô tháng chia đôi chiều ngang, vùng chạm ≥ 44px; desktop: bộ chọn nằm bên phải tiêu đề.
  - Khoảng đã chọn **không** được lưu: tải lại trang hoặc đổi tab thì về mặc định (Q182).
- Ngoài phạm vi: đổi API/tính toán M23a; lưu lựa chọn theo người dùng; card 6 và 7 dùng chung 1 ô chọn.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-161 | Hôm nay 04/11/2026; An (MANAGER) | Mở "Biểu đồ kinh doanh" | Không còn bộ lọc thời gian chung ở đầu trang; card "Doanh thu & Lợi nhuận theo tháng" hiện Từ 09/2026 – Đến 11/2026 và gọi `/results?from=2026-09&to=2026-11` | component |
| AC-RPT-162 | Như AC-161 | Tab "Kết quả KD" | Card "Cơ cấu doanh thu" và "Khách hàng mới & quay lại" đều mặc định 11/2026 – 11/2026, dữ liệu lấy từ `/results?from=2026-11&to=2026-11` | component |
| AC-RPT-163 | Như AC-161 | Tab "Bán hàng & SP" | "Phân tích Pareto 80/20", "Top bán chạy", "Top bán chậm" đều mặc định 09/2026 – 11/2026 (`/sales?from=2026-09&to=2026-11`) | component |
| AC-RPT-164 | Như AC-161 | Tab "Nhân sự & KPI" | "Giờ được phân công theo KTV" và "Tỷ lệ hoàn thành KPI" mỗi card có 1 ô chọn tháng, mặc định 11/2026, gọi `/staff?from=2026-11&to=2026-11` | component |
| AC-RPT-165 | Tab "Nhân sự & KPI" mặc định | An đổi tháng card "Giờ được phân công" sang 08/2026 | Card đó gọi `/staff?from=2026-08&to=2026-08` và hiện giờ của tháng 08; card "Tỷ lệ hoàn thành KPI" vẫn tháng 11/2026, không tải lại | component |
| AC-RPT-166 | Tab "Kết quả KD" mặc định | An đổi card "Cơ cấu doanh thu" thành 01/2026 – 06/2026 | Chỉ card cơ cấu đổi dữ liệu (`/results?from=2026-01&to=2026-06`); card "Doanh thu & Lợi nhuận theo tháng" vẫn 09–11/2026 | component |
| AC-RPT-167 | Card "Top bán chậm" | An chọn Từ 10/2026, Đến 08/2026 | Dưới bộ chọn của card hiện "Tháng bắt đầu phải trước hoặc bằng tháng kết thúc" (`role="alert"`), không gọi API cho khoảng này; card "Top bán chạy" vẫn hiển thị bình thường | component |
| AC-RPT-168 | Card "Doanh thu & Lợi nhuận theo tháng" | An chọn 01/2024 – 11/2026 (35 tháng) | Hiện "Chỉ xem tối đa 24 tháng", card không gọi API | component |
| AC-RPT-169 | Card "Phân tích Pareto 80/20" đã đổi sang 06–08/2026 | An bấm radio "Lợi nhuận" | Gọi `/sales?from=2026-06&to=2026-08&metric=profit`; khoảng của card không đổi | component |
| AC-RPT-170 | An mở trang ở 390px và 1440px | Xem từng tab | Bộ chọn tháng nằm trong card, không tràn ngang trang; mỗi ô chọn cao ≥ 44px; không có lỗi axe | e2e |

## 4. API
Không đổi — dùng 3 endpoint M23a hiện có (`report.business_charts.read`, chỉ MANAGER). Card 6/7 gửi `from = to = tháng đã chọn`; KPI lấy tháng cuối kỳ (Q172) nên đúng tháng đã chọn.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `BusinessChartsPage`: bỏ state `range` và khối 2 `DateField` chung; vẫn giữ 3 tab.
- Component mới dùng chung `CardMonthRange` (2 `DateField mode="month"` + thông báo lỗi) và `CardMonth` (1 ô tháng), đặt vào `controls` của `ChartCard`; tách hàm `periodError` của trang ra dùng chung.
- Mỗi card tự giữ khoảng của mình và tự gọi `useBusinessResults` / `useBusinessSales` / `useBusinessStaff`.

## 7. Kịch bản UAT thủ công
1. Mở trang: không còn bộ lọc chung; kiểm tra mặc định 7 card như bảng §2.
2. Đổi khoảng ở 1 card → chỉ card đó đổi số liệu.
3. Chọn khoảng sai (Từ > Đến) → thấy lỗi ngay dưới card đó.
4. Mở trên điện thoại: bộ chọn gọn trong card, không phải cuộn ngang.

## 8. Giả định & câu hỏi
- Đã chốt với chủ SP (2026-11-04): mục 2 "trong tháng" = tháng hiện tại; mục 6, 7 chỉ cần 1 ô chọn tháng bất kỳ (mặc định tháng hiện tại); bỏ bộ lọc chung.
- **Q180** "3 tháng gần nhất" = tháng hiện tại + 2 tháng trước (VD 09–11/2026), tính cả tháng đang dở.
- **Q181** Mục 5 "Top bán chạy, Top bán chậm": mỗi card có bộ chọn riêng (đều mặc định 3 tháng gần nhất), không dùng chung 1 bộ chọn.
- **Q182** Khoảng đã chọn không được lưu: tải lại trang hoặc chuyển sang tab khác rồi quay lại thì card về mặc định.
- Card 1/2/3 cùng gọi `/results` với khoảng khác nhau → tối đa 3 request cho tab đầu (mỗi request ~vài chục ms); chấp nhận được, không cần tách endpoint.
- Không cần sửa `spec/*.yaml` (không đổi quyền/menu).
