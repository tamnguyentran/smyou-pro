# M21-01b — UI: màn "Thiết lập doanh thu KPI"

- **Status:** Approved (2026-11-01, chủ dự án chốt Q146–Q156)
- **Backlog:** M21-01b · **Milestone:** M21
- **Phụ thuộc:** M21-01a
- **Liên quan:** spec/permissions.yaml#kpi_target.manage, docs/design/UI_GUIDELINES.md, M20-04 (modal giữ mở khi lỗi)

## 1. Mục tiêu
Là Manager, tôi muốn một màn hình ngay dưới "Nhân sự & phân quyền" để chọn tháng, lọc phòng ban / tìm nhân viên, nhập chỉ tiêu "Thu nhập thuần" từng người và copy sang các tháng tiếp theo.

## 2. Phạm vi
- Trong phạm vi: mục menu mới "Thiết lập doanh thu KPI" (icon `Target`) trong nhóm "Thông tin Công ty", ngay dưới "Nhân sự & phân quyền"; trang `/settings/kpi-targets`; bộ chọn tháng; lọc phòng ban; ô tìm; sửa chỉ tiêu inline; modal "Copy sang các tháng sau"; cập nhật khối "Cách phân quyền hoạt động" + `permissionLabels.ts` (quy tắc 13 CLAUDE.md).
- Ngoài phạm vi: nhập Excel hàng loạt.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-KPI-046 | An (MANAGER) đăng nhập | mở menu "Thông tin Công ty" | Thấy "Thiết lập doanh thu KPI" ngay dưới "Nhân sự & phân quyền"; Sale/CSKH/QLKT/KTV không thấy | component |
| AC-KPI-047 | Hôm nay 2026-11-01 | An mở `/settings/kpi-targets` | Bộ chọn tháng mặc định "Tháng 11/2026"; bảng gồm cột Mã NV, Họ tên, Phòng ban, Chỉ tiêu thu nhập thuần (VND); dòng chưa đặt hiện "Chưa đặt" | component |
| AC-KPI-048 | Dòng Hoa chưa đặt | An nhập "30.000.000" vào ô chỉ tiêu, bấm "Lưu" (hoặc Enter) | Gọi PUT với `30000000`; toast "Đã lưu chỉ tiêu"; ô hiện "30.000.000 ₫" | component |
| AC-KPI-049 | Ô chỉ tiêu | Nhập chữ / số âm | Không cho lưu, hiện "Chỉ tiêu phải là số nguyên không âm" | component |
| AC-KPI-050 | Người khác vừa sửa chỉ tiêu Hoa | An lưu | Hiện lỗi "Chỉ tiêu vừa được người khác sửa, đã tải lại" và tải lại dòng | component |
| AC-KPI-051 | — | An chọn phòng ban "Phát Triển Kinh Tế" / gõ "0903" vào ô tìm | Gọi GET với `department_id` / `q` tương ứng (debounce), bảng cập nhật; không có kết quả → "Không có nhân viên phù hợp" | component |
| AC-KPI-052 | Tháng 11/2026 | An bấm "Copy sang tháng sau", chọn "Đến tháng 01/2027", để trống ô "Ghi đè chỉ tiêu đã có", bấm "Copy" | Gọi copy `{from_month:"2026-11", to_month:"2027-01", overwrite:false}`; modal đóng; toast "Đã copy: 3 mới, 0 ghi đè, 1 giữ nguyên" | component |
| AC-KPI-053 | Copy lỗi 422/500 | bấm "Copy" | Modal giữ mở, hiện lỗi tiếng Việt (M20-04) | component |
| AC-KPI-054 | 390px | mở trang | Mỗi nhân viên là 1 thẻ (mã, tên, phòng ban, ô chỉ tiêu); vùng chạm ≥ 44px; không cuộn ngang. 1440px: dạng bảng | e2e |
| AC-KPI-055 | — | Trang Nhân sự, khối "Cách phân quyền hoạt động" | Có nhãn "Thiết lập doanh thu KPI" cho Manager (sinh từ `permissionMatrix.json`) | component |

## 4. API
Dùng API của M21-01a.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Header: "Thiết lập doanh thu KPI"; phụ đề "Chỉ tiêu thu nhập thuần theo tháng cho từng nhân viên".
- Dòng bộ lọc: Tháng (input `month`), Phòng ban (select, "Tất cả phòng ban"), Tìm ("Tên, SĐT hoặc email"); nút "Copy sang tháng sau" (icon `Copy`).
- Nhân viên đã nghỉ có chỉ tiêu: badge "Đã nghỉ", chỉ xem, không sửa.
- Nút xoá chỉ tiêu (icon `X`, aria "Xoá chỉ tiêu"), xác nhận "Xoá chỉ tiêu tháng 11/2026 của Trần Thị Hoa?".
- Modal copy: "Từ tháng: 11/2026" (chỉ đọc), "Đến tháng" (chọn 1–12 tháng sau), checkbox "Ghi đè chỉ tiêu đã có", nút "Huỷ"/"Copy".
- Screenshot 390px + 1440px → `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → Thông tin Công ty → Thiết lập doanh thu KPI.
2. Đặt chỉ tiêu 30tr cho 1 nhân viên tháng hiện tại.
3. Copy sang 2 tháng sau → chuyển bộ chọn tháng để thấy chỉ tiêu đã có.
4. Sửa tháng sau thành 35tr → quay lại tháng hiện tại vẫn 30tr.
5. Lọc phòng ban, tìm theo SĐT.

## 8. Giả định & câu hỏi
- Giả định: nhập tiền định dạng `vi-VN` (dấu chấm phân cách nghìn) giống các ô tiền khác.
