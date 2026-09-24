# Phân quyền & Menu — giải thích

> Nguồn sự thật: `spec/permissions.yaml`. File này tóm tắt dạng bảng cho người đọc.

## Nguyên tắc
1. **Role → Capability → Scope.** Mỗi endpoint khai báo đúng 1 capability qua `Depends(require("order.submit"))`. Scope (`all`/`own`/`assigned`/`self`) lọc dữ liệu ở tầng query, không phải ở frontend.
2. **Nhiều vai trò = hợp quyền.** Người vừa SALE vừa TECH_LEAD thấy cả menu "Đơn hàng" và "Điều phối kỹ thuật".
3. **Từ chối mặc định.** Không khai báo = không có quyền. Route không khai báo capability → test fail.
4. **Không lộ sự tồn tại.** Truy cập bản ghi ngoài scope trả `404` (không phải `403`) để tránh dò ID. Thiếu capability hoàn toàn trả `403`.
5. **Ẩn trường nhạy cảm.** Người không có `order.read_prices` nhận response không có trường tiền (schema riêng, không phải set `null`).

## Ma trận tóm tắt
| Capability | MANAGER | SALE | TECH_LEAD | TECHNICIAN |
|---|---|---|---|---|
| Xem danh mục | ✅ | ✅ | ✅ | — |
| Quản lý danh mục (SP, DV, giá) | ✅ | — | — | — |
| Quản lý nhân viên & vai trò | ✅ | — | xem | — |
| Khách hàng | ✅ | ✅ | xem | — |
| Xem đơn | tất cả | tất cả | tất cả | đơn có task được giao |
| Xem giá tiền | ✅ | ✅ | ✅ | đơn được giao (Q03) |
| Sửa đơn giá dòng khi tạo/sửa đơn | chỉ dòng **không** cố định giá | chỉ dòng **không** cố định giá | — | — |
| Tạo/sửa nháp/gửi/huỷ đơn chưa điều phối | ✅ | đơn của mình | — | — |
| Huỷ đơn đang thực hiện | ✅ | — | — | — |
| Tạo/sửa/giao/huỷ task | — | — | ✅ | — |
| Chuyển "Chỉnh sửa", mở lại task | — | — | ✅ | — |
| Tải ảnh phiếu xác nhận | — | — | ✅ | đơn được giao |
| Hoàn tất đơn | — | — | ✅ | — |
| Nhận/từ chối/bắt đầu/xong task | — | — | — | của mình |
| KPI | tất cả | — | tất cả | của mình |
| Nhật ký hệ thống | ✅ | — | — | — |

## Menu theo vai trò (desktop sidebar 2 cấp)
| Menu | Hiện với |
|---|---|
| 📊 Tổng quan | tất cả (nội dung theo vai trò) |
| ✅ Việc của tôi | TECHNICIAN |
| 🔧 Điều phối kỹ thuật → Đơn chờ điều phối · Bảng đầu việc · Lịch & tải việc · Đơn cần chỉnh sửa | TECH_LEAD |
| 🛍️ Đơn hàng → Danh sách đơn · Tạo đơn mới · Khách hàng | SALE, MANAGER |
| 📦 Danh mục → Sản phẩm · Dịch vụ | MANAGER |
| 👤 Nhân sự & phân quyền | MANAGER |
| 📈 Báo cáo KPI | MANAGER, TECH_LEAD, TECHNICIAN (của mình) |
| 🕘 Nhật ký hệ thống | MANAGER |

Mobile: xem `docs/design/UI_GUIDELINES.md` §4.
