# M16-06 — Báo cáo "Doanh thu theo khách hàng": cột "người bán" tính theo dòng hàng (Ghi doanh số)

- **Status:** Approved (2026-10-24, chủ dự án chốt trực tiếp trong phiên — xem mục 8; thay thế quyết định Q88/Q96 cũ cho báo cáo này)
- **Backlog:** M16-06 · **Milestone:** M16
- **Phụ thuộc:** M16-04 (field `order_lines.credited_employee_id`); cùng đợt với M16-05 (báo cáo theo NV) để 2 báo cáo nhất quán cách tính "người bán"
- **Thay thế:** `docs/specs/M15-09a-revenue-by-customer-report-api.md`, `docs/specs/M15-09b-revenue-by-customer-report-ui.md`

## 1. Mục tiêu
Là Manager/Sale/CSKH/QLKT, tôi muốn "Doanh thu theo khách hàng" nhóm "người bán" theo đúng nhân viên được "Ghi doanh số" trên từng dòng hàng, nhất quán với báo cáo "Doanh thu theo nhân viên" (M16-05), không còn dựa vào người tạo đơn.

## 2. Phạm vi
- Trong phạm vi:
  - **Trục nhóm đổi**: từ `(customer_id, orders.created_by)` sang `(Order.customer_id, order_lines.credited_employee_id)` — tính theo dòng hàng, giống M16-05.
  - Dòng không ghi ai (`credited_employee_id IS NULL`) → nhóm "người bán" = **"Chưa gán"** (`seller: null`, `unassigned: true`) trong phạm vi của từng khách hàng (1 khách hàng có thể có cả dòng đã gán và dòng "Chưa gán").
  - **`own` đổi nghĩa** giống M16-05: SALE/CUSTOMER_CARE chỉ thấy dòng có `credited_employee_id = chính mình`.
  - `subtotal_revenue`/`profit`/`order_count` tính theo dòng, cùng công thức M16-05 §2.
  - Drilldown `GET /{customer_id}/orders` (đơn) → `GET /{customer_id}/lines` (dòng hàng, `RevenueLineOut` — định nghĩa tại M16-05 §4, dùng chung). Query `seller_id: uuid | None` (giữ hành vi cũ: bỏ trống = mọi người bán của KH này) + thêm `unassigned: bool = False` (lọc đúng nhóm "Chưa gán" của KH này) — không truyền cả 2 cùng lúc (422).
- Ngoài phạm vi: báo cáo theo nhân viên (đã làm ở M16-05).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-065 | Khách hàng KH01 có đơn A (dòng 1 ghi cho Hoa 100tr, dòng 2 ghi cho Tuấn 50tr) | An (MANAGER) `GET /reports/revenue-by-customer` | 2 dòng cho KH01: 1 dòng `seller=Hoa, subtotal_revenue=100_000_000`; 1 dòng `seller=Tuấn, subtotal_revenue=50_000_000` | integration |
| AC-RPT-066 | Khách hàng KH02 có đơn B, 1 dòng không ghi ai (20tr) | An `GET /reports/revenue-by-customer` | 1 dòng cho KH02: `unassigned=true, seller=null, subtotal_revenue=20_000_000` | integration |
| AC-RPT-067 | Hoa (SALE) tạo đơn cho KH03 nhưng dòng hàng ghi doanh số cho Tuấn | Hoa `GET /reports/revenue-by-customer` (scope `own`) | Không thấy dòng KH03/Tuấn (khác hành vi cũ dựa trên `created_by`) | integration |
| AC-RPT-068 | Như AC-065 | An `GET /reports/revenue-by-customer/{KH01}/lines?seller_id=<Hoa>` | Trả đúng dòng hàng của Hoa trong đơn A (không có dòng của Tuấn) | integration |
| AC-RPT-069 | Như AC-066 | An `GET /reports/revenue-by-customer/{KH02}/lines?unassigned=true` | Trả đúng dòng chưa gán của đơn B | integration |
| AC-RPT-070 | — | `GET /reports/revenue-by-customer/{id}/lines?seller_id=<uuid>&unassigned=true` (cả 2) | 422 | integration |
| AC-RPT-071 | Dữ liệu AC-065/066 | An mở "Doanh thu theo khách hàng" desktop 1440px | Dòng "Chưa gán" hiện ở cột "Người bán" (tông trung tính, không phải lỗi) | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| GET | /api/v1/reports/revenue-by-customer | report.revenue.read | Nhóm theo `(Order.customer_id, order_lines.credited_employee_id)`; `RevenueRowOut.seller` → `SellerOut \| None`, thêm `unassigned: bool` |
| GET | /api/v1/reports/revenue-by-customer/{customer_id}/lines | report.revenue.read | **Thay thế** `.../orders`. Query thêm `unassigned: bool = False` (loại trừ `seller_id`); trả `list[RevenueLineOut]` (M16-05 §4) |
| GET | /api/v1/reports/revenue-by-customer/export | report.revenue.read | CSV: "Mã người bán"/"Tên người bán" để trống khi `unassigned=true` |

## 5. Dữ liệu / Migration
Không có.

## 6. UI
`docs/specs/M15-09b-revenue-by-customer-report-ui.md` cập nhật: cột "Người bán" hiện "Chưa gán" (badge trung tính) khi `unassigned=true`; màn "Xem chi tiết" đổi từ liệt kê đơn sang liệt kê dòng hàng (giống M16-05 §6).

## 7. Kịch bản UAT thủ công
1. Dùng lại dữ liệu UAT của M16-05 (đơn có dòng gán chéo 2 NV + 1 dòng để trống).
2. Xem "Doanh thu theo khách hàng" với Manager → đúng số theo từng (KH, người bán) + dòng "Chưa gán" theo từng KH có dòng trống.
3. Xem chi tiết 1 dòng → đúng danh sách dòng hàng, không phải đơn.

## 8. Giả định & câu hỏi
Như M16-05 §8, áp dụng cho báo cáo khách hàng: `own` = dòng có `credited_employee_id = actor.id`; dòng chưa gán tách riêng theo từng khách hàng (không gộp chung 1 dòng toàn hệ thống như M16-05, vì báo cáo này vẫn nhóm theo khách hàng trước).
