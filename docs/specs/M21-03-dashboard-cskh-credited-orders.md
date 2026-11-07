# M21-03 — Tổng quan CSKH: thẻ "Đơn ghi doanh số tháng này"

- **Status:** Approved (2026-11-01, chủ dự án chốt Q146–Q156)
- **Backlog:** M21-03 · **Milestone:** M21
- **Phụ thuộc:** M16-04 (`order_lines.credited_employee_id`), M18-01c (popup chi tiết thẻ khối CSKH), M20-10 (lưới thẻ đều nhau)
- **Liên quan:** spec/permissions.yaml#dashboard.read

## 1. Mục tiêu
Là CSKH, tôi muốn trên Tổng quan thấy số đơn hàng phát sinh trong tháng mà tôi được ghi doanh số, để theo dõi phần doanh số của mình.

## 2. Phạm vi
- Trong phạm vi:
  - `DashboardOut.care_credited_order_count: int` — số đơn **khác nhau**, tạo trong tháng hiện tại (giờ VN, `orders.created_at`), trạng thái **không** `DRAFT`/`CANCELLED`, có ≥1 dòng hàng `credited_employee_id`:
    - người gọi có vai trò `CUSTOMER_CARE` (và không phải MANAGER) → `= chính mình`;
    - người gọi là `MANAGER` → thuộc **bất kỳ** nhân viên đang có vai trò `CUSTOMER_CARE`.
  - Chỉ trả khoá này cho MANAGER hoặc CUSTOMER_CARE; SALE/TECH_LEAD/TECHNICIAN vắng khoá (thẻ không hiện).
  - Thẻ thứ 4 trong khối "Chăm sóc khách hàng (tháng này)", bấm mở popup danh sách đơn (card `care.credited_orders`, khung M18-01a: Mã đơn, Khách hàng, Ngày tạo, Trạng thái, Doanh số ghi cho CSKH) + xuất Excel desktop.
  - Lưới khối CSKH: 2 thẻ/hàng ở 390px, 4 thẻ/hàng từ `md:` (thay `md:grid-cols-3`; bỏ `col-span-2` của thẻ đầu vì giờ chẵn 4 thẻ). Với vai trò không có thẻ mới (SALE/QLKT) giữ bố cục 3 thẻ như M20-10.
- Ngoài phạm vi: thay đổi các thẻ CSKH khác.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-123 | Mai (CSKH). Tháng 11/2026: đơn A (IN_PROGRESS) 2 dòng ghi Mai; đơn B (COMPLETED) 1 dòng ghi Mai + 1 dòng ghi Hoa; đơn C (DRAFT) ghi Mai; đơn D (CANCELLED) ghi Mai; đơn E tạo 28/10 ghi Mai | Mai `GET /dashboard` | `care_credited_order_count = 2` (A, B) | integration |
| AC-DASH-124 | Như trên + Lan (CSKH) có đơn F tháng 11 ghi Lan; Hoa (SALE) có đơn G ghi Hoa | An (MANAGER) `GET /dashboard` | `care_credited_order_count = 3` (A, B, F — không tính G) | integration |
| AC-DASH-125 | Đơn tạo 31/10/2026 23:50 giờ VN ghi Mai | Mai `GET /dashboard` ngày 01/11 | Không tính | integration |
| AC-DASH-126 | Hoa (SALE), Bình (TECH_LEAD), Khang (TECHNICIAN) | `GET /dashboard` | Không có khoá `care_credited_order_count` | integration |
| AC-DASH-127 | Như AC-123 | Mai `GET /dashboard/cards/care.credited_orders/items` | 2 dòng (A, B); dòng B có `credited_total` = tổng `line_total` các dòng ghi Mai (không cộng dòng của Hoa) | integration |
| AC-DASH-128 | SALE | `GET /dashboard/cards/care.credited_orders/items` | 403 | integration |
| AC-DASH-129 | Mai đăng nhập | Tổng quan 1440px / 390px | Khối CSKH có thẻ "Đơn ghi doanh số" (gợi ý "Tháng này") — 4 thẻ một hàng ở 1440px, 2×2 ở 390px, cao đều nhau | component + e2e |
| AC-DASH-130 | Mai | bấm thẻ | Mở popup "Đơn ghi doanh số" với danh sách đơn; desktop có nút "Xuất Excel" | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| GET | /api/v1/dashboard | dashboard.read | thêm `care_credited_order_count?: int` |
| GET | /api/v1/dashboard/cards/care.credited_orders/items \| /export | dashboard.read | card mới, áp cùng phạm vi như trên; vai trò khác → 403 |

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Nhãn thẻ: "Đơn ghi doanh số"; hint: "Của tôi" (CSKH) / "Của CSKH" (Manager).
- Screenshot 390px + 1440px → `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. Tạo 2 đơn tháng này, ghi doanh số 1 dòng cho CSKH Mai; gửi đơn.
2. Đăng nhập Mai → Tổng quan → thẻ "Đơn ghi doanh số" = 2 → bấm xem danh sách.
3. Đăng nhập Manager → thẻ gộp mọi CSKH.

## 8. Giả định & câu hỏi
- Chốt 2026-11-01: CSKH chỉ đếm đơn ghi doanh số cho chính mình; Manager đếm cho mọi CSKH.
- Giả định (Q151): "phát sinh trong tháng" = **tạo** trong tháng (không phải hoàn tất), loại Nháp và Huỷ.
- Giả định (Q152): người vừa là Manager vừa có vai trò CSKH (M15-01: Manager tự có CSKH) → xem theo cách của Manager.
