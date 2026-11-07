# UAT-04 — Hoá đơn bán hàng dài hơn 1 trang A5 ngang tự in khổ A4 dọc

- **Status:** Approved (chủ dự án yêu cầu 2026-11-07)
- **Backlog:** UAT-04 · **Milestone:** UAT
- **Liên quan:** `docs/specs/M17-04-order-invoice-print-a5.md` (AC-ORD-207…218; thay phần "`@page` A5 ngang" của AC-ORD-215), `frontend/src/features/orders/components/PrintInvoiceButton.tsx`, `frontend/src/styles/index.css`

## 1. Mục tiêu
Nút "In" ở màn hình đơn hàng: nếu hoá đơn vừa 1 trang A5 ngang thì in A5 ngang như cũ; nếu dài hơn 1 trang A5 ngang thì tự chuyển sang khổ **A4 dọc** (không bắt người dùng chọn khổ giấy).

## 2. Phạm vi
- Trong phạm vi: đo chiều cao bản in trước khi mở hộp thoại in, ở đúng bề rộng vùng in (194 mm = 210 − 2 × 8 mm lề — **bằng nhau** ở A5 ngang và A4 dọc, nên bố cục không đổi); cao hơn 1 trang A5 ngang (148 mm, trừ 3 mm dự phòng sai số giữa màn hình và bản in) → `@page { size: A4 portrait }`; gỡ khi hộp thoại in đóng.
- Thu gọn bố cục A5 (chủ dự án chốt 2026-11-07, vì mẫu cũ dù 1 dòng hàng đã cao 159 mm > 148 mm, tức luôn 2 trang A5): đệm trên/dưới 8 → 5 mm; tiêu đề, khoảng cách hẹp hơn; khối khách hàng ghép cặp MST/Điện thoại, Email/Diễn giải; "Số tiền bằng chữ" bên trái khối tổng; chỗ ký 15 → 10 mm; logo cao 15 → 10 mm. Nội dung không đổi. Đo thực tế: 1 dòng 121 mm, tối đa ~6 dòng (142 mm) vẫn 1 trang A5 ngang.
- Ngoài phạm vi: nội dung bản in, API `invoice-print`, quyền `order.print`. Hoá đơn dài hơn 1 trang A4 thì sang trang A4 tiếp theo (tiêu đề cột lặp lại như cũ).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-277 | Chiều cao bản in đo ở bề rộng 194 mm | tính khổ giấy | ≤ 145 mm (148 − 3) → `A5`; > 145 mm → `A4` | unit |
| AC-ORD-278 | Desktop; bản in đo được cao hơn 1 trang A5 ngang | bấm "In" | Trước `window.print`: bản in có `data-paper="A4"` và trang có quy tắc in `@page { size: A4 portrait }`; bản in vừa A5 → `data-paper="A5"`, không có quy tắc A4 | component |
| AC-ORD-279 | Đã in 1 đơn khổ A4 | hộp thoại in đóng (`afterprint`) | Quy tắc A4 bị gỡ; lần in sau đơn ngắn in A5 ngang | component |
| AC-ORD-280 | Đơn 3 dòng hàng / đơn 25 dòng hàng | in ra PDF (`preferCSSPageSize`) | 3 dòng: 1 trang A5 ngang (≈ 595 × 420 pt). 25 dòng: trang A4 dọc (≈ 595 × 842 pt), tiêu đề cột vẫn là `table-header-group` | e2e |

## 4. API
Không đổi.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Không đổi giao diện màn hình. Bản in: bố cục A5 thu gọn như §2; khổ giấy theo chiều dài.

## 7. Kịch bản UAT thủ công
1. Mở đơn ít dòng hàng (vd 3 dòng), bấm "In" → xem trước: 1 trang A5 ngang.
2. Mở đơn nhiều dòng (vd 25 dòng), bấm "In" → xem trước: khổ A4 dọc.
3. Sau đó in lại đơn ít dòng → quay về A5 ngang.

## 8. Giả định & câu hỏi
- Giả định: 3 mm dự phòng để đơn "vừa khít" A5 không bị tràn 1–2 dòng sang trang 2 do khác biệt hiển thị phông chữ màn hình/bản in.
