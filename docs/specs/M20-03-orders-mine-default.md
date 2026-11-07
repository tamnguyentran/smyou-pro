# M20-03 — Danh sách đơn: CSKH và Sale mặc định bật "Chỉ đơn của tôi"

- **Status:** Approved (2026-10-31, Q128/Q129 chốt)
- **Backlog:** M20-03 · **Milestone:** M20
- **Liên quan:** spec M10-03 (query `mine`, checkbox "Chỉ đơn của tôi", AC-DASH-024/025), spec M15-02b + M20-02 (thẻ CSAT, AC-CSK-030..033), `GET /orders/csat-summary` (đã có query `created_by`), spec/permissions.yaml#order.read (không đổi)

## 1. Mục tiêu
Là CSKH hoặc Sale, khi mở "Danh sách đơn" tôi muốn mặc định chỉ thấy đơn do chính mình tạo, để khỏi phải tick "Chỉ đơn của tôi" mỗi lần; vẫn bỏ tick được để xem toàn công ty.

## 2. Phạm vi
- Trong phạm vi (chỉ frontend, không đổi API/quyền):
  - `OrdersListPage`: giá trị khởi tạo của checkbox "Chỉ đơn của tôi" = **bật** khi người dùng có vai trò `SALE` hoặc `CUSTOMER_CARE` **và không có** vai trò `MANAGER`; các trường hợp khác giữ mặc định tắt như cũ.
  - URL vẫn thắng mặc định: `?mine=1` → bật, `?mine=0` → tắt (mới), không có `mine` → theo vai trò.
  - Người dùng bỏ tick → danh sách toàn bộ đơn trong scope `order.read` (giữ nguyên hành vi M10-03).
  - CSKH: 6 thẻ thống kê CSAT đếm theo cùng bộ lọc "Chỉ đơn của tôi" (gửi `created_by=<id của tôi>` cho `GET /orders/csat-summary` khi checkbox bật) để số trên thẻ khớp số dòng danh sách (giữ đúng AC-CSK-033).
- Ngoài phạm vi: lưu lựa chọn của người dùng qua các lần mở trang (localStorage/hồ sơ); đồng bộ lọc ngược lên URL; đổi scope `order.read` trong `permissions.yaml`; các trang danh sách khác (Khách hàng, Điều phối, Đầu việc).

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-ORD-243 | Hoa (SALE) đăng nhập; Hoa tạo DH2610-0011, DH2610-0012; Sale Hùng tạo DH2610-0013 | Hoa mở `/orders` (URL không có `mine`) | Checkbox "Chỉ đơn của tôi" đã tick; request đầu tiên `GET /orders` có `mine=true`; danh sách chỉ DH2610-0011, DH2610-0012 | component + e2e |
| AC-ORD-244 | Lan (CUSTOMER_CARE) đăng nhập | Lan mở `/orders` | Checkbox đã tick; `GET /orders` có `mine=true` kèm khoảng ngày mặc định đầu tháng → hôm nay (AC-CSK-010 giữ nguyên); `GET /orders/csat-summary` có `created_by=<id của Lan>` cùng `from`/`to` | component |
| AC-ORD-245 | An (MANAGER, chỉ một vai trò); Minh (TECH_LEAD) | Mỗi người mở `/orders` | Checkbox **không** tick; `GET /orders` không có `mine` (không hồi quy) | component |
| AC-ORD-246 | Hoa (SALE) đang ở `/orders`, checkbox tick mặc định, đang ở trang 2 | Bỏ tick "Chỉ đơn của tôi" | Gọi lại `GET /orders` không có `mine`, `offset=0`; danh sách gồm cả DH2610-0013 của Hùng | component + e2e |
| AC-ORD-247 | Hoa (SALE) | Mở `/orders?mine=0` | Checkbox không tick; `GET /orders` không có `mine` | component |
| AC-ORD-248 | An (MANAGER) | Mở `/orders?status=PENDING_DISPATCH&mine=1` | Checkbox tick, chip "Chờ điều phối" chọn; request có `mine=true` (hành vi M10-03 giữ nguyên) | component |
| AC-ORD-249 | Lan (CUSTOMER_CARE) ở `/orders`, checkbox tick mặc định | Bỏ tick | `GET /orders/csat-summary` gọi lại **không** có `created_by` (cùng `from`/`to`); thẻ CSAT hiện số toàn công ty | component |
| AC-ORD-250 | Lan (CUSTOMER_CARE), 390px, stack e2e: Lan tạo 1 đơn `COMPLETED` chưa đánh giá, người khác tạo 1 đơn `COMPLETED` chưa đánh giá trong tháng | Mở `/orders`, bấm thẻ "Chưa đánh giá" | Thẻ "Chưa đánh giá" hiện 1; danh sách đúng 1 đơn (của Lan). Bỏ tick "Chỉ đơn của tôi" → thẻ hiện 2, danh sách 2 đơn | e2e |
| AC-ORD-251 | Người dùng có 2 vai trò MANAGER + SALE | Mở `/orders` | Checkbox **không** tick; `GET /orders` không có `mine` (có MANAGER → không mặc định bật — Q128) | component |

Không có AC 403/404/409/422: không thêm endpoint/lệnh/tham số mới; `mine` và `created_by` đã có và đã được test (AC-DASH-024/025, M15-02b).

## 4. API
Không đổi. Dùng lại:
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/orders | order.read | `mine=true` khi checkbox bật | `OrderPage` | không đổi |
| GET | /api/v1/orders/csat-summary | customer_care.manage_feedback (không đổi) | `created_by=<me.employee.id>` khi checkbox bật | `{1..5, none}` | không đổi |

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `OrdersListPage`: `mine` khởi tạo theo thứ tự ưu tiên `?mine=1` → true, `?mine=0` → false, còn lại → `roles` có `SALE` hoặc `CUSTOMER_CARE` và không có `MANAGER`. Vì `me` tải bất đồng bộ, mặc định theo vai trò tính từ `me` mỗi lần render cho tới khi người dùng tự đổi checkbox (cùng cách làm với khoảng ngày mặc định của CSKH — không lưu vào state trước khi `me` có dữ liệu), để request đầu tiên đã đúng `mine=true`, không bắn 1 request thừa không có `mine`.
- `useCsatSummary` nhận thêm `createdBy?: string` → query `created_by`.
- Không đổi bố cục, nhãn "Chỉ đơn của tôi", vùng chạm ≥ 44px; mobile/desktop như hiện tại.

## 7. Kịch bản UAT thủ công
1. Đăng nhập tài khoản Sale, mở "Danh sách đơn" → ô "Chỉ đơn của tôi" đã tick, chỉ thấy đơn mình tạo.
2. Bỏ tick → thấy đơn của mọi người.
3. Đăng nhập CSKH, mở "Danh sách đơn" → ô đã tick; số trên các thẻ sao/"Chưa đánh giá" chỉ tính đơn mình tạo; bỏ tick → số thẻ tăng theo toàn công ty.
4. Đăng nhập Manager → ô không tick như cũ.

## 8. Giả định & câu hỏi
- Giả định A1: "Đơn của tôi" = đơn do mình **tạo** (`created_by`) — đúng định nghĩa `mine` hiện có (M10-03). CSKH có `order.create`, nên với CSKH đó là đơn CSKH tự tạo.
- A2 (Q128 — chốt 2026-10-31): người có nhiều vai trò — có `MANAGER` thì **không** mặc định bật, kể cả khi có `SALE`/`CUSTOMER_CARE`.
- A3 (Q129 — chốt 2026-10-31): với CSKH, thẻ thống kê CSAT đếm theo cùng bộ lọc "Chỉ đơn của tôi" (bật → chỉ đơn mình tạo, bỏ tick → toàn công ty) để số trên thẻ luôn khớp danh sách.
- Giả định A4: lựa chọn bỏ tick không được nhớ — mở lại trang sẽ tick lại theo mặc định.
- Q128, Q129 đã chốt.
