# M27-02a — API: Tổng quan đếm lượt gọi CSKH gộp 2 nguồn

- **Status:** Approved (2026-11-08; Q195, Q196 đã chốt)
- **Backlog:** M27-02a · **Milestone:** M27
- **Phụ thuộc:** M27-01a (`customer_care_calls`), M16-03 (thẻ CSKH), M18-01c (popup thẻ)
- **Thay thế một phần:** M16-03 AC-DASH-060/061, M18-01c AC-DASH-104/105/106/114 (cách đếm + loại dòng của `care.customers`, `care.staff`). Test cũ của các AC này phải sửa theo spec này — ghi rõ trong PR.

## 1. Mục tiêu
Khối "Chăm sóc khách hàng (tháng này)" ở Tổng quan tính **mọi lượt gọi CSKH**: lượt gọi recheck đơn hoàn tất (ghi phản hồi — `orders.csat_recorded_at/by`) **và** cuộc gọi ghi ở trang "Chăm sóc KH" (`customer_care_calls`).

## 2. Phạm vi
- `care_summary.today/month` = số **lượt gọi** = (số đơn có `csat_recorded_at` trong ngày/tháng VN) + (số `customer_care_calls.called_at` trong ngày/tháng VN). Toàn công ty, như hiện tại.
- `care_staff_count` = số nhân viên **khác nhau** có ≥1 lượt gọi ở bất kỳ nguồn nào trong tháng.
- Popup `care.customers` → loại dòng mới `care_call`: mỗi dòng 1 lượt gọi, gộp 2 nguồn, mới nhất trước: `source` (`ORDER_RECHECK` | `CARE_CALL`), `called_at`, `customer_id`, `customer_name`, `customer_phone`, `order_id`/`order_code` (null với `CARE_CALL`), `caller_name`, `summary` (recheck: "n★ — nhận xét"; cuộc gọi: "Chào: … · Yêu cầu: …"). Dòng `CARE_CALL` lọc theo quyền `customer_care.call.read` (Q196): Quản lý mọi cuộc gọi, CSKH chỉ cuộc gọi mình ghi, vai trò khác không thấy dòng `CARE_CALL`; dòng recheck như cũ. `total` = số dòng actor thấy (= `care_summary.month` với Quản lý). Số trên thẻ vẫn toàn công ty.
- Popup `care.staff`: `care_count` = tổng lượt gọi 2 nguồn trong tháng; `last_recorded_at` = lượt gần nhất của 2 nguồn.
- Xuất Excel `care.customers`: cột `Thời gian, Nguồn, Mã đơn, Khách hàng, SĐT, Nội dung, Người gọi`; `care.staff`: đổi tiêu đề cột "Số KH đã chăm sóc" → "Số lượt gọi".
- Ngoài phạm vi: khối "Phản hồi – đánh giá" (`feedback.*`) giữ nguyên.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-131 | Tháng này: 3 đơn ghi phản hồi (1 hôm nay) + 2 cuộc gọi CSKH (1 hôm nay); 1 cuộc gọi tháng trước | `GET /dashboard` (An) | `care_summary.month = 5`, `today = 2` | integration |
| AC-DASH-132 | Linh: 2 recheck + 1 cuộc gọi; Mai: chỉ 1 cuộc gọi; Hoa (SALE): 0 | `GET /dashboard`; `.../care.staff/items` | `care_staff_count = 2`; Linh `care_count = 3`, Mai `care_count = 1` | integration |
| AC-DASH-133 | Như AC-DASH-131 | `.../care.customers/items` | `kind = "care_call"`, `total = 5` = `care_summary.month`; dòng gộp 2 nguồn mới nhất trước, đủ trường §2; dòng `CARE_CALL` có `order_code = null` | integration |
| AC-DASH-134 | Như AC-DASH-131 | `.../care.customers/export`, `.../care.staff/export` | CSV cột đúng §2; thời gian giờ VN; ô nội dung bắt đầu `=` được thêm `'` | integration |
| AC-DASH-140 | Như AC-DASH-131 (cuộc gọi tháng này: Mai 1, Linh 1) | `.../care.customers/items` + `/export` với Hoa (SALE), Tuấn (TECH_LEAD), Mai (CSKH) | Hoa/Tuấn: chỉ 3 dòng recheck, `total = 3`; Mai: 3 recheck + 1 cuộc gọi của Mai, `total = 4`; `GET /dashboard` vẫn `month = 5` | integration |
| AC-DASH-135 | Cuộc gọi lúc 30/09 23:30 giờ VN | gọi trong tháng 10 | Không tính vào tháng 10 (biên tháng theo giờ VN) | integration |

## 4. API
Không thêm endpoint; đổi số liệu `GET /dashboard` và loại dòng popup `care.customers` (`care_call`) — `make contract`.

## 5. Dữ liệu / Migration
Không (có thể thêm index `customer_care_calls(called_at)` nếu cần — quyết định khi implement).

## 8. Giả định & câu hỏi
- Q195 (đã chốt 2026-11-08): đếm **số lượt gọi** (2 nguồn cộng lại); popup gộp 2 nguồn; "NV đã gọi điện CSKH" gộp 2 nguồn.
- Q196 (đã chốt 2026-11-08, phát hiện ở /review): dòng cuộc gọi CSKH trong popup/Excel `care.customers` theo quyền trang Chăm sóc KH (`customer_care.call.read`) — Sale/QLKT không thấy, CSKH chỉ thấy cuộc gọi của mình.
