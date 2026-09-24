# Glossary — Thuật ngữ ↔ tên trong code

Dùng đúng tên cột phải trong code, API, DB. Không tự đặt từ đồng nghĩa (vd không dùng `job`, `ticket`, `work_item` cho task).

| Tiếng Việt (UI) | Code / API | Ghi chú |
|---|---|---|
| Nhân viên | `employee` | cũng là user đăng nhập |
| Vai trò / nhóm quyền | `role` | MANAGER, SALE, TECH_LEAD, TECHNICIAN |
| Quyền | `capability` | vd `order.submit` |
| Quản lý chung | `MANAGER` | |
| Nhân viên kinh doanh | `SALE` | |
| Quản lý kỹ thuật (QLKT) | `TECH_LEAD` | |
| Nhân viên kỹ thuật / Kỹ thuật viên (KTV) | `TECHNICIAN` | |
| Bộ phận | `department` | chỉ để hiển thị, không phải quyền |
| Sản phẩm | `product` | |
| Dịch vụ | `service` | lắp đặt, sửa chữa, bơm mực… |
| Mã hàng | `sku` | |
| Đơn vị tính (ĐVT) | `unit` | |
| Bảo hành (tháng) | `warranty_months` | |
| Khách hàng | `customer` | |
| Khách lẻ | walk-in (order không có `customer_id`) | |
| Mã số thuế (MST) | `tax_code` | |
| Đơn hàng / Phiếu yêu cầu | `order` | |
| Dòng hàng | `order_line` | |
| Mô tả công việc / Tình trạng – cấu hình máy | `work_description` | |
| Địa chỉ thi công | `service_address` | |
| Phòng phụ trách | `division` | |
| Giá (chưa VAT) | `price` / dòng: `unit_price` | |
| Giá cố định (Y/N) | `price_fixed` | Y = không sửa đơn giá khi tạo đơn |
| Giảm giá | dòng: `line_discount`; đơn: `discount_amount` | |
| Thuế VAT (%) | `vat_rate` | trên sản phẩm/dịch vụ và từng dòng đơn |
| Tiền VAT | dòng: `line_vat`; đơn: `vat_amount` | |
| Tổng thanh toán | `total` | |
| Tình trạng thanh toán | `payment_status` | TTTM/CK → PAID, TT sau → PAY_LATER |
| Gửi đơn | `submit` | |
| Chờ điều phối | `PENDING_DISPATCH` | |
| Chờ khách xác nhận | `AWAITING_CONFIRMATION` | |
| Phiếu xác nhận có chữ ký | attachment `CUSTOMER_CONFIRMATION` | |
| Người ký xác nhận | `confirmation_signer_name` | |
| Hoàn tất đơn | `complete` (order) | |
| Chỉnh sửa (đơn) | `REVISION`, lệnh `request_revision` | |
| Lần chỉnh sửa | `revision_no` | |
| Đầu việc / Task | `task` | |
| Việc phát sinh | task `origin = ADDITIONAL` | |
| Số giờ làm việc | `estimated_hours` | |
| Hạn chót / ngày cuối cần hoàn thành | `due_at` | |
| Phân công / giao việc | `assignment` | |
| Tiếp nhận | `accept` | |
| Từ chối | `reject` | |
| Lý do từ chối | `reject_reason_code`, `reject_reason_text` | |
| Bắt đầu / Đang thực hiện | `start` / `IN_PROGRESS` | |
| Hoàn thành (task) | `complete` (assignment) / `DONE` | |
| Mở lại task | `reopen` | |
| Chu kỳ (task) | `cycle` | |
| Ghi nhận lỗi | `defect_record` | |
| Nhật ký hệ thống | `audit_event` | |
| Thông báo | `notification` | |
