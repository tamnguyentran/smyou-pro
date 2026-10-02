# M4-01d — Component `Sheet`: header + footer ngoài vùng cuộn

- **Status:** Approved
- **Backlog:** M4-01d · **Milestone:** M4
- **Liên quan:** `docs/design/UI_GUIDELINES.md` §6 (hộp thoại = bottom sheet mobile / modal desktop), `reports/review-M4-01b.md` #4. Không đụng `spec/*.yaml`, không đổi API/DB/phân quyền.

## 1. Mục tiêu
Là người dùng trên điện thoại, khi mở một hộp thoại có form dài (vd. "Tạo đầu việc" với nhiều KTV), tôi muốn tiêu đề và hàng nút hành động luôn thấy được trong lúc nội dung cuộn, để không mất ngữ cảnh và không phải cuộn xuống đáy mới bấm được "Lưu".

## 2. Phạm vi
- Trong phạm vi: `components/ui/Sheet.tsx` đổi panel thành cột flex: **header** (tiêu đề + nút ✕) cố định, **body** `overflow-y-auto`, **footer** tuỳ chọn (prop mới `footer?: ReactNode`) dính đáy. Chuyển hàng nút của các màn đang dùng `Sheet` sang `footer` (nút submit dùng thuộc tính `form="<id>"` để vẫn submit form nằm trong body). `ConfirmDialog` dùng prop `footer`.
- Màn bị ảnh hưởng (10): `CustomerFormSheet`, `ProductFormSheet`, `ServiceFormSheet`, `EmployeeFormSheet`, `TaskCreateSheet`, `AddLineSheet`, `EditContactSheet`, `CancelOrderSheet`, `CatalogImportSheet`, `TemporaryPasswordDialog` (+ `ConfirmDialog` dùng chung ở nhiều nơi).
- Ngoài phạm vi: đổi copy/nghiệp vụ của bất kỳ màn nào; picker ngày giờ (finding #3 của review M4-01b); đánh bóng điều phối (M4-01e); animation mở/đóng.
- Hành vi giữ nguyên: focus trap, Esc, trả focus, `dismissible`, overlay click.

## 3. Acceptance Criteria
> Không có yếu tố vai trò/quyền: đây là component UI thuần, mọi vai trò thấy cùng hành vi (không có AC 403/404/409/422 — không đổi API).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-082 | `Sheet` title="Tạo đầu việc", body cao hơn khung nhìn (vd. 40 dòng), có `footer` | render, cuộn body xuống cuối | `role=dialog` chứa 3 vùng theo thứ tự header → body → footer; **chỉ body** có `overflow-y: auto`, panel không cuộn; header (`h2` + nút "Đóng hộp thoại") và footer vẫn nằm trong panel ngoài vùng cuộn | component |
| AC-SYS-083 | Như AC-SYS-082 trên viewport 390×844 (mobile) | mở sheet, cuộn body tới cuối | `h2` tiêu đề và nút footer đều **nằm trong khung nhìn** (bounding box trong 0..844); tổng chiều cao panel ≤ 85% viewport | e2e (mobile) |
| AC-SYS-084 | Như AC-SYS-082 trên viewport 1440×900 (desktop) | mở sheet | modal giữa màn hình, rộng ≤ `max-w-lg`; tiêu đề + footer thấy được khi body cuộn; chiều cao ≤ 85% viewport | e2e (desktop) |
| AC-SYS-085 | `Sheet` không truyền `footer`, body ngắn | render | không render vùng footer (không có thanh/viền trống); panel co theo nội dung | component |
| AC-SYS-086 | Form trong body (`<form id="f">`), nút "Lưu" trong `footer` có `form="f"` `type=submit` | bấm "Lưu" (và nhấn Enter trong ô nhập) | `onSubmit` của form chạy đúng 1 lần; hành vi submit giống trước khi tách | component |
| AC-SYS-087 | Sheet đang mở, `dismissible=false` (request đang chạy) | nhấn Esc / click overlay / ✕ | không đóng (✕ `disabled`); khi `dismissible=true` thì Esc/overlay/✕ đều gọi `onClose` — giữ nguyên hành vi cũ | component |
| AC-SYS-088 | Sheet mở, trong body có 3 ô nhập, footer có 2 nút | mở; Tab xuyên vòng; Shift+Tab từ phần tử đầu; Esc | focus ban đầu vào phần tử focusable đầu tiên (nút ✕ hoặc ô nhập như cũ); Tab/Shift+Tab xoay vòng qua cả nút trong **footer**; đóng thì focus trả về nút đã mở | component |
| AC-SYS-089 | Form "Tạo đầu việc" (ĐH2609-0001, nhiều KTV) trên mobile 390px, lỗi validate hiện ở đầu form khiến body cuộn | bấm "Tạo đầu việc" ở footer khi form lỗi | footer vẫn thấy; lỗi hiện trong body; sau khi nhập đủ, bấm lại → tạo task thành công như M4-01b (AC e2e dispatch hiện có vẫn xanh, không sửa assertion) | e2e (mobile) |
| AC-SYS-090 | 10 màn dùng `Sheet` + `ConfirmDialog` | chạy toàn bộ test component/e2e hiện có | tất cả xanh **không sửa assertion** (chỉ được sửa selector nếu DOM đổi, nêu rõ trong báo cáo); mỗi màn có `footer` nếu trước đó có hàng nút; `TemporaryPasswordDialog` giữ nút "Đóng" ở footer | component + e2e |
| AC-SYS-091 | `ConfirmDialog` với message ngắn (vd. "Huỷ đơn DH2609-0001?") | render | hai nút "Huỷ"/"Xác nhận" nằm trong footer, căn phải, vùng chạm ≥ 44px; trạng thái `loading` vẫn khoá đóng | component |
| AC-SYS-092 | `prefers-reduced-motion` hoặc trình duyệt iOS Safari (thanh địa chỉ thay đổi) — panel dùng `max-h-[85vh]` | mở sheet | không cuộn ngang trang (AC-SYS-003 vẫn đúng); không có nội dung bị cắt dưới footer (footer có `pb-[env(safe-area-inset-bottom)]`) | e2e (mobile, kiểm CSS) |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Cấu trúc panel: `flex flex-col max-h-[85vh]` → header `shrink-0` · body `min-h-0 flex-1 overflow-y-auto` · footer `shrink-0 border-t` (padding như cũ: `p-4`, `lg:p-6`).
- Footer: hàng nút `flex flex-col-reverse gap-3 sm:flex-row sm:justify-end` (nút chính nằm trên trên mobile), nút cao ≥ 44px — giữ copy hiện có của từng màn.
- Không đổi màu/token; chỉ thêm `border-t` token viền hiện có.
- Chụp lại ảnh 390px + 1440px cho: Tạo đầu việc (form dài), Thêm dòng hàng, Sửa liên hệ, Huỷ đơn, ConfirmDialog, Mật khẩu tạm, form nhân viên/sản phẩm/dịch vụ/khách hàng, nhập danh mục → `reports/screenshots/`.

## 7. Kịch bản UAT thủ công
1. Điện thoại (hoặc DevTools 390px): vào `/dispatch/queue`, mở "Tạo đầu việc" của một đơn, chọn nhiều KTV cho form dài → cuộn: tiêu đề phía trên và nút "Tạo đầu việc" phía dưới luôn thấy.
2. Mở "Thêm dòng hàng" ở đơn nháp → nút "Thêm" luôn thấy, bấm được mà không cuộn.
3. Desktop 1440px: mở form Nhân viên → modal giữa màn hình, tiêu đề + nút cố định khi cuộn.
4. Mở "Huỷ đơn" và "Mật khẩu tạm" → hiển thị gọn, nút "Đóng" đúng chỗ.
5. Nhấn Esc / Tab thử → vẫn đóng được, focus không thoát khỏi hộp thoại.

## 8. Giả định & câu hỏi
- Giả định (không cần hỏi, theo backlog): làm trong **một** item, không tách a/b — diff ước tính ~150–200 dòng non-test (Sheet ~30, 10 màn chuyển nút sang `footer` mỗi màn ~10–20) < 400.
- Giả định: nút submit trong footer dùng `form="<id>"` (chuẩn HTML) thay vì bọc cả Sheet bằng `<form>`, để không đổi cấu trúc state của từng form.
- Giả định: footer luôn có viền trên mảnh (`border-t`) để phân biệt với body đang cuộn.
- Giả định: thứ tự nút trên mobile giữ như hiện tại (không đảo vị trí nút chính) — nếu muốn "nút chính full-width" thì thuộc M4-01e.
- Câu hỏi mới: không (không phát sinh quy tắc nghiệp vụ nên không thêm dòng vào `OPEN_QUESTIONS.md`).
