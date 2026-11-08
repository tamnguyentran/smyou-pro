# M27-01b — UI: trang "Chăm sóc KH" (ghi nhận cuộc gọi)

- **Status:** Approved (2026-11-08)
- **Backlog:** M27-01b · **Milestone:** M27
- **Phụ thuộc:** M27-01a
- **Liên quan:** `CustomerPicker` + `CustomerFormSheet` (thêm khách hàng mới ở đơn hàng, M20-04/AC-UI-068/069), `docs/design/UI_GUIDELINES.md`

## 1. Mục tiêu
Menu "Đơn hàng" có mục "Chăm sóc KH" ngay sau "Khách hàng". CSKH chọn khách (khách mới → thêm như ở đơn hàng), ghi "Chào sản phẩm/dịch vụ gì" và "Ghi nhận yêu cầu của KH (nếu có)", lưu; xem lại danh sách cuộc gọi.

## 2. Phạm vi
- Trong phạm vi:
  - `spec/permissions.yaml` menu nhóm `sales`: `{ id: customer-care, label: Chăm sóc KH, icon: PhoneCall, path: /customer-care, capability: customer_care.call.read }` ngay sau `customers`.
  - Trang `/customer-care`: nút "Ghi nhận cuộc gọi" (chỉ khi có `customer_care.call.record`) mở sheet; danh sách cuộc gọi (bảng desktop / thẻ mobile, cùng idiom `OrderList`) + lọc: tìm khách (tên/SĐT), Từ ngày/Đến ngày (`DateField`), Người gọi (chỉ Manager); phân trang 20.
  - Sheet "Ghi nhận cuộc gọi": "Khách hàng" (dùng lại `CustomerPicker`, có nút "Thêm khách hàng" mở `CustomerFormSheet` như đơn hàng, khách vừa thêm được chọn sẵn), "Chào sản phẩm/dịch vụ" (textarea bắt buộc), "Ghi nhận yêu cầu của KH (nếu có)" (textarea), nút "Lưu" / "Huỷ". Lưu xong: toast "Đã ghi nhận cuộc gọi.", đóng sheet, danh sách tải lại.
  - Khối "Tiềm năng sử dụng dịch vụ" ở chi tiết đơn: dòng từ cuộc gọi hiện "Cuộc gọi CSKH" thay cho mã đơn.
  - Nhãn quyền (`permissionLabels.ts`), câu "Nguyên tắc" ở Nhân sự › "Cách phân quyền hoạt động", `docs/product/PERMISSIONS.md`, bản hướng dẫn CSKH (`guide/content`) thêm mục "Chăm sóc KH".
- Ngoài phạm vi: sửa/xoá cuộc gọi; trang chi tiết 1 cuộc gọi.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CUS-070 | Lan (CSKH) / Nam (Manager) / Hoa (Sale) đăng nhập | mở menu "Đơn hàng" | Lan, Nam thấy "Chăm sóc KH" ngay sau "Khách hàng" (icon PhoneCall); Hoa không thấy; Hoa vào thẳng `/customer-care` → trang 403 | component |
| AC-CUS-071 | Lan ở `/customer-care` | bấm "Ghi nhận cuộc gọi", chọn KH, nhập 2 ô, Lưu | Gọi `POST /customer-care-calls` đúng body; toast "Đã ghi nhận cuộc gọi."; sheet đóng; danh sách có dòng mới | component |
| AC-CUS-072 | Sheet đang mở, chưa chọn khách / "Chào sản phẩm/dịch vụ" trống | bấm Lưu | Lỗi "Chọn khách hàng." / "Nhập sản phẩm/dịch vụ đã chào."; không gọi API; ô lỗi đầu tiên được focus | component |
| AC-CUS-073 | Khách mới chưa có trong hệ thống | trong sheet bấm "Thêm khách hàng", nhập, Lưu khách | `POST /customers`; khách mới được chọn sẵn trong ô "Khách hàng" của sheet cuộc gọi | component |
| AC-CUS-074 | Server trả 422 cho `offered` | Lưu | Lỗi hiện dưới ô "Chào sản phẩm/dịch vụ", sheet vẫn mở | component |
| AC-CUS-075 | Danh sách có cuộc gọi | xem 1440px / 390px | Desktop: bảng cột Thời gian · Khách hàng · SĐT · Chào SP/DV · Yêu cầu của KH · Người gọi; mobile: thẻ; yêu cầu trống hiện "—"; giờ theo Asia/Ho_Chi_Minh | component + e2e |
| AC-CUS-076 | Nam (Manager) / Lan | xem bộ lọc | Nam có ô "Người gọi"; Lan không có; đổi bộ lọc gọi lại API với `q`/`from`/`to`/`caller_id` | component |
| AC-CUS-077 | Chưa có cuộc gọi nào | mở trang | Trạng thái trống "Chưa có cuộc gọi nào." | component |
| AC-CUS-078 | Chi tiết đơn của KH có ghi chú từ cuộc gọi | mở khối "Tiềm năng sử dụng dịch vụ" | Dòng cuộc gọi hiện "Cuộc gọi CSKH" thay mã đơn | component |
| AC-CUS-079 | 390px và 1440px | mở trang + sheet | Không cuộn ngang; vùng chạm ≥ 44px; axe không có lỗi serious/critical; ảnh chụp lưu `reports/screenshots/` | e2e |

## 4. API
Dùng `POST`/`GET /customer-care-calls`, `POST /customers` (M27-01a, có sẵn).

## 5. Dữ liệu / Migration
Không.

## 6. UI
- Copy: menu "Chăm sóc KH"; tiêu đề trang "Chăm sóc khách hàng"; nút "Ghi nhận cuộc gọi"; nhãn "Khách hàng", "Chào sản phẩm/dịch vụ", "Ghi nhận yêu cầu của KH (nếu có)", "Người gọi"; toast "Đã ghi nhận cuộc gọi."; trống "Chưa có cuộc gọi nào."
- Mobile-first 390px; `lg:` bảng.

## 7. Kịch bản UAT thủ công
1. Lan vào "Đơn hàng › Chăm sóc KH" → "Ghi nhận cuộc gọi" → thêm khách mới "Cty ABC" → nhập "Camera IP 4MP" + "Báo giá 6 camera" → Lưu → thấy trong danh sách.
2. Nam (Quản lý) thấy cuộc gọi của mọi CSKH, lọc theo người gọi.
3. Báo cáo "Doanh thu theo khách hàng": cột tiềm năng của "Cty ABC" = "Báo giá 6 camera".
4. Hồng (Sale) không thấy mục "Chăm sóc KH".

## 8. Giả định & câu hỏi
- Như M27-01a §8.
