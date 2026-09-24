# PRD — SMYou Pro (Quản lý đơn hàng & đầu việc kỹ thuật)

## 1. Bối cảnh
Công ty TNHH SMYou (8C/A-9C/A Nguyễn Ảnh Thủ, P. Trung Mỹ Tây, TP.HCM) bán và lắp đặt máy vi tính, laptop, máy in/photo, camera an ninh, thiết bị mạng và phụ kiện. Hiện quy trình chạy trên giấy:
- **Hoá đơn bán hàng** (mã hàng, ĐVT, số lượng, đơn giá, giảm giá, tổng, tình trạng thanh toán: TTTM / TT sau / đã chuyển khoản).
- **Phiếu yêu cầu cài đặt – sửa chữa** (số biên nhận, phòng phụ trách: Thiết bị văn phòng / Thiết bị an ninh / Kỹ thuật, khách hàng, SĐT, địa chỉ, tình trạng-cấu hình máy, phí, kết quả, ý kiến khách hàng, người nhận, kỹ thuật, **chữ ký khách hàng**).
- **Bảng báo giá** (sản phẩm + mô tả cấu hình, ĐVT, đơn giá, bảo hành theo tháng, công lắp đặt, VAT 8%).

Vấn đề: không theo dõi được ai đang làm gì, trễ hạn ở đâu, việc bị làm lại do lỗi của ai; phiếu có chữ ký dễ thất lạc.

## 2. Mục tiêu v1
1. Số hoá luồng: đơn hàng → đầu việc → phân công → thực hiện → khách xác nhận (ảnh phiếu ký) → hoàn tất.
2. Mỗi người chỉ thấy đúng màn hình/dữ liệu theo nhóm quyền của mình (một người có thể nhiều nhóm).
3. Ghi nhận đầy đủ sự kiện (nhận, từ chối + lý do, bắt đầu, xong, mở lại do lỗi) để tính KPI về sau.
4. Kỹ thuật viên thao tác hoàn toàn trên điện thoại khi ở hiện trường (mobile-first).

## 3. Người dùng
| Vai trò | Mô tả | Thiết bị chính |
|---|---|---|
| Quản lý chung (MANAGER) | Quản lý danh mục sản phẩm/dịch vụ + giá, nhân viên & phân quyền, khách hàng, đơn hàng; xem báo cáo | Desktop |
| Nhân viên kinh doanh (SALE) | Quản lý khách hàng, tạo/sửa/gửi đơn hàng | Desktop + mobile |
| Quản lý kỹ thuật (TECH_LEAD) | Nhận đơn, tạo task, giao người, đặt số giờ & hạn chót, theo dõi tiến độ, hoàn tất đơn, chuyển "Chỉnh sửa", mở lại task | Desktop + mobile |
| Nhân viên kỹ thuật (TECHNICIAN) | Nhận/từ chối task, bắt đầu, báo xong, chụp ảnh phiếu xác nhận | **Mobile** |

## 4. Phạm vi v1 (In scope)
- Đăng nhập email + mật khẩu; Manager tạo tài khoản, gán nhiều vai trò, khoá tài khoản.
- Danh mục Sản phẩm, Dịch vụ (CRUD, tìm kiếm, ngừng kinh doanh thay vì xoá).
- Khách hàng (công ty / cá nhân / khách lẻ).
- Đơn hàng: dòng hàng (sản phẩm, dịch vụ, dòng tự do), giảm giá, VAT, tình trạng thanh toán, mô tả công việc, địa chỉ thi công.
- Điều phối: task, phân công nhiều người, số giờ ước tính, hạn chót, độ ưu tiên.
- Kỹ thuật viên: danh sách việc của tôi, nhận/từ chối (lý do), bắt đầu, xong, đính kèm ảnh.
- Hoàn tất đơn với ảnh phiếu xác nhận có chữ ký khách + tên người ký.
- Chỉnh sửa đơn: thêm task phát sinh, mở lại task lỗi (ghi nhận lỗi cho KPI).
- Thông báo trong ứng dụng (in-app) + badge.
- Dashboard theo vai trò; báo cáo KPI cơ bản (số task xong, đúng hạn, từ chối, bị mở lại).
- Nhật ký hệ thống (audit).

## 5. Ngoài phạm vi v1 (Out of scope — không tự ý làm)
Xuất hoá đơn điện tử, quản lý kho/tồn kho, công nợ chi tiết, tích hợp Zalo/SMS/email, chữ ký điện tử trên màn hình, app native, đa công ty, đa ngôn ngữ, chấm công/lương. Các mục này có thể vào v2 — ghi vào `OPEN_QUESTIONS.md` nếu cần.

## 6. Yêu cầu phi chức năng
| Hạng mục | Yêu cầu |
|---|---|
| Quy mô | ~30 người dùng, ~50 đơn/ngày, ảnh ≤ 10MB/file |
| Hiệu năng | API p95 < 300ms cho danh sách ≤ 50 dòng; trang đầu mobile (4G) LCP < 2.5s |
| Khả dụng | 1 server AlmaLinux; backup DB + file hằng ngày, giữ 14 ngày; có quy trình khôi phục đã thử |
| Bảo mật | Mật khẩu argon2; phiên bằng cookie httpOnly + Secure + SameSite=Lax; phân quyền server-side mọi endpoint; khoá đăng nhập tạm sau 5 lần sai; file chỉ tải qua endpoint có kiểm quyền |
| Toàn vẹn | Chuyển trạng thái trong transaction, khoá dòng (SELECT … FOR UPDATE) + optimistic `version`; audit append-only |
| Truy cập | WCAG 2.1 AA (tương phản, focus, nhãn form); vùng chạm ≥ 44px |
| Ngôn ngữ | Giao diện tiếng Việt; tiền `11.800.000 ₫`; ngày `dd/MM/yyyy HH:mm` giờ VN |
| Trình duyệt | Safari iOS 16+, Chrome Android 12+, Chrome/Edge/Safari desktop bản mới |
| Triển khai | Docker; dev trên MacBook Pro M2 (arm64); production AlmaLinux (x86_64) |

## 7. Chỉ số thành công
- 100% đơn có task được theo dõi trên hệ thống sau 1 tháng.
- Thời gian từ "Chờ điều phối" → task đầu tiên được nhận < 2 giờ làm việc (trung vị).
- 0 phiếu xác nhận thất lạc (đều có ảnh trên hệ thống).
