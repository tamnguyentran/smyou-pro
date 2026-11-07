# M20-02 — Bug: thẻ "Chưa đánh giá" không lọc danh sách đơn

- **Status:** Approved
- **Backlog:** M20-02 · **Milestone:** M20
- **Liên quan:** spec M15-02b (AC-CSK-010/012), `GET /orders`, `GET /orders/csat-summary`, spec/permissions.yaml#order.read (không đổi)

## 1. Mục tiêu
Là CSKH, tôi muốn bấm thẻ "Chưa đánh giá" trên Danh sách đơn để thấy ngay các đơn đã hoàn thành mà chưa có phản hồi của khách, để gọi khách lấy đánh giá.

## 2. Phạm vi
- Nguyên nhân: ở M15-02b thẻ "Chưa đánh giá" bị cố ý `disabled` (chỉ 5 thẻ sao lọc được), và `GET /orders` chưa có cách lọc "chưa đánh giá" (`csat_rating` chỉ nhận 1–5).
- Trong phạm vi:
  - Backend: `GET /orders` thêm query `csat_unrated: bool = false`. Khi `true` → chỉ đơn `status = COMPLETED` **và** `csat_rating IS NULL` — đúng định nghĩa ô "none" của `GET /orders/csat-summary` để số trên thẻ khớp số dòng danh sách (cùng khoảng ngày, cùng scope).
  - Frontend: thẻ "Chưa đánh giá" bấm được, có trạng thái chọn (`aria-pressed`), bấm lại để gỡ lọc; chọn thẻ sao ↔ thẻ "Chưa đánh giá" loại trừ nhau (chỉ 1 thẻ được chọn).
- Ngoài phạm vi: mặc định "Chỉ đơn của tôi" (M20-03); đồng bộ lọc lên URL; thay đổi cách đếm của `csat-summary`; thẻ "Chưa đánh giá" ở Tổng quan (dashboard).

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-CSK-026 | Lan (CUSTOMER_CARE). Trong tháng 10/2026 có: DH2610-0001 `COMPLETED` 5★, DH2610-0002 `COMPLETED` chưa đánh giá, DH2610-0003 `COMPLETED` chưa đánh giá, DH2610-0004 `IN_PROGRESS` (chưa đánh giá, chưa có `completed_at`) | `GET /orders?from=2026-10-01&to=2026-10-31&csat_unrated=true` | 200; `total = 2`; items đúng DH2610-0002, DH2610-0003 (không có 0001, 0004); `total` bằng `none` của `GET /orders/csat-summary?from=2026-10-01&to=2026-10-31` | integration |
| AC-CSK-027 | Như AC-CSK-026 | `GET /orders?csat_unrated=true` (không truyền ngày) | 200; chỉ trả đơn `COMPLETED` có `csat_rating = null` (0002, 0003) — không lẫn đơn chưa hoàn thành | integration |
| AC-CSK-028 | Lan | `GET /orders?csat_rating=4&csat_unrated=true` | 422 `VALIDATION_ERROR` (hai bộ lọc mâu thuẫn) | integration |
| AC-CSK-029 | Hùng (SALE, `order.read` phạm vi `all`); DH2610-0002 (chưa đánh giá) do Sale khác tạo; DH2610-0005 (`COMPLETED`, chưa đánh giá) do Hùng tạo | Hùng gọi `GET /orders?csat_unrated=true&mine=true`, rồi `GET /orders?csat_unrated=true` | Có `mine=true`: 200, chỉ DH2610-0005 (không có 0002). Không `mine`: 200, có cả 0002 và 0005 — `csat_unrated` kết hợp đúng với bộ lọc "Chỉ đơn của tôi" và giữ nguyên scope server hiện có (chốt với chủ sản phẩm 2026-10-31) | integration |
| AC-CSK-030 | Lan mở `/orders`; ô thống kê `{5:3, 4:2, 3:1, 2:1, 1:1, none:2}` | Bấm thẻ "Chưa đánh giá" | Thẻ không còn disabled; `aria-pressed=true`; gọi lại `GET /orders?...&csat_unrated=true` (không gửi `csat_rating`), giữ nguyên khoảng ngày; về trang 1 (`offset=0`) | component |
| AC-CSK-031 | Thẻ "Chưa đánh giá" đang chọn | Bấm thẻ "3★" | "3★" chọn, "Chưa đánh giá" bỏ chọn; gọi `GET /orders?...&csat_rating=3` không kèm `csat_unrated` | component |
| AC-CSK-032 | Thẻ "Chưa đánh giá" đang chọn | Bấm lại thẻ "Chưa đánh giá" | Bỏ chọn; gọi `GET /orders` không có `csat_unrated` lẫn `csat_rating` | component |
| AC-CSK-033 | Lan, màn hình 390px, stack e2e có seed đơn hoàn thành chưa đánh giá | Bấm thẻ "Chưa đánh giá" | Danh sách chỉ còn các đơn chưa đánh giá (nền mặc định, không tô màu sao); số thẻ đơn hiển thị = số trên thẻ "Chưa đánh giá" | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/orders | order.read (không đổi) | thêm query `csat_unrated: bool = false` | `OrderPage` (không đổi) | 422 khi `csat_rating` và `csat_unrated=true` cùng có |

Chạy `make contract` để sinh lại OpenAPI + TS types.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `CsatSummaryStats`: prop `selected` đổi kiểu thành `number | "none" | undefined`; bỏ `disabled` và `return` sớm cho thẻ "none"; thẻ "none" có `cursor-pointer hover:brightness-95` như thẻ sao; khi chọn dùng tông hiện có của "none" (`border-line bg-sidebar-sub`) và `aria-pressed=true`.
- `OrdersListPage`: state `csatRating` đổi sang `number | "none" | undefined`; map sang `OrderFilters` → `csatRating` (số) hoặc `csatUnrated: true`.
- Không đổi bố cục (lưới 2 cột mobile, 3 cột md, 6 cột lg); vùng chạm ≥ 44px giữ nguyên.

## 7. Kịch bản UAT thủ công
1. Đăng nhập tài khoản CSKH, mở "Danh sách đơn".
2. Ghi nhớ số trên thẻ "Chưa đánh giá" (vd 2), bấm thẻ.
3. Danh sách chỉ còn đúng 2 đơn đã hoàn thành chưa có phản hồi; thẻ hiện viền "đang chọn".
4. Bấm thẻ "5★" → danh sách đổi sang đơn 5★; bấm lại "5★" → về danh sách đầy đủ.

## 8. Giả định & câu hỏi
- Giả định A1: "Chưa đánh giá" = đơn **đã hoàn thành** (`COMPLETED`) chưa có `csat_rating` — trùng định nghĩa số đếm trên thẻ (`csat-summary`). Đơn đang làm/đã huỷ không tính. Không phải quy tắc nghiệp vụ mới, chỉ là khớp số đếm hiện có.
- Giả định A2: Dùng query riêng `csat_unrated=true` thay vì `csat_rating=none` để giữ kiểu số nguyên 1–5 của `csat_rating` (không phá client cũ).
- Câu hỏi mới: không có.
