# M17-04 — In "Hoá đơn bán hàng" khổ A5 (chỉ desktop)

- **Status:** Approved (chủ dự án duyệt 2026-10-29, chốt Q109–Q114)
- **Backlog:** M17-04 · **Milestone:** M17
- **Liên quan:** spec/permissions.yaml#order.print (mới), #order.read, #company.manage; M17-01 (thông tin công ty); mẫu: `Tài liệu tham khảo/1790242987806_…8c23a5fe2eb6cdd26217b5c73df9e28c.jpg`

## 1. Mục tiêu
Là người dùng xem được đơn hàng, dùng máy tính, tôi muốn bấm "In" ở màn tạo/sửa đơn nháp hoặc chi tiết đơn để in ra "Hoá đơn bán hàng" khổ A5 giống mẫu giấy công ty đang dùng, đưa khách ký nhận.

## 2. Phạm vi
- Trong phạm vi:
  - API chỉ-đọc `GET /api/v1/orders/{id}/invoice-print` trả thông tin công ty (M17-01) + người lập + số phiếu, kiểm quyền `order.print` (cùng vai trò & scope với `order.read`).
  - Nút "In" (icon `Printer`) trên màn chi tiết đơn và màn sửa đơn nháp (đơn đã lưu), **chỉ hiện ở màn hình ≥ 1024px** (cùng mốc desktop của `AppShell`).
  - Bản in A5 ngang (`@page { size: A5 landscape }`), bố cục theo mẫu: logo + tên/địa chỉ/ĐT/Fax/Email/Website công ty; tiêu đề "HÓA ĐƠN BÁN HÀNG"; khối khách hàng; Ngày xuất/Số phiếu/Loại tiền; bảng dòng hàng; tổng; số tiền bằng chữ; ngày + ô ký "Người nhận"/"Người lập".
  - Hàm đổi số tiền VND → chữ tiếng Việt.
- Ngoài phạm vi: xuất PDF/gửi email; hoá đơn điện tử/VAT theo quy định thuế; con dấu đỏ (đóng dấu tay lên giấy); in trên mobile/tablet; lưu lịch sử số lần in.

## 3. Acceptance Criteria
Dữ liệu mẫu: công ty "CÔNG TY TNHH SMYOU" (seed M17-01, MST 0309390732); đơn `DH2609-0012` ở `IN_PROGRESS`, khách "KHÁCH LẺ - BP MÁY IN", ĐT 0903667344, diễn giải "ANH THANH TUẤN - 0903.667.344"; dòng 1 `HOPMUC3053` "HOP MUC SMYOU 107A (W1107A)" Cái ×1 × 550.000; dòng 2 `LT9601` "VO HOP MUC SMYOU" Cái ×1 quà tặng (0đ). Tổng 550.000.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-202 | Sale Lan (người tạo đơn) đăng nhập | `GET /orders/{id}/invoice-print` | 200; `company` có `name`, `tax_code`, `address`, `phone`, `fax`, `email`, `website`, `logo_url`; `issuer_name` = họ tên người gọi ("Nguyễn Thị Thu Thủy" nếu người gọi là Thủy); `slip_no` theo AC-ORD-217 | integration |
| AC-ORD-203 | Manager, Quản lý kỹ thuật, CSKH (đơn bất kỳ); Kỹ thuật viên được giao đơn | gọi như trên | 200 | integration + generated |
| AC-ORD-204 | Kỹ thuật viên **không** được giao đơn | gọi như trên | 404 (ngoài scope, giống `order.read`) | integration |
| AC-ORD-205 | Đơn không tồn tại | gọi như trên | 404 | integration |
| AC-ORD-206 | Đơn ở `CANCELLED` | gọi như trên | 409 `INVALID_STATE`; UI không hiện nút "In" cho đơn đã huỷ | integration + component |
| AC-ORD-207 | Desktop 1440px, Sale mở chi tiết `DH2609-0012` | xem thanh nút | Thấy nút "In" (icon Printer, cao ≥ 44px) | component + e2e |
| AC-ORD-208 | Viewport 390px và 768px | mở chi tiết đơn / màn sửa đơn nháp | **Không** render nút "In" (không chỉ ẩn bằng CSS) | component + e2e |
| AC-ORD-209 | Desktop; đơn nháp đã lưu, form chưa sửa gì | bấm "In" | Gọi API in, mở hộp thoại in của trình duyệt (`window.print`) với bản in của dữ liệu đã lưu | component |
| AC-ORD-210 | Desktop; đơn nháp có thay đổi chưa lưu, hoặc đơn mới chưa lưu lần nào | xem nút "In" | Nút bị vô hiệu, gợi ý "Lưu đơn trước khi in" | component |
| AC-ORD-211 | Dữ liệu mẫu ở trên | render bản in | Hiện "HÓA ĐƠN BÁN HÀNG"; Số phiếu = `slip_no` từ API; Loại tiền `VND`; Tên khách hàng, Địa chỉ (= địa chỉ dịch vụ), Mã số thuế, Điện thoại, Email, Diễn giải (= mô tả công việc); bảng 11 cột Stt/Mã hàng/Tên hàng/ĐVT/SL/Đơn giá/VAT (%)/Chiết khấu/Thành tiền (Chưa VAT)/Tiền VAT/Thành tiền có VAT, ngay dưới là hàng đánh số cột `1`…`8`, `9=5x6`, `10=7x(9-8)`, `11=9-8+10` (chủ dự án chốt 2026-10-29; không có cột Ghi chú); cột 8/9/10/11 = `line_discount`/`line_gross`/`line_vat`/`line_total` đã lưu của dòng; "Mã hàng" và các cột số vừa khít dữ liệu, không xuống dòng; "Tên hàng" xuống dòng; không cột nào bị cắt khỏi khổ giấy; dòng 1 "550.000"/"0"/"0"/"550.000"/"0"/"550.000", dòng 2 toàn "0"; số lượng hiện "1" (số lẻ: "1,5") | component |
| AC-ORD-212 | Đơn có chiết khấu 50.000 và VAT 8% | render bản in | Dưới bảng luôn đủ 4 dòng (chủ dự án chốt 2026-10-29): "Tổng tiền chưa có VAT" (= `subtotal`), "Tổng chiết khấu" (= `discount_amount`), "Tổng tiền VAT" (= `vat_amount`), "Tổng tiền thanh toán đã có VAT" (= `total`); số tiền bằng chữ = dòng cuối. Đơn mẫu: 550.000 / 0 / 0 / 550.000 | component |
| AC-ORD-213 | Tổng 550.000 / 1.250.000 / 1.005.000 / 0 | đổi số tiền thành chữ | "Năm trăm năm mươi ngàn đồng" / "Một triệu hai trăm năm mươi ngàn đồng" / "Một triệu không trăm lẻ năm ngàn đồng" / "Không đồng" | unit |
| AC-ORD-214 | In ngày 24/09/2026 (giờ Asia/Ho_Chi_Minh) | render bản in | "Ngày xuất: 24/09/2026"; dòng ký "Ngày 24 tháng 09 năm 2026"; "Người nhận (Ký, ghi rõ họ tên)"; "Người lập (Ký, ghi rõ họ tên)" + `issuer_name` bên dưới | component |
| AC-ORD-215 | Đơn 25 dòng hàng | in | CSS in: `@page` A5 ngang; chỉ bản in hiển thị (ẩn shell/menu/nút); tiêu đề cột bảng lặp lại khi sang trang 2 (`thead` `display: table-header-group`) | component + e2e (screenshot `print` media) |
| AC-ORD-216 | Công ty chưa có logo / thiếu Fax | render | Không vỡ bố cục: bỏ ảnh logo, bỏ mục "Fax" trống | component |
| AC-ORD-217 | Ngày 24/09/2026 (giờ VN) đã có 23 đơn được tạo trước `DH2609-0012` trong cùng ngày tạo của nó | in đơn này vào 24/09/2026 | `slip_no` = `24-XBH24092026`; in lại lần nữa cùng ngày → vẫn `24-XBH24092026`; đơn đầu tiên trong ngày → `01-XBH…`; thứ tự > 99 → hiện đủ chữ số (`100-XBH…`), không cắt | unit + integration |
| AC-ORD-218 | Cùng đơn trên, in vào 25/09/2026 | in | `slip_no` = `24-XBH25092026` (phần ngày = ngày in) | integration |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/orders/{id}/invoice-print | order.print | — | `{ company: { name, tax_code, address, phone, fax, email, website, logo_url }, issuer_name, printed_at, slip_no }` | 404, 409 |

**Số phiếu (`slip_no`)** = `NN-XBHddmmyyyy`: `NN` = thứ tự (2 chữ số, 01–99) của đơn trong các đơn được tạo cùng ngày với nó (ngày theo `created_at`, giờ Asia/Ho_Chi_Minh, sắp theo `created_at` rồi `code`; tính cả đơn đã huỷ để số không bị nhảy khi huỷ đơn khác); `ddmmyyyy` = ngày in. Không lưu DB.

Dữ liệu đơn (dòng hàng, tổng) lấy từ `GET /orders/{id}` sẵn có — không nhân bản.

## 5. Dữ liệu / Migration
Không có. `spec/permissions.yaml` thêm (xem §8).

## 6. UI
- Nút "In" (`variant` phụ, icon `Printer`): chi tiết đơn — cạnh nhóm nút hành động đầu trang; màn sửa đơn nháp — cạnh nút "Lưu". Chỉ render khi `useMediaQuery("(min-width: 1024px)")` và có capability `order.print`.
- Bản in A5 ngang (210mm): toàn hoá đơn cỡ chữ 8pt (chủ dự án yêu cầu giảm 1pt, 2026-10-29); bảng 11 cột + hàng đánh số cột, cột mã/số vừa khít dữ liệu, "Tên hàng" chiếm phần còn lại và tự xuống dòng.
- Bấm "In": nút loading "Đang chuẩn bị…" → render component `InvoicePrint` qua portal (chỉ hiện ở `@media print`) → `window.print()`. Lỗi API → toast "Không tải được dữ liệu in. Vui lòng thử lại."
- Bản in: chữ đen trên nền trắng, font hệ thống, số tiền định dạng `vi-VN` (`550.000`), ngày `dd/MM/yyyy` theo `Asia/Ho_Chi_Minh`.

## 7. Kịch bản UAT thủ công
1. Trên máy tính, đăng nhập Sale, mở một đơn có 2 dòng hàng → thấy nút "In".
2. Bấm "In" → xem trước bản in khổ A5 ngang, đối chiếu với hoá đơn mẫu và số phiếu dạng `NN-XBHddmmyyyy`.
3. Thu nhỏ cửa sổ < 1024px (hoặc mở trên điện thoại) → nút "In" biến mất.
4. Mở màn sửa đơn nháp, sửa 1 ô chưa lưu → nút "In" bị mờ "Lưu đơn trước khi in"; lưu xong → in được.

## 8. Giả định & câu hỏi
Đã chốt với chủ dự án 2026-10-29:
- **Q109** — Ai vào được trang đơn hàng thì được in (chỉ đơn đã lưu). Capability mới, cùng vai trò/scope với `order.read`:
  ```yaml
  order.print: { MANAGER: all, SALE: all, CUSTOMER_CARE: all, TECH_LEAD: all, TECHNICIAN: assigned }   # M17-04 (Q109)
  ```
  Ghi chú: CSKH bình thường không có `order.read_prices` nhưng bản in hiện giá — theo quyết định Q109, bản in vẫn hiện đầy đủ giá cho mọi người được in.
- **Q110** — Mọi trạng thái trừ `CANCELLED`, kể cả `DRAFT` đã lưu.
- **Q111** — "Ngày xuất" = ngày bấm in.
- **Q112** — "Người lập" = họ tên người bấm in.
- **Q113** — A5 **ngang** (chủ dự án đổi từ dọc sang ngang 2026-10-29, khi đang triển khai).
- **Q114** — Đồng ý: Thành tiền dòng chưa VAT; (đổi 2026-10-29) phần tổng luôn 4 dòng chưa VAT / Tổng chiết khấu / Tiền VAT / Thanh toán đã có VAT; bằng chữ theo dòng cuối, dùng "ngàn".
- **Số phiếu** — `NN-XBHddmmyyyy` (xem §4). Diễn giải của mình (cần báo nếu sai): `NN` = thứ tự của đơn trong ngày **tạo đơn**, ổn định khi in lại; `ddmmyyyy` = ngày in.
- **Triển khai (2026-10-29):** `company.logo_url` là `data:` URL (logo nhúng sẵn) — vì AC-SYS-132 (M17-01) cấm Sale đọc file logo qua `/attachments`, nên không mở quyền file; mọi người có `order.print` vẫn thấy logo trên bản in.
- Giả định giữ nguyên: "Địa chỉ" khách = địa chỉ dịch vụ; "Fax" khách để trống; "Mã hàng" = mã SP/DV snapshot; (bỏ cột "Ghi chú" theo chủ dự án 2026-10-29). Chiết khấu dòng: có cột riêng (cột 8), Tiền VAT = VAT × (Thành tiền chưa VAT − Chiết khấu) — chủ dự án chốt 2026-10-29.
