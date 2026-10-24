# M16-04 — Dòng hàng: trường "Ghi doanh số" (nhân viên được ghi nhận doanh số)

- **Status:** Approved (2026-10-24, chủ dự án chốt trực tiếp trong phiên — xem mục 8)
- **Backlog:** M16-04 · **Milestone:** M16
- **Liên quan:** M3-02a (dòng hàng draft), M3-04a (sửa dòng sau submit), M15-07/M15-08 (giá vốn/snapshot); mở đường cho M16-05 (báo cáo doanh thu theo NV) và M16-06 (báo cáo doanh thu theo KH) tính lại theo dòng hàng

## 1. Mục tiêu
Là Sale/Manager, tôi muốn gán 1 nhân viên được ghi nhận doanh số cho từng dòng hàng của đơn (độc lập với người tạo đơn), để doanh số tính đúng người bán thực tế theo từng mặt hàng, không gộp hết vào người tạo đơn.

## 2. Phạm vi
- Trong phạm vi:
  - `order_lines` thêm cột `credited_employee_id: uuid | null` (FK `employees.id`, không `ondelete`, giống `orders.csat_recorded_by`) — **có thể để trống** (không chọn ai).
  - `OrderLineCreate`/`OrderLineUpdate`/`OrderLineOut` thêm field `credited_employee_id: uuid | null`; validate nếu có giá trị thì nhân viên phải tồn tại (404-style field error, không cần kiểm tra `is_active`/vai trò — bất kỳ nhân viên nào cũng ghi nhận được).
  - Áp dụng cho **cả 2 luồng** sửa dòng hàng: draft (`POST/PATCH .../lines`, `order.edit_draft`) và sau khi submit (`POST/PATCH .../lines-after-submit`, `order.edit_lines_after_submit`) — dùng chung capability đã có, không tạo capability riêng.
  - Thêm `credited_employee_id` vào `_LINE_DIFF_FIELDS` để đổi trường này qua `lines-after-submit` được ghi vào `audit_events.data` (M3-04a).
  - UI: mỗi dòng hàng trong `OrderLinesSection` thêm 1 ô "Ghi doanh số" (tái dùng `EmployeeSearchField`), hiện khi `canEdit`; chỉ đọc (tên NV hoặc "—" nếu trống) khi không có quyền sửa.
- Ngoài phạm vi: đổi logic tính báo cáo doanh thu (M16-05/M16-06, backlog item riêng); không bắt buộc phải chọn "Ghi doanh số" khi tạo dòng (để trống hợp lệ ở mọi thời điểm).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-186 | Đơn DRAFT, Hoa (SALE, chủ đơn) thêm dòng hàng mới | `POST /orders/{id}/lines` kèm `credited_employee_id` = mã 1 NV đang tồn tại | 201, dòng mới có `credited_employee_id` đúng NV đó | integration |
| AC-ORD-187 | Đơn DRAFT, dòng hàng chưa có `credited_employee_id` | `PATCH /orders/{id}/lines/{line_id}` kèm `credited_employee_id` = mã 1 NV | 200, dòng được cập nhật đúng NV, các trường khác (giá/số lượng) không đổi | integration |
| AC-ORD-188 | Đơn DRAFT | `POST`/`PATCH` dòng hàng với `credited_employee_id` = uuid không tồn tại trong `employees` | 422 field error trên `credited_employee_id` | integration |
| AC-ORD-189 | Đơn DRAFT | `PATCH` dòng hàng gửi `credited_employee_id: null` sau khi đã gán 1 NV | 200, dòng trở lại không có ai được ghi doanh số | integration |
| AC-ORD-190 | Đơn đã `PENDING_DISPATCH`/`IN_PROGRESS`/…, Hoa (SALE, `order.edit_lines_after_submit`, own) | `PATCH /orders/{id}/lines-after-submit/{line_id}` đổi `credited_employee_id` | 200; `audit_events` của đơn có action `update_line_after_submit` với `data.changes.credited_employee_id = {before, after}` | integration |
| AC-ORD-191 | Đức (TECHNICIAN, không có `order.edit_draft`/`order.edit_lines_after_submit`) | Gọi 1 trong 2 route sửa dòng | 403 | integration |
| AC-ORD-192 | An (MANAGER) mở đơn ở chế độ sửa, desktop 1440px | render | Mỗi dòng hàng có ô "Ghi doanh số" (search-select NV), để trống hợp lệ | component |
| AC-ORD-193 | Hoa mở đơn đã hoàn tất (`canEdit=false`), mobile 390px | render | Cột "Ghi doanh số" hiện dạng text (tên NV hoặc "—"), không phải ô nhập | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/orders/{id}/lines | order.edit_draft | `OrderLineCreate` thêm `credited_employee_id: uuid \| null = null` |
| PATCH | /api/v1/orders/{id}/lines/{line_id} | order.edit_draft | `OrderLineUpdate` thêm `credited_employee_id: uuid \| null` (không gửi = giữ nguyên, gửi `null` = xoá) |
| POST | /api/v1/orders/{id}/lines-after-submit | order.edit_lines_after_submit | Giống `OrderLineCreate` |
| PATCH | /api/v1/orders/{id}/lines-after-submit/{line_id} | order.edit_lines_after_submit | Giống `OrderLineUpdate`, audit diff gồm `credited_employee_id` |
| GET | /api/v1/orders/{id} (và mọi response có `OrderLineOut`) | order.read | `OrderLineOut` thêm `credited_employee_id: uuid \| null` và `credited_employee_name: str \| null` (tên hiện tại của NV, lấy qua `OrderLine.credited_employee`, không phải snapshot) |

## 5. Dữ liệu / Migration
- Migration mới: `ALTER TABLE order_lines ADD COLUMN credited_employee_id uuid NULL REFERENCES employees(id)`. Không backfill (toàn bộ dòng cũ = NULL, đúng ngữ nghĩa "chưa gán").

## 6. UI
- Vị trí: thêm 1 cột/ô trong `OrderLineRow` (giữa VAT và "Giảm giá" hoặc cạnh "Tặng kèm" — tuỳ layout lưới, không bắt buộc đổi số cột lưới hiện có nếu chật, có thể xuống dòng riêng trên mobile).
- Copy: label "Ghi doanh số", placeholder giống `EmployeeSearchField` ("Tìm theo tên, mã, SĐT hoặc email…"), giá trị trống hiện "—" ở chế độ đọc.

## 7. Kịch bản UAT thủ công
1. Tạo đơn DRAFT, thêm 2 dòng hàng, gán "Ghi doanh số" khác nhau cho mỗi dòng (hoặc để trống 1 dòng).
2. Submit đơn, vào `lines-after-submit`, đổi "Ghi doanh số" của 1 dòng → kiểm tra lịch sử đơn (audit) ghi nhận đổi.
3. Đăng nhập Kỹ thuật viên thuần → mở đơn (nếu có quyền `order.read`) → thấy cột "Ghi doanh số" dạng text, không sửa được.

## 8. Giả định & câu hỏi
Chủ dự án đã chốt trực tiếp trong phiên (2026-10-24):
- Quyền sửa "Ghi doanh số" dùng chung `order.edit_draft`/`order.edit_lines_after_submit` đã có — không tạo capability riêng.
- Không bắt buộc `is_active=true`; không giới hạn vai trò nhân viên được chọn (bất kỳ nhân viên nào trong `employees` đều hợp lệ).
- Để trống (không chọn ai) là trạng thái hợp lệ ở mọi thời điểm, không có ràng buộc "phải gán trước khi submit/complete".
