# M27-03 — CSKH xem tất cả cuộc gọi CSKH + checkbox "Chỉ cuộc gọi của tôi"

- **Status:** Approved
- **Backlog:** M27-03 · **Milestone:** M27
- **Phụ thuộc:** M27-01a/b, M27-02a/b
- **Liên quan:** spec/permissions.yaml#`customer_care.call.read`, Q197 (sửa Q191/Q196), "Chỉ đơn của tôi" ở danh sách đơn hàng (M20-03, AC-ORD-243..251)
- **Thay thế một phần:** AC-CUS-065 (phần Lan/Mai chỉ thấy cuộc gọi của mình), AC-CUS-076 (phần Lan không có ô "Người gọi"), AC-DASH-140 (phần Mai chỉ thấy cuộc gọi của Mai), AC-EMP-127 (cột CSKH "của mình"). Test cũ sửa theo AC mới, ghi rõ trong commit.

## 1. Mục tiêu
Là nhân viên CSKH, tôi muốn xem được cuộc gọi chăm sóc của cả nhóm (mặc định vẫn chỉ hiện cuộc gọi của mình) để không gọi trùng khách và nắm được khách đã được chào gì.

## 2. Phạm vi
- Trong phạm vi:
  - Phân quyền: `customer_care.call.read` của CUSTOMER_CARE đổi `own` → `all` (Quản lý giữ `all`; Sale/QLKT/KTV vẫn không có).
  - Trang "Chăm sóc KH" (`/customer-care`): checkbox **"Chỉ cuộc gọi của tôi"**. Bật → lọc `caller_id = mình`. Mặc định: **bật** với CSKH, **tắt** nếu có vai trò Quản lý (giống "Chỉ đơn của tôi"). `?mine=1` / `?mine=0` trên URL thắng mặc định, đổi checkbox thì cập nhật URL.
  - Ô "Người gọi" hiện cho mọi người xem được trang (gồm CSKH) khi checkbox **tắt**; khi bật thì ẩn ô này.
  - Tổng quan › popup/Excel "Lượt gọi CSKH": CSKH thấy mọi cuộc gọi CSKH (khớp số trên thẻ), không có checkbox. Đây là kết quả tự động của việc đổi phạm vi, không cần code riêng.
  - Hiển thị phân quyền (quy tắc 13): `make contract`, ma trận/nguyên tắc ở Nhân sự › "Cách phân quyền hoạt động", `docs/product/PERMISSIONS.md`.
- Ngoài phạm vi: sửa/xoá cuộc gọi (vẫn không ai sửa được); checkbox ở popup Tổng quan; đổi quyền của Sale/QLKT (giữ như Q196).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CUS-080 | Lan (CSKH) ghi 2 cuộc, Mai (CSKH) ghi 1 cuộc | Lan `GET /customer-care-calls`; Lan `GET ...?caller_id=<Mai>`; Hoa (SALE) GET | Lan: 3 dòng, `total = 3`; lọc Mai: 1 dòng của Mai; Hoa: 403 | integration |
| AC-DASH-141 | Như AC-DASH-131 (tháng này: 3 recheck, cuộc gọi Mai 1, Linh 1) | Mai `.../cards/care.customers/items` + `/export`; Hoa (SALE), Tuấn (TECH_LEAD) cùng lệnh | Mai: 3 recheck + 2 cuộc gọi (của Mai và Linh), `total = 5` = `care_summary.month`; Hoa/Tuấn: không đổi (chỉ 3 recheck) | integration |
| AC-CUS-081 | Lan đăng nhập, có cuộc gọi của Lan và Mai | mở `/customer-care` | Checkbox "Chỉ cuộc gọi của tôi" đang **bật**; request đầu tiên có `caller_id=<Lan>`; chỉ hiện cuộc gọi của Lan; không có ô "Người gọi" | component |
| AC-CUS-082 | Như AC-CUS-081 | Lan bỏ chọn checkbox | Gọi lại API **không** có `caller_id`; hiện cuộc gọi của cả Lan và Mai; hiện ô "Người gọi"; URL có `?mine=0` | component |
| AC-CUS-083 | Nam (Quản lý, kèm CSKH) đăng nhập | mở `/customer-care`, rồi bật checkbox | Mặc định checkbox **tắt**, request không có `caller_id`; bật → request có `caller_id=<Nam>`, ô "Người gọi" ẩn, URL `?mine=1` | component |
| AC-CUS-084 | Lan mở `/customer-care?mine=0`; Nam mở `/customer-care?mine=1` | tải trang | Lan: checkbox tắt, thấy tất cả; Nam: checkbox bật, chỉ cuộc gọi của Nam (URL thắng mặc định) | component |
| AC-EMP-128 | Nam mở Nhân sự › "Cách phân quyền hoạt động" | xem ma trận/nguyên tắc | Hàng "Xem cuộc gọi chăm sóc KH": Quản lý "tất cả", CSKH "tất cả"; câu nguyên tắc: "Nhân viên CSKH ghi nhận cuộc gọi chăm sóc khách hàng và xem được cuộc gọi của cả nhóm (mặc định chỉ hiện cuộc gọi của mình); yêu cầu của khách trở thành tiềm năng sử dụng dịch vụ của khách." | component |
| AC-CUS-085 | 390px và 1440px, Lan ở `/customer-care` | xem, bấm checkbox | Vùng chạm checkbox ≥ 44px; không cuộn ngang; axe không lỗi serious/critical; ảnh chụp lưu `reports/screenshots/` | e2e |

## 4. API
Không thêm endpoint. `GET /customer-care-calls` đã có tham số `caller_id` (M27-01a). Chỉ đổi phạm vi trong `spec/permissions.yaml`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Checkbox "Chỉ cuộc gọi của tôi" nằm trong hàng bộ lọc của trang "Chăm sóc KH", cùng kiểu (component, vị trí) với "Chỉ đơn của tôi" ở danh sách đơn hàng. Mobile: nằm trong khối bộ lọc, vùng chạm ≥ 44px.
- Bật checkbox → ẩn ô "Người gọi" và bỏ giá trị đang chọn ở ô đó. Tắt → hiện lại ô "Người gọi" (trống).
- Đổi checkbox thì về trang 1 của phân trang.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Lan (CSKH) → Đơn hàng › Chăm sóc KH: checkbox "Chỉ cuộc gọi của tôi" đang bật, chỉ thấy cuộc gọi của Lan.
2. Bỏ chọn → thấy cuộc gọi của cả nhóm, có ô "Người gọi" để lọc.
3. Đăng nhập Nam (Quản lý) → trang mở ra đã thấy tất cả; bật checkbox → chỉ cuộc gọi Nam ghi.
4. Lan mở Tổng quan › "Lượt gọi CSKH": số dòng trong popup bằng số trên thẻ.

## 8. Giả định & câu hỏi
- Quyết định nghiệp vụ: Q197 (Chủ SP 2026-11-08). Thay Q191 (CSKH chỉ xem của mình) và phần CSKH của Q196.
- Giả định (UI, theo mẫu "Chỉ đơn của tôi"): giữ trạng thái checkbox trên URL `?mine=`; bật thì ẩn ô "Người gọi"; CSKH được dùng ô "Người gọi" khi checkbox tắt.
- Đề xuất sửa YAML (chưa sửa):
  ```diff
  -  customer_care.call.read:   { MANAGER: all, CUSTOMER_CARE: own }   # M27-01a (Q191): own = cuộc gọi do mình ghi
  +  customer_care.call.read:   { MANAGER: all, CUSTOMER_CARE: all }   # M27-01a; Q197 (M27-03): CSKH xem tất cả, trang mặc định "Chỉ cuộc gọi của tôi"
  ```
- Ước lượng: < 150 dòng code không tính test → không tách.
