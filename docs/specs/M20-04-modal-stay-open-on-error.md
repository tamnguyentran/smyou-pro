# M20-04 — Modal chỉ đóng khi lưu thành công; tạo đơn — thêm khách xong tự chọn

- **Status:** Approved
- **Backlog:** M20-04 · **Milestone:** M20
- **Liên quan:** `frontend/src/components/ui/Sheet.tsx`, `ConfirmDialog.tsx`; sửa đổi AC-ORD-062 (M3-03b — lỗi gửi đơn), AC-ORD-240 (M19-01b — lỗi KTV thêm/xoá dòng), hành vi STALE "tải lại rồi đóng" của M3-04b; bổ sung AC-UI-049 (M16-10). Thuần UI — không đổi API/DB/quyền/`spec/*.yaml`.

## 1. Mục tiêu
Là người dùng bất kỳ, khi bấm Lưu/Xác nhận trong một modal mà hệ thống báo lỗi, tôi muốn modal **vẫn mở, giữ nguyên dữ liệu đã nhập và hiện lỗi ngay trong modal**, để sửa và thử lại chứ không phải nhập lại từ đầu. Là Sale, khi thêm khách mới (cá nhân hoặc công ty) ngay từ màn tạo đơn, tôi muốn khách đó được chọn sẵn vào ô "Tìm khách hàng".

## 2. Phạm vi
- **Quy tắc chung (mọi modal có nút Lưu/Xác nhận gọi server):** chỉ đóng khi server trả thành công. Lỗi bất kỳ (4xx/5xx/mất mạng/`STALE_VERSION`) → modal vẫn mở, dữ liệu nhập giữ nguyên, lỗi hiện bằng `Alert` trong thân modal, nút bấm lại được.
- Kết quả rà soát code (2026-10-31) — các modal **đang vi phạm**, phải sửa:
  1. Xác nhận "Gửi đơn" (`DraftOrderForm.doSubmit`) — `onError` đóng dialog, lỗi hiện ở banner trang (AC-ORD-062).
  2. Xác nhận "Thu hồi đơn" (`OrderDetailTabs.submitRecall`) — `STALE_VERSION` đóng dialog.
  3. "Thêm dòng hàng" (`AddLineSheet`) — KTV tại hiện trường (`onSite`) lỗi → toast + đóng (AC-ORD-240); sau khi gửi đơn gặp `STALE_VERSION` → tải lại đơn + đóng.
  4. Xác nhận "Xoá dòng" (`OrderLinesSection`, `ConfirmDialog`) — mọi lỗi đều đóng dialog trước rồi mới báo.
- Các modal **đã đúng** (giữ nguyên, phủ bằng test hồi quy ở AC-UI-063): Thêm/Sửa khách hàng, sản phẩm, dịch vụ, nhóm SP/DV, phòng ban, nhân sự, quà tặng; Tạo/Sửa đầu việc, Huỷ/Mở lại đầu việc; Huỷ/Hoàn tất/Chỉnh sửa đơn; Sửa liên hệ; Hoàn thành/Từ chối phân công; Yêu cầu chỉnh sửa (CSKH); Nhập danh mục từ Excel; Thêm/Gỡ KTV khỏi đầu việc.
- Tạo đơn — "Thêm khách hàng": đã có từ M16-10 (AC-UI-049, test component). Item này bổ sung chứng minh trên stack thật (e2e) cho **cả cá nhân và công ty**, kể cả khi đã thêm dòng hàng trước (đơn nháp đã được tạo ngầm), và các nhánh lỗi/trùng SĐT.
- **Ngoài phạm vi:** popup chỉ đọc (chi tiết thẻ Tổng quan, drilldown báo cáo — không có nút Lưu; lỗi "Xuất Excel" vẫn là toast); sửa dòng hàng inline (không phải modal); đổi message lỗi của server; thay `Sheet` bằng thư viện khác.

## 3. Acceptance Criteria
Prefix `AC-UI` (tiếp từ AC-UI-056).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-057 | Hoa (SALE) ở đơn nháp DH2610-0012 của mình, đơn có 1 dòng nhưng khách vừa bị gỡ ở tab khác → server sẽ trả 409 `GUARD_FAILED` guard=`customer_present` | bấm "Gửi đơn" → "Xác nhận" | Dialog xác nhận **vẫn mở**, trong dialog hiện `Alert` đúng message server ("Đơn cần có khách hàng trước khi gửi."); nút "Gửi đơn" trong dialog bấm lại được; đơn vẫn DRAFT; không có banner lỗi trùng ngoài trang. Bấm "Huỷ" → dialog đóng, lỗi mất | component |
| AC-UI-058 | Như AC-UI-057 nhưng server trả 409 `STALE_VERSION` | Xác nhận gửi đơn | Dialog vẫn mở, hiện "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" (ẩn nút Gửi); bấm "Tải lại" → tải lại đơn và đóng dialog | component |
| AC-UI-059 | Hoa ở đơn DH2610-0012 (PENDING_DISPATCH, có `recall`); server trả 409 `STALE_VERSION` | "Thu hồi" → xác nhận | Dialog vẫn mở với thông báo + nút "Tải lại" như AC-UI-058 (thay hành vi cũ: đóng dialog rồi hiện banner ngoài trang). Server trả 409 `GUARD_FAILED` → dialog vẫn mở, hiện message server | component |
| AC-UI-060 | KTV Trần Văn Bình (phân công ACCEPTED) ở tab Dòng hàng đơn DH2610-0015, mở "Thêm dòng hàng", chọn "Camera Dahua 2MP" SL 2; server trả 409 `GUARD_FAILED` guard=`actor_has_active_work_on_order` (hoặc 409 `ORDER_LOCKED`) | bấm "Thêm" | Sheet **vẫn mở**, giữ sản phẩm + SL đã chọn, hiện `Alert` message server trong sheet; **không** toast lỗi, không đóng (sửa AC-ORD-240 vế "thêm") | component |
| AC-UI-061 | Như AC-UI-060 (cả KTV `on-site` lẫn Sale sau khi gửi đơn `after-submit`); server trả 409 `STALE_VERSION` | bấm "Thêm" | Đơn được tải lại ngầm (giữ hành vi M3-04b), sheet **vẫn mở** giữ dữ liệu nhập, hiện `Alert` "Đơn vừa được người khác cập nhật, đã tải lại dữ liệu mới. Vui lòng kiểm tra và bấm Thêm lại."; bấm "Thêm" lần 2 gửi `version` mới → thành công → sheet đóng + toast "Đã thêm dòng hàng." | component |
| AC-UI-062 | Bình ở đơn trên, dòng "Dây cáp mạng Cat6" do mình thêm; server trả 403 `LINE_NOT_EDITABLE` / 409 `STALE_VERSION` / 500 | bấm xoá dòng → "Xoá" | Dialog xác nhận vẫn mở, hiện `Alert` lỗi trong dialog (STALE: tải lại đơn ngầm + message như AC-UI-061); dòng vẫn còn trong danh sách nếu server chưa xoá. Thành công → dialog đóng + toast "Đã xoá dòng hàng." | component |
| AC-UI-063 | Hồi quy — với **mỗi modal có nút "Lưu"** (form tự gọi API: khách hàng, sản phẩm, dịch vụ, nhóm SP/DV, phòng ban, nhân sự, quà tặng, sửa liên hệ): mock endpoint lưu trả 422 / 409 / lỗi mạng | điền dữ liệu hợp lệ → bấm Lưu | Modal vẫn mở (`role="dialog"` còn trong DOM), giá trị đã nhập còn nguyên, có `Alert` trong dialog; mock trả 200 rồi bấm lại → modal đóng (riêng quà tặng: theo thiết kế ở lại để quản lý ảnh → toast "Đã cập nhật." + hết lỗi). Test dạng bảng (1 hàng/modal) để modal mới thêm sau này dễ bổ sung. *Sửa đổi khi review 2026-11-01:* các modal lệnh (Huỷ/Hoàn tất/Chỉnh sửa đơn, Huỷ/Mở lại đầu việc, Hoàn thành/Từ chối phân công, Tạo/Sửa đầu việc…) chỉ hiển thị lỗi do trang cha truyền vào — hành vi giữ mở được chứng minh ở test của trang cha (AC-DSP-024/061/124, AC-ASG-039) và 4 modal đã sửa (AC-UI-057…062), không nhân bản vào bảng này | component |
| AC-UI-064 | Bất kỳ modal nào đang gửi (request chưa trả về) | bấm Esc / nền tối / ✕ | Modal không đóng (giữ `dismissible={!loading}`); sau khi lỗi trả về, Esc/✕/"Huỷ" đóng được bình thường | component |
| AC-UI-065 | Hoa (SALE, có `customer.manage`) ở `/orders/new`, **đã thêm 1 dòng "Máy in Canon LBP2900"** (đơn nháp tạo ngầm) | "Thêm khách hàng" → loại **Cá nhân**, tên "Nguyễn Thị Lan", SĐT 0912345678 → Lưu | Modal đóng, toast "Đã thêm khách hàng Nguyễn Thị Lan.", ô "Tìm khách hàng" hiện "Nguyễn Thị Lan", dưới ô hiện SĐT; "Lưu nháp" enabled; bấm "Lưu nháp" → đơn lưu với `customer_id` của Lan (tải lại trang vẫn hiện Lan) | component + e2e |
| AC-UI-066 | Như AC-UI-065, loại **Công ty**: "Công ty TNHH Minh Phát", SĐT 02838123456, MST 0312345678 | Lưu | Như AC-UI-065 với tên công ty | e2e |
| AC-UI-067 | Hoa thêm khách, SĐT "0912" (sai định dạng) → server 422 | Lưu | Modal vẫn mở, lỗi dưới ô "Số điện thoại", dữ liệu khác giữ nguyên; ô "Tìm khách hàng" của đơn **không** đổi | component |
| AC-UI-068 | Đã có khách "Lê Văn Hùng" SĐT 0987654321; Hoa thêm khách mới cùng SĐT | Lưu | Khách mới được tạo và **đã được chọn** vào đơn; modal ở lại hiện cảnh báo trùng SĐT (AC-CUS-010); bấm "Đóng" → modal đóng, đơn vẫn chọn khách mới | component |
| AC-UI-069 | Màn hình 390px và 1440px, modal "Thêm khách hàng" dài (công ty) gặp lỗi 422 ở ô cuối form | Lưu | `Alert` lỗi chung nằm ngay trên hàng nút (footer cố định) hoặc thân modal tự cuộn tới ô lỗi đầu tiên — người dùng thấy lỗi không cần tự cuộn; vùng chạm nút ≥ 44px | e2e (screenshot 390/1440) |

## 4. API
Không đổi.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Lỗi luôn hiện **trong** modal bằng `Alert` (đỏ), không dùng toast cho lỗi khi modal còn mở. Toast chỉ cho thành công.
- `STALE_VERSION` ở dialog xác nhận lệnh (Gửi/Thu hồi): theo mẫu có sẵn của `CancelOrderSheet` — "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút "Tải lại" (ẩn nút xác nhận).
- `STALE_VERSION` ở form dòng hàng (thêm/xoá): tải lại đơn ngầm, giữ form, copy: "Đơn vừa được người khác cập nhật, đã tải lại dữ liệu mới. Vui lòng kiểm tra và bấm Thêm lại." (xoá: "… bấm Xoá lại.").
- Modal dài: lỗi chung đặt sát footer; lỗi theo ô → cuộn + focus ô lỗi đầu tiên (react-hook-form `setFocus`).
- Mobile (bottom sheet) và desktop (modal giữa) cùng hành vi.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Sale, `/orders/new`, thêm 1 dòng hàng, bấm "Thêm khách hàng" → chọn Công ty, nhập tên + SĐT → Lưu → ô tìm khách hiện đúng tên công ty, "Lưu nháp" bấm được.
2. Lặp lại với Cá nhân, cố tình nhập SĐT "0912" → modal không đóng, báo lỗi dưới ô SĐT; sửa đúng → Lưu → khách được chọn.
3. Mở đơn nháp đã có khách, ở tab khác gỡ khách rồi quay lại bấm "Gửi đơn" → dialog vẫn mở và báo cần khách hàng.
4. Đăng nhập KTV, ở đơn đã được phân công, mở "Thêm dòng hàng"; trong lúc đó QLKT gỡ KTV khỏi đầu việc → bấm Thêm → sheet vẫn mở, báo lỗi, dữ liệu còn nguyên.
5. Mở modal Thêm sản phẩm, tắt mạng, bấm Lưu → modal không đóng, báo "Không thực hiện được. Vui lòng thử lại."

## 8. Giả định & câu hỏi
- **Giả định A1 (đổi hành vi đã duyệt):** AC-ORD-062 (lỗi gửi đơn hiện banner ngoài trang), AC-ORD-240 (KTV lỗi → toast + đóng sheet) và STALE "tải lại rồi đóng" của M3-04b bị thay bằng quy tắc mới "giữ modal + lỗi trong modal". Khi implement sẽ ghi chú sửa đổi vào các spec đó.
- **Giả định A2:** `STALE_VERSION` cũng tính là "lỗi" → giữ modal (kèm "Tải lại" hoặc tải lại ngầm giữ form), không đóng.
- **Câu hỏi Q130:** Luồng "Thêm khách hàng → tự chọn khách" **đã có** từ M16-10 và test component đang xanh. Anh/chị có gặp trường hợp cụ thể nào thêm xong mà khách **không** được chọn không (khách cá nhân hay công ty? đã thêm dòng hàng trước chưa? có cảnh báo trùng SĐT không?) — Giả định: chưa rõ lỗi cụ thể → viết e2e trên stack thật cho cả 2 loại (AC-UI-065/066); nếu e2e đỏ thì sửa nguyên nhân tìm được, nếu xanh thì chỉ thêm test bảo vệ.
- Ước lượng diff: ~150–250 dòng code (không tính test), thuần frontend → không cần tách a/b.
