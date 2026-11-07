# M24-01b — Báo cáo "Doanh thu theo SP/DV" — Giao diện

- **Status:** Approved
- **Backlog:** M24-01b · **Milestone:** M24
- **Phụ thuộc:** M24-01a (API)
- **Liên quan:** M16-05 / M15-10b (mẫu trang "Doanh thu theo nhân viên"), spec/permissions.yaml#menu `reports`

## 1. Mục tiêu
Là Manager/Sale/CSKH/QLKT, tôi muốn mở báo cáo doanh thu theo nhóm SP/DV hoặc theo từng sản phẩm ngay dưới "Doanh thu theo nhân viên" trong menu Báo cáo, chuyển qua lại 2 kiểu xem bằng nút chọn (radio), xem chi tiết dòng hàng và xuất file.

## 2. Phạm vi
- Trong phạm vi:
  - Menu mới trong nhóm "Báo cáo", **ngay dưới** "Doanh thu theo nhân viên": `{ id: reports-revenue-product, label: Doanh thu theo SP/DV, icon: Package, path: /reports/revenue-by-product, capability: report.revenue.read }` → `make contract` sinh lại `menu.json`.
  - Trang `/reports/revenue-by-product`, tái dùng bố cục/bộ lọc/bảng/drilldown/nút "Xuất Excel" của "Doanh thu theo nhân viên".
  - Radio "Xem theo": **Nhóm SP/DV** (mặc định) | **Từng sản phẩm/dịch vụ** — đổi radio thì tải lại bảng với `mode` tương ứng, giữ nguyên bộ lọc khác; lựa chọn ghi vào URL (`?mode=item`) để tải lại trang vẫn giữ.
  - Bộ lọc: Từ ngày – Đến ngày (DateField), Trạng thái (Đã hoàn tất / Chưa hoàn tất), Nhóm SP/DV (mặc định "Tất cả", có "Chưa phân nhóm").
  - Cột bảng — theo nhóm: Nhóm SP/DV, Số đơn, Doanh thu, Lợi nhuận. Theo sản phẩm: Mã, Tên, Loại (Sản phẩm / Dịch vụ / Tự nhập), ĐVT, Số lượng, Số đơn, Doanh thu, Lợi nhuận. Dòng tổng cộng cuối bảng (Doanh thu, Lợi nhuận). Lợi nhuận `null` → "—".
  - Bấm 1 dòng → drilldown danh sách dòng hàng (Mã đơn, Tên hàng, Số lượng, Doanh thu, Lợi nhuận) như báo cáo theo nhân viên.
- Ngoài phạm vi: biểu đồ (đã có ở M23).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-152 | An (MANAGER) đăng nhập | mở menu "Báo cáo" | Mục "Doanh thu theo SP/DV" nằm ngay sau "Doanh thu theo nhân viên"; Đức (TECHNICIAN) không thấy mục này | component + generated |
| AC-RPT-153 | An mở `/reports/revenue-by-product` | render lần đầu | Radio "Nhóm SP/DV" được chọn; bộ lọc đầu tháng→hôm nay, "Đã hoàn tất", nhóm "Tất cả"; bảng cột Nhóm SP/DV, Số đơn, Doanh thu, Lợi nhuận | component |
| AC-RPT-154 | Trang đang ở chế độ nhóm | chọn radio "Từng sản phẩm/dịch vụ" | Gọi API `mode=item`; bảng đổi sang cột Mã, Tên, Loại, ĐVT, Số lượng, Số đơn, Doanh thu, Lợi nhuận; URL có `mode=item`; bộ lọc ngày/trạng thái/nhóm giữ nguyên | component |
| AC-RPT-155 | Mở `/reports/revenue-by-product?mode=item` | render | Radio "Từng sản phẩm/dịch vụ" được chọn ngay | component |
| AC-RPT-156 | Bảng chế độ sản phẩm có dòng Camera Dahua 2MP | bấm dòng | Mở chi tiết các dòng hàng của Camera Dahua 2MP (Mã đơn, Tên hàng, Số lượng, Doanh thu, Lợi nhuận) | component |
| AC-RPT-157 | Chế độ sản phẩm + lọc nhóm "Thiết bị an ninh" | bấm "Xuất Excel" | Tải file theo đúng `mode=item` và `group_id` đang lọc | component |
| AC-RPT-158 | Không có dữ liệu trong khoảng lọc | render | Thông báo trống "Không có doanh thu trong khoảng thời gian này" | component |
| AC-RPT-159 | Màn 390px | render | Radio xếp dọc, vùng chạm ≥ 44px; bảng chuyển dạng thẻ; không cuộn ngang trang | component + e2e |
| AC-RPT-160 | Dữ liệu seed 2 nhóm | An đi menu → trang → đổi radio → mở chi tiết (mobile + desktop) | Đúng số liệu, ảnh chụp 390px/1440px ở `reports/screenshots/`, 0 lỗi a11y | e2e |

## 4. API
Không có route mới — dùng 3 route của M24-01a.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Radio: nhóm `role="radiogroup"` nhãn "Xem theo", 2 lựa chọn "Nhóm SP/DV", "Từng sản phẩm/dịch vụ"; desktop nằm ngang trên bộ lọc, mobile xếp dọc.
- Loại hiển thị: `PRODUCT` "Sản phẩm", `SERVICE` "Dịch vụ", `CUSTOM` "Tự nhập".
- Loading/lỗi/trống giống trang "Doanh thu theo nhân viên".

## 7. Kịch bản UAT thủ công
1. Mở Báo cáo → "Doanh thu theo SP/DV" (ngay dưới "Doanh thu theo nhân viên").
2. Xem theo nhóm, rồi chọn "Từng sản phẩm/dịch vụ" — số tổng phải bằng nhau.
3. Bấm 1 sản phẩm xem chi tiết; xuất Excel.

## 8. Giả định & câu hỏi
- **Q179** Nhãn menu "Doanh thu theo SP/DV" (ngắn cho sidebar), tiêu đề trang "Doanh thu theo nhóm & sản phẩm/dịch vụ".
- Thay đổi `spec/permissions.yaml` (chỉ menu, không đổi quyền — quy tắc 13 vẫn chạy `make contract`):
  ```yaml
        - { id: reports-revenue-employee, label: Doanh thu theo nhân viên,   icon: UserCog,   path: /reports/revenue-by-employee, capability: report.revenue.read }
  +     - { id: reports-revenue-product,  label: Doanh thu theo SP/DV,       icon: Package,   path: /reports/revenue-by-product,  capability: report.revenue.read }  # M24-01b
  ```
