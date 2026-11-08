# Phân quyền & Menu — giải thích

> Nguồn sự thật: `spec/permissions.yaml`. File này tóm tắt dạng bảng cho người đọc.
> Người dùng xem bản luôn-cập-nhật ở trang **Nhân sự & phân quyền → "Cách phân quyền hoạt động"** (M17-05). Đổi logic phân quyền thì phải cập nhật cả khối đó trong cùng thay đổi (`CLAUDE.md` quy tắc 13).

## Nguyên tắc
1. **Role → Capability → Scope.** Mỗi endpoint khai báo đúng 1 capability qua `Depends(require("order.submit"))`. Scope (`all`/`own`/`assigned`/`self`) lọc dữ liệu ở tầng query, không phải ở frontend.
2. **Nhiều vai trò = hợp quyền.** Người vừa SALE vừa TECH_LEAD thấy cả menu "Đơn hàng" và "Điều phối kỹ thuật".
3. **Từ chối mặc định.** Không khai báo = không có quyền. Route không khai báo capability → test fail.
4. **Không lộ sự tồn tại.** Truy cập bản ghi ngoài scope trả `404` (không phải `403`) để tránh dò ID. Thiếu capability hoàn toàn trả `403`.
5. **Ẩn trường nhạy cảm.** Người không có `order.read_prices` nhận response không có trường tiền (schema riêng, không phải set `null`). Ngoại lệ: doanh số **ghi cho chính mình** — `/me/kpi-sales` (M21-02a) và cột "Doanh số ghi cho CSKH" ở thẻ Tổng quan "Đơn ghi doanh số" (M21-03, CSKH chỉ thấy tổng các dòng ghi cho mình).

## Ma trận tóm tắt
| Capability | MANAGER | SALE | TECH_LEAD | TECHNICIAN |
|---|---|---|---|---|
| Xem danh mục | ✅ | ✅ | ✅ | ✅ (để chọn hàng tại hiện trường — M19-01a) |
| Xem giá vốn trong danh mục (`catalog.read_cost`, Q125; CSKH cũng xem được) | ✅ | ✅ | ✅ | — |
| Quản lý danh mục (SP, DV, giá) | ✅ | — | — | — |
| Quản lý nhân viên & vai trò | ✅ | — | xem | — |
| Khách hàng | ✅ | ✅ | xem | — |
| Xem đơn | tất cả | tất cả | tất cả | đơn có task được giao |
| In "Hoá đơn bán hàng" A5 (`order.print`, M17-04 · Q109; CSKH cũng in được) | tất cả | tất cả | tất cả | đơn có task được giao |
| Xem giá tiền | ✅ | ✅ | ✅ | đơn được giao (Q03) |
| Sửa đơn giá dòng khi tạo/sửa đơn | chỉ dòng **không** cố định giá | chỉ dòng **không** cố định giá | — | — |
| Tạo/sửa nháp/gửi/huỷ đơn chưa điều phối (huỷ được cả khi mọi đầu việc đã huỷ — Q183/UAT-02; CSKH cũng huỷ được đơn do mình tạo, không gửi đơn) | ✅ | đơn của mình | — | — |
| Đọc thông báo của mình (`notification.read`; CSKH được thêm ở Q184/UAT-02 để nhận thông báo đơn mình tạo) | ✅ | ✅ | ✅ | ✅ |
| Huỷ đơn đang thực hiện | ✅ | — | — | — |
| Tạo/sửa/giao/huỷ task | — | — | ✅ | — |
| Chuyển "Chỉnh sửa", mở lại task | — | — | ✅ | — |
| Tải ảnh phiếu xác nhận | — | — | ✅ | đơn được giao |
| Hoàn tất đơn | — | — | ✅ | đơn được giao (Q04) |
| Sửa dòng hàng/giá sau khi gửi (tới trước Hoàn tất/Huỷ, có audit) | ✅ | đơn của mình (Q09) | — | — |
| Thêm dòng hàng tại hiện trường; sửa/xoá dòng mình thêm (`order.edit_lines_on_site`, M19-01a: đơn Đang thực hiện/Chỉnh sửa, phân công đã nhận/đang làm; doanh số luôn ghi cho chính KTV) | — | — | — | đơn được giao |
| Ghi "Tiềm năng sử dụng dịch vụ" của khách chủ đơn (`customer.potential.record`, M21-05a · Q154: phân công đã nhận/đang làm/xong, đơn chưa Hoàn tất/Huỷ; chỉ thêm bản mới, không sửa/xoá) | — | — | — | đơn được giao |
| Ghi nhận cuộc gọi chăm sóc KH — chào SP/DV gì, khách yêu cầu gì; yêu cầu thành tiềm năng của khách (`customer_care.call.record`, M27-01a · Q189: **CSKH**; Quản lý luôn kèm CSKH; không sửa/xoá) | ✅ (qua CSKH) | — | — | — |
| Xem cuộc gọi chăm sóc KH (`customer_care.call.read`, M27-01a · Q191: CSKH xem cuộc gọi do mình ghi) | tất cả | — | — | — |
| Nhận/từ chối/bắt đầu/xong task | — | — | — | của mình |
| KPI | tất cả | — | tất cả | của mình |
| Thông tin Công ty (xem/sửa, logo — M17-01) | ✅ | — | — | — |
| Phòng ban (thêm/sửa/ngừng — M17-02a; QLKT chỉ xem qua API) | ✅ | — | — | — |
| Thiết lập doanh thu KPI — chỉ tiêu "Thu nhập thuần" theo tháng (`kpi_target.manage`, M21-01a; màn "Thông tin Công ty › Thiết lập doanh thu KPI", M21-01b; CSKH cũng không) | ✅ | — | — | — |
| Báo cáo KPI doanh số mọi nhân viên theo tháng (`report.kpi_sales.read`, M21-02a; Q150; CSKH cũng không) — mọi vai trò xem KPI doanh số **của mình** qua `/me/kpi-sales` (`profile.manage`) | ✅ | của mình | của mình | của mình |
| Biểu đồ kinh doanh — doanh thu/lợi nhuận, cơ cấu, khách mới/quay lại, Pareto, bán chạy/chậm, giờ phân công, tỷ lệ KPI toàn công ty (`report.business_charts.read`, M23a) | ✅ | — | — | — |
| Nhật ký hệ thống | ✅ | — | — | — |

## Menu theo vai trò (desktop sidebar 2 cấp)
| Menu | Hiện với |
|---|---|
| 📊 Tổng quan | tất cả (nội dung theo vai trò) |
| ✅ Việc của tôi | TECHNICIAN |
| 🔧 Điều phối kỹ thuật → Đơn chờ điều phối · Bảng đầu việc · Lịch & tải việc · Đơn cần chỉnh sửa | TECH_LEAD |
| 🛍️ Đơn hàng → Danh sách đơn · Tạo đơn mới · Khách hàng | SALE, MANAGER |
| 🛍️ Đơn hàng → Chăm sóc KH (`/customer-care`, ngay sau Khách hàng; M27-01b) | CUSTOMER_CARE (cuộc gọi mình ghi), MANAGER (mọi cuộc gọi, lọc theo người gọi) |
| 📦 Danh mục → Sản phẩm · Dịch vụ | MANAGER |
| 📈 Báo cáo → Biểu đồ kinh doanh (`/reports/business-charts`, M23a/M23b) | MANAGER |
| 📈 Báo cáo → Công việc theo nhân viên (`/reports/kpi`, tên cũ "Báo cáo KPI" — đổi ở M21-02b) | MANAGER, TECH_LEAD, TECHNICIAN (của mình) |
| 📈 Báo cáo → Báo cáo KPI (`/reports/kpi-sales`, KPI doanh số theo tháng, M21-02b) | MANAGER |
| 🏢 Thông tin Công ty → Thông tin Công ty · Phòng ban · Nhân sự & phân quyền | MANAGER |
| 🕘 Nhật ký hệ thống | MANAGER |

Mobile: xem `docs/design/UI_GUIDELINES.md` §4.
