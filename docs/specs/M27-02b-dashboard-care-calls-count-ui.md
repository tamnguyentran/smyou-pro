# M27-02b — UI: thẻ "Lượt gọi CSKH" + popup gộp 2 nguồn

- **Status:** Approved (2026-11-08; Q195 đã chốt)
- **Backlog:** M27-02b · **Milestone:** M27
- **Phụ thuộc:** M27-02a
- **Thay thế một phần:** M18-01c AC-DASH-116/117 (nhãn thẻ, cột popup `care.customers`, tiêu đề cột `care.staff`). Nhãn "KH đã gọi" của M20-10 (AC-UI-070/071/074/075) và M16-03 (AC-DASH-064/065) cũng đổi thành "Lượt gọi CSKH" — test cũ đã sửa chuỗi nhãn tương ứng (không đổi điều kiện bố cục).

## 1. Mục tiêu
Tổng quan hiện đúng số lượt gọi CSKH (recheck đơn + cuộc gọi trang "Chăm sóc KH") và popup liệt kê từng lượt.

## 2. Phạm vi
- Thẻ "KH đã gọi" đổi nhãn → **"Lượt gọi CSKH"** (giữ "Hôm nay: n").
- Popup "Lượt gọi CSKH (n)": desktop bảng cột Thời gian · Nguồn · Khách hàng · SĐT · Nội dung · Người gọi; mobile thẻ. Nguồn: "Recheck DH…" (link `/orders/{id}`) hoặc "Cuộc gọi CSKH". Có "Xuất Excel".
- Popup "NV đã gọi điện CSKH": cột "Số KH đã chăm sóc" → "Số lượt gọi".
- Hướng dẫn CSKH/Quản lý: câu về thẻ (nếu có).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-136 | Linh, `care_summary.month = 5` | mở Tổng quan | Thẻ "Lượt gọi CSKH" = 5, "Hôm nay: 2" | component |
| AC-DASH-137 | Popup có 1 dòng recheck DH2611-0041 + 1 dòng cuộc gọi | bấm thẻ (1440px / 390px) | Tiêu đề "Lượt gọi CSKH (2)"; cột/ thẻ đúng §2; dòng recheck link `/orders/{id}`, dòng cuộc gọi hiện "Cuộc gọi CSKH" không link | component + e2e |
| AC-DASH-138 | An | bấm "NV đã gọi điện CSKH" | Cột "Số lượt gọi" | component |
| AC-DASH-139 | 390px và 1440px | mở popup | Không cuộn ngang; chạm ≥ 44px; axe không serious/critical; ảnh `reports/screenshots/` | e2e |
