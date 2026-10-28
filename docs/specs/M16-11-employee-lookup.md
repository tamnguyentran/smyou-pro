# M16-11 — Tra cứu nhân viên cho ô chọn "Người nhận doanh số"

- **Status:** Approved (2026-10-26, chủ dự án yêu cầu trực tiếp trong phiên)
- **Backlog:** M16-11 · **Milestone:** M16
- **Liên quan:** `M16-04-order-line-credited-employee.md`, `M16-01b-customer-gift-tracking-ui.md` (cùng dùng `EmployeeSearchField`).

## 1. Mục tiêu
Chủ dự án: "ai vào được màn hình này thì cũng đều thực hiện được" chọn người nhận doanh số; thay đổi phải lưu lịch sử. Trước đây `EmployeeSearchField` gọi `GET /employees` (cần `employee.read` — chỉ Manager/QLKT) nên Sale/CSKH bị 403.

## 2. Phạm vi
- API mới `GET /api/v1/employees/lookup?q=&include_inactive=&limit=` — trả mảng `{id, code, full_name, phone, is_active}` (không email/vai trò/khoá), tìm theo tên (không dấu), mã, SĐT; `include_inactive` mặc định `true` (M16-04 cho phép NV đã nghỉ); `limit` 1–50, mặc định 8; sắp như `GET /employees`.
- Capability mới `employee.lookup: { MANAGER, SALE, CUSTOMER_CARE, TECH_LEAD: all }` — mọi vai trò vào được màn đơn hàng. Không bỏ hẳn kiểm tra quyền (quy tắc bắt buộc #5: mọi endpoint có capability ở server); KTV không sửa dòng hàng nên không cần.
- `EmployeeSearchField` dùng API này.
- Lịch sử: đổi "Người nhận doanh số" đã ghi `audit_events` (`order.line_updated`, diff `credited_employee_id`) — đã có test (`test_orders_api.py`), không đổi.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-030 | An, Hoa (SALE), Tuấn (QLKT), Lan (CSKH) | `GET /employees/lookup?q=khoa` | 200, đúng 5 trường; Khoa (KTV) gọi → 403 | integration |
| AC-EMP-031 | Khoa đã ngừng hoạt động | tìm `tuan`/`NV01`, `include_inactive=false`, `limit` | không dấu khớp; mặc định có NV nghỉ, `false` loại ra; không lộ email/vai trò; `limit=51` → 422 | integration |
| AC-EMP-032 | Hoa (SALE) sửa dòng hàng | gõ tên vào "Người nhận doanh số" | ô gọi `/employees/lookup` (không phải `/employees`) và hiện kết quả để chọn | component |
