# M21-06b — Thay mọi ô ngày native bằng `DateField`

- **Status:** Approved (2026-11-04, chủ SP đồng ý A1–A4)
- **Backlog:** M21-06b · **Milestone:** M21
- **Liên quan:** `docs/specs/M21-06a-vietnamese-date-field.md` (component `DateField`, AC-UI-079…094); `docs/design/UI_GUIDELINES.md` §Định dạng. Không đổi API/quyền/DB.

## 1. Mục tiêu
Là người dùng (mọi vai trò), tôi muốn mọi ô nhập ngày / ngày-giờ trong ứng dụng hiện theo kiểu Việt Nam (`04/11/2026`, `04/11/2026 14:30`) và có lịch chọn tiếng Việt, giống ô "Tháng" ở trang KPI (M21-06a). Hiện các ô này vẫn là ô native của trình duyệt, nên trên máy để tiếng Anh sẽ hiện `11/04/2026` hoặc `mm/dd/yyyy`.

## 2. Phạm vi
- Trong phạm vi: thay 22 ô `type="date"` / `type="datetime-local"` ở 13 file:
  - **Bộ lọc (14 ô "Từ ngày"/"Đến ngày", `mode="date"`):** Danh sách đơn (`OrdersListPage`), Bảng việc (`TaskBoardFilters`), Nhật ký hệ thống (`AuditPage`), báo cáo Công việc theo nhân viên (`KpiFilters`), Doanh thu theo KH (`RevenueFilters`), Doanh thu theo NV (`EmployeeRevenueFilters`), Chi phí quà tặng KH (`CustomerGiftReportFilters`). Tổng 7 file, 14 ô.
  - **Form (6 ô `mode="date"` + 2 ô `mode="datetime"`):** Khách hàng: "Ngày thành lập", "Ngày sinh" (`CustomerFormSheet`). Quà tặng: "Ngày thực hiện" (`GiftFormSheet`). Đơn nháp: "Ngày hẹn" (`DraftOrderForm`). Nhân viên: "Ngày sinh", "Ngày cấp" (`EmployeeFormSheet`, có giới hạn không sau hôm nay). Task: "Hạn hoàn thành" ở tạo task (`TaskCreateSheet`) và sửa task (`TaskEditSheet`), `mode="datetime"`.
  - Thêm prop `max` (và `min` cho đối xứng) vào `DateField` cho mode `date`, vì 2 ô ở form Nhân sự đang dùng `max={today}`.
  - Test chặn tái phát: không còn `type="date|month|datetime-local"` trong `frontend/src` (ngoài file test).
- Ngoài phạm vi:
  - Chỗ *hiển thị* ngày (đã dùng `formatDate`, đã đúng kiểu VN).
  - Kiểm tra "Từ ngày ≤ Đến ngày", chọn khoảng ngày (range picker), bộ chọn giờ: giữ nguyên như hiện tại (A4 của 06a).
  - Đổi API / định dạng gửi lên server: giá trị `onChange` của `DateField` giữ đúng định dạng của ô native nên logic gọi API không đổi.

> Tổng sửa ước khoảng 15 file nguồn: 7 file bộ lọc, 6 file form, `DateField`, 1 test chặn tái phát. Ước ~220 dòng code (không tính test) nên không cần tách thêm.

## 3. Acceptance Criteria
Ngày giả định "hôm nay" = 04/11/2026 (Asia/Ho_Chi_Minh).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-095 | `DateField mode="date" max="2026-11-04"` | mở lịch ở Tháng 11/2026 | Ngày 05…30/11 bị khoá (`disabled`, không chọn được); ngày 04 chọn được; nút "Tháng sau" bị khoá | component |
| AC-UI-096 | `DateField mode="date" max="2026-11-04"` | gõ `05112026` rồi rời ô | Lỗi "Ngày không được sau 04/11/2026." (`aria-invalid="true"`); `onChange("")`. Tương tự `min="2026-01-01"`, gõ `31122025` → "Ngày không được trước 01/01/2026." | component |
| AC-UI-097 | Code nguồn `frontend/src` | chạy test tĩnh | Không file nguồn nào (trừ `*.test.*`) chứa `type="date"`, `type="month"` hoặc `type="datetime-local"`; test fail và chỉ ra file:dòng nếu có | unit |
| AC-UI-098 | Sale Bình mở Danh sách đơn | gõ "Từ ngày" `01102026`, "Đến ngày" `31102026` | Ô hiện `01/10/2026` – `31/10/2026`; danh sách gọi API với `from=2026-10-01`, `to=2026-10-31` (như trước); xoá hết chữ ô "Từ ngày" → bỏ lọc `from` | component + e2e |
| AC-UI-099 | Quản lý kỹ thuật Khoa mở Bảng việc | chọn "Từ ngày" 03/11/2026 bằng lịch | Ô hiện `03/11/2026`; bộ lọc `due_from=2026-11-03` được áp như trước | component |
| AC-UI-100 | Manager An mở Nhật ký hệ thống, Công việc theo nhân viên, Doanh thu theo KH, Doanh thu theo NV, Chi phí quà tặng KH | nhập "Từ ngày"/"Đến ngày" bằng gõ tay | Mỗi trang: ô là `DateField` (không còn `input[type=date]`), API nhận đúng `yyyy-MM-dd` như trước; liên kết/xuất CSV dùng cùng bộ lọc | component (mỗi trang ≥ 1 test) + e2e (Doanh thu theo KH, theo NV) |
| AC-UI-101 | Sale Bình sửa khách công ty "Công ty TNHH Minh Phát" | gõ "Ngày thành lập" `15032015`, Lưu | Gửi `founded_date="2015-03-15"`; mở lại form ô hiện `15/03/2015`. Khách cá nhân: "Ngày sinh" tương tự (`date_of_birth`) | component |
| AC-UI-102 | CSKH Hoa tạo ghi nhận quà tặng | chọn "Ngày thực hiện" 04/11/2026 bằng lịch, Lưu | Gửi `performed_date="2026-11-04"`; lỗi bắt buộc / lỗi server (`serverErrors.performed_date`) vẫn hiện dưới ô như trước | component |
| AC-UI-103 | Sale Bình tạo đơn nháp | gõ "Ngày hẹn" `10112026`, Lưu nháp | Gửi `requested_date="2026-11-10"`; sửa lại đơn nháp → ô hiện `10/11/2026` | component + e2e |
| AC-UI-104 | Manager An thêm nhân viên | gõ "Ngày sinh" `05112026` (sau hôm nay) rồi rời ô; sau đó gõ `20051995` | Lần 1: lỗi "Ngày không được sau 04/11/2026.", không gửi được ngày đó; lần 2: gửi `birth_date="1995-05-20"`. "Ngày cấp" tương tự (`id_issued_date`, `max` = hôm nay) | component + e2e |
| AC-UI-105 | QLKT Khoa tạo task cho đơn DH2611-0003 | gõ "Hạn hoàn thành" `051120261700` | Ô hiện `05/11/2026 17:00`; gửi `due_at` = `2026-11-05T17:00:00+07:00` (qua `toOffsetIso`, như trước) | component + e2e |
| AC-UI-106 | Task có `due_at=2026-11-05T10:00:00Z`; QLKT Khoa mở "Sửa task" | xem ô; đổi ngày bằng lịch sang 06 | Ô hiện `05/11/2026 17:00` (giờ VN); sau khi chọn → `06/11/2026 17:00`, Lưu gửi `2026-11-06T17:00:00+07:00`. Người không có quyền quản lý (`canManage=false`) thấy ô + nút lịch bị khoá | component |
| AC-UI-107 | Mobile 390px: Danh sách đơn, Bảng việc, form Nhân viên | mở lịch ở ô "Từ ngày" / "Ngày sinh" | Lịch nằm trọn màn hình, không cuộn ngang; bố cục dòng bộ lọc theo M16-09 giữ nguyên ở 390/768/1440px | e2e (mobile + desktop) |

## 4. API
Không có thay đổi.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Bộ lọc: `<DateField mode="date" label="Từ ngày" value={filters.from} onChange={(v) => set("from", v)} />`, giữ nguyên nhãn, thứ tự, lưới.
- Form react-hook-form: bọc bằng `Controller` (vì `DateField` là controlled), giữ `error` từ `formState.errors` / `serverErrors`, `disabled` như cũ.
- `DateField` thêm `min?`, `max?` (chuỗi `yyyy-MM-dd`, chỉ áp cho `mode="date"`). Ngoài khoảng: ô ngày trong lịch `disabled`, nút "Tháng trước/sau" khoá nếu cả tháng nằm ngoài khoảng; gõ tay thì báo lỗi.
- Copy lỗi mới: "Ngày không được sau {dd/MM/yyyy}." · "Ngày không được trước {dd/MM/yyyy}."
- `UI_GUIDELINES.md` §Định dạng: quy tắc "Mọi ô nhập ngày/tháng dùng `DateField`" chuyển từ "06b hoàn tất" thành "đã áp dụng; test AC-UI-097 chặn tái phát".

## 7. Kịch bản UAT thủ công
1. Đổi ngôn ngữ trình duyệt sang English, mở Danh sách đơn, gõ Từ ngày `01102026`: ô hiện `01/10/2026`, danh sách lọc đúng.
2. Mở "Thêm nhân viên", gõ Ngày sinh là ngày mai: thấy lỗi tiếng Việt; bấm lịch thì thấy ngày mai bị mờ.
3. Tạo task, gõ Hạn hoàn thành `05/11/2026 17:00`, lưu, mở lại "Sửa task": thấy đúng giờ đó.
4. Trên điện thoại, mở Bảng việc, bấm lịch ở "Từ ngày": lịch gọn trong màn hình.

## 8. Giả định & câu hỏi
- **A1 (ảnh hưởng test đã commit):** khoảng 37 dòng test component (17 file) và 25 dòng e2e (6 file) đang gõ ô ngày bằng `yyyy-MM-dd` / `fireEvent.change(..., "2026-10-01")` hoặc kiểm `toHaveValue("2026-…")`. Sau thay đổi, ô hiển thị `dd/MM/yyyy`, nên các dòng này phải đổi sang gõ/kiểm `01/10/2026`. **Ý nghĩa AC của các test đó không đổi** (vẫn kiểm cùng ngày, cùng tham số API); chỉ đổi cách nhập. Giống A2 của 06a, cần chủ SP đồng ý khi duyệt.
- **A2:** Bộ lọc khi đang gõ dở (`01/1`): `DateField` báo `""` thì bộ lọc ngày đó tạm bỏ, giống ô native hiện nay (ô native cũng trả `""` khi chưa đủ ngày). Không làm kiểu "giữ giá trị cũ" như ô Tháng KPI, vì ô ngày trong bộ lọc được phép để trống.
- **A3:** Form: gõ dở hoặc sai rồi bấm Lưu thì trường đó coi như trống, giống ô native. Trường bắt buộc sẽ hiện lỗi bắt buộc của form; trường tuỳ chọn có lỗi định dạng hiện ngay khi rời ô. Không thêm chặn submit riêng.
- **A4:** `max` = hôm nay (giờ VN) chỉ áp cho 2 ô đang có `max` ở form Nhân sự. Không tự thêm giới hạn cho ô khác (vd. ngày sinh khách hàng, ngày thành lập), vì đó là quy tắc nghiệp vụ chưa có.
- Không có câu hỏi nghiệp vụ mới nên không thêm dòng vào `OPEN_QUESTIONS.md`.
