# M15-04 — Dashboard: Top 10 khách hàng & tổng hợp đánh giá KH

- **Status:** Draft
- **Backlog:** M15-04 · **Milestone:** M15
- **Liên quan:** `docs/specs/M7-02-role-dashboard.md` (`GET /api/v1/dashboard`, cấu trúc section theo vai trò); M15-01 (role `CUSTOMER_CARE`); M15-02a (`csat_rating`); `spec/permissions.yaml#dashboard.read`

## 1. Mục tiêu
Là Manager/Quản lý kỹ thuật/Sale/CSKH, tôi muốn thấy ngay trên "Tổng quan" top 10 khách hàng doanh thu cao nhất và tổng hợp số lượng đánh giá của khách, để nắm nhanh tình hình kinh doanh và chất lượng dịch vụ.

## 2. Phạm vi
- Trong phạm vi:
  - `spec/permissions.yaml#dashboard.read`: thêm `CUSTOMER_CARE: all`.
  - `GET /api/v1/dashboard` thêm 2 section mới, hiện khi người gọi có **bất kỳ** vai trò MANAGER/TECH_LEAD/SALE/CUSTOMER_CARE (không hiện cho TECHNICIAN thuần):
    - `top_customers` — 10 khách hàng có `total` (Σ đơn `COMPLETED`, theo tháng hiện tại — xem §8) cao nhất, mỗi dòng `{customer_id, customer_code, customer_name, order_count, total_revenue}`.
    - `feedback_summary` — đếm đơn theo `csat_rating` trong tháng hiện tại: `{"5":n,"4":n,"3":n,"2":n,"1":n,"none":n}` (tái dùng logic từ `GET /orders/csat-summary`, M15-02a).
  - Khối UI "Top 10 khách hàng" (bảng/thẻ xếp theo doanh thu giảm dần) + khối "Phản hồi – đánh giá từ khách hàng" (5 thẻ số theo sao) trên trang Tổng quan.
- Ngoài phạm vi: bộ lọc ngày tuỳ chọn cho dashboard (mặc định cố định "tháng hiện tại", không có UI chọn khoảng ngày ở Tổng quan — khác với màn tra cứu M15-02b).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-054 | Tháng hiện tại có đơn `COMPLETED` của 15 khách hàng khác nhau, doanh thu khác nhau | An (MANAGER) `GET /api/v1/dashboard` | `top_customers` có đúng 10 phần tử, sắp theo `total_revenue` giảm dần | integration |
| AC-DASH-055 | Tháng hiện tại chỉ có 3 khách hàng có đơn `COMPLETED` | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | `top_customers` có đúng 3 phần tử (không cần đệm cho đủ 10) | integration |
| AC-DASH-056 | 10 đơn `COMPLETED` tháng này: 3×5★, 2×4★, 1×3★, 1×2★, 1×1★, 2 chưa đánh giá | Lan (CUSTOMER_CARE) `GET /api/v1/dashboard` | `feedback_summary = {"5":3,"4":2,"3":1,"2":1,"1":1,"none":2}` | integration |
| AC-DASH-057 | Đức (TECHNICIAN, không có vai trò khác) | `GET /api/v1/dashboard` | Response không có khoá `top_customers`/`feedback_summary` | integration |
| AC-DASH-058 | An (MANAGER) mở "Tổng quan" trên desktop (1440px) | render | Thấy khối "Top 10 khách hàng" (bảng: mã KH, tên, số đơn, doanh thu) cạnh khối "Phản hồi – đánh giá từ khách hàng" (5 thẻ số theo sao, có màu theo mức: 4–5★ xanh, 3★ vàng, 1–2★ hồng) | component |
| AC-DASH-059 | Lan (CUSTOMER_CARE) mở "Tổng quan" trên mobile (390px) | render | 2 khối trên xếp dọc, bảng Top 10 cuộn ngang nếu cần, không vỡ layout | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| GET | /api/v1/dashboard | dashboard.read | Thêm `top_customers`, `feedback_summary` vào response khi vai trò phù hợp (§2); thêm `CUSTOMER_CARE: all` vào bảng quyền |

## 5. Dữ liệu / Migration
Không có (dùng lại `orders.total`, `orders.csat_rating` đã có từ M15-02a).

## 6. UI
- Khối mới chèn vào trang "Tổng quan" sau các khối hiện có, trước `today_tasks` (nếu có).
- Copy: "Top 10 khách hàng (tháng này)", "Phản hồi – đánh giá từ khách hàng (tháng này)".

## 7. Kịch bản UAT thủ công
1. Seed vài đơn Hoàn tất với khách hàng và `csat_rating` khác nhau trong tháng hiện tại.
2. Đăng nhập Manager → Tổng quan → thấy đúng Top 10 + tổng hợp sao.
3. Đăng nhập Kỹ thuật viên thuần → không thấy 2 khối này.

## 8. Giả định & câu hỏi
- Giả định: "doanh thu" dùng cho Top 10 = tổng `total` (đã gồm VAT) của đơn `COMPLETED` trong **tháng hiện tại** theo giờ Việt Nam — không gộp đơn tháng trước, không trừ giá vốn (khác "lợi nhuận" ở báo cáo M15-09/10). → ghi vào `OPEN_QUESTIONS.md`: Top 10 nên tính theo tháng hiện tại (khớp cách nói "Tổng quan" luôn phản ánh hiện tại, giống `order_summary`), theo khoảng ngày tuỳ chọn (cần thêm bộ lọc), hay lũy kế toàn thời gian? Mặc định chọn "tháng hiện tại" cho nhất quán với cách Dashboard hiện tại không có bộ lọc ngày.
- Giả định: khách lẻ (đơn không có `customer_id`) không được tính vào `top_customers` (không có "khách hàng" để nhóm theo).
