# M21-05b — UI: KTV ghi "Tiềm năng sử dụng dịch vụ"; báo cáo Doanh thu theo khách hàng hiện Tiềm năng + Ngày mua hàng cuối

- **Status:** Approved (2026-11-01, chủ dự án chốt Q146–Q156)
- **Backlog:** M21-05b · **Milestone:** M21
- **Phụ thuộc:** M21-05a
- **Liên quan:** frontend/src/features/myTasks, frontend/src/features/orders (chi tiết đơn), frontend/src/features/revenueReport

## 1. Mục tiêu
Là KTV, tôi muốn ghi nhanh tiềm năng của khách ngay trong đầu việc đang làm (điện thoại). Là Manager/Sale/CSKH, tôi muốn thấy tiềm năng mới nhất và ngày mua hàng cuối của khách trong báo cáo doanh thu theo khách hàng.

## 2. Phạm vi
- Trong phạm vi:
  - Chi tiết đầu việc của KTV ("Việc của tôi") và chi tiết đơn: khối "Tiềm năng sử dụng dịch vụ" — hiện ghi chú mới nhất + "Xem lịch sử (n)"; nút "Ghi tiềm năng" (chỉ khi `capabilities` cho phép và server không chặn) mở modal ô văn bản.
  - Báo cáo "Doanh thu theo khách hàng": thêm cột "Tiềm năng" (rút gọn 2 dòng, xem đủ bằng tooltip/bấm) và "Ngày mua hàng cuối" (`dd/MM/yyyy`); mobile hiện trong thẻ.
  - Cập nhật `permissionLabels.ts` + khối "Cách phân quyền hoạt động" + `docs/product/PERMISSIONS.md` (KTV: "Ghi tiềm năng khách hàng").
- Ngoài phạm vi: lọc báo cáo theo tiềm năng.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CUS-052 | Khang (KTV) mở đầu việc IN_PROGRESS của đơn DH2611-0005, KH chưa có ghi chú | render | Khối "Tiềm năng sử dụng dịch vụ" hiện "Chưa có ghi nhận" + nút "Ghi tiềm năng" (vùng chạm ≥ 44px) | component |
| AC-CUS-053 | Như trên | bấm "Ghi tiềm năng", nhập "Muốn lắp thêm 4 camera kho", bấm "Lưu" | Gọi POST; modal đóng; toast "Đã ghi tiềm năng khách hàng"; khối hiện ghi chú mới + "Khang · vừa xong" | component |
| AC-CUS-054 | Modal mở | Lưu với ô trống / > 1000 ký tự | Không gọi API; lỗi "Vui lòng nhập nội dung" / "Tối đa 1000 ký tự"; bộ đếm ký tự hiện `n/1000` | component |
| AC-CUS-055 | Server trả 409 (đơn đã hoàn tất) | Lưu | Modal giữ mở, hiện "Đơn đã hoàn tất hoặc huỷ, không ghi thêm được" (M20-04) | component |
| AC-CUS-056 | KH có 2 ghi chú | bấm "Xem lịch sử (2)" | Danh sách mới nhất trước: nội dung, người ghi, mã đơn, thời điểm (giờ VN) | component |
| AC-CUS-057 | Hoa (SALE) mở chi tiết đơn DH2611-0005 | render | Thấy khối tiềm năng (chỉ đọc), **không** có nút "Ghi tiềm năng" | component |
| AC-CUS-058 | Báo cáo Doanh thu theo khách hàng 1440px, dòng Minh Phát có tiềm năng + `last_purchase_date=2026-11-03` | render | Có cột "Tiềm năng" hiện ghi chú, cột "Ngày mua hàng cuối" = "03/11/2026"; dòng không có → "—" | component |
| AC-CUS-059 | 390px | báo cáo | Thẻ khách có dòng "Tiềm năng: …" và "Mua cuối: 03/11/2026"; không cuộn ngang | e2e |
| AC-CUS-060 | Khang trên 390px | ghi tiềm năng từ "Việc của tôi" | Toàn luồng chạy được trên stack thật | e2e |

## 4. API
Dùng API M21-05a.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Khối đặt dưới thông tin khách hàng trong chi tiết đầu việc/đơn; icon `Lightbulb`.
- Modal: tiêu đề "Tiềm năng sử dụng dịch vụ — <tên KH>", textarea placeholder "VD: Khách muốn lắp thêm camera kho, hỏi giá máy in màu…", nút "Huỷ"/"Lưu".
- Screenshot 390px + 1440px (Việc của tôi + báo cáo) → `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. KTV tiếp nhận + bắt đầu đầu việc → mở đầu việc → "Ghi tiềm năng" → lưu.
2. Sale mở chi tiết đơn → thấy ghi chú, không có nút ghi.
3. Manager mở Báo cáo → Doanh thu theo khách hàng → thấy cột Tiềm năng + Ngày mua hàng cuối.

## 8. Giả định & câu hỏi
- Không thêm câu hỏi mới (xem Q154–Q156 ở M21-05a).
