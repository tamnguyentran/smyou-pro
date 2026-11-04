# M21-06a — Ô chọn ngày/tháng tiếng Việt dùng chung (`DateField`)

- **Status:** Approved
- **Backlog:** M21-06a · **Milestone:** M21
- **Liên quan:** `docs/design/UI_GUIDELINES.md` §Định dạng (Ngày `dd/MM/yyyy HH:mm`); `frontend/src/components/ui/NumberField.tsx` (mẫu "format khi gõ, giá trị trả ra chuẩn"); M21-01b, M21-02b (2 trang dùng `type="month"`). Không đổi API/quyền/DB.

## 1. Mục tiêu
Là người dùng (Manager, QLKT…), tôi muốn ô chọn tháng/ngày luôn hiện theo kiểu Việt Nam (`11/2026`, `04/11/2026`, `04/11/2026 14:30`) và lịch chọn bằng tiếng Việt, bất kể trình duyệt/điện thoại đang để ngôn ngữ gì — thay cho ô `type="month"` của trình duyệt (hiện "November 2026" trên máy tiếng Anh; Firefox/Safari cũ không có ô chọn tháng).

## 2. Phạm vi
- Trong phạm vi:
  - Component mới `frontend/src/components/ui/DateField.tsx`, chọn kiểu qua prop `mode`: `"month"` (hiện `MM/yyyy`), `"date"` (`dd/MM/yyyy`), `"datetime"` (`dd/MM/yyyy HH:mm`, có `withSeconds` → `dd/MM/yyyy HH:mm:ss`).
  - Gõ tay có tự chèn dấu phân cách (`/`, ` `, `:`) + nút mở bảng chọn (lịch tháng / lịch ngày) tiếng Việt.
  - Giá trị trả ra qua `onChange` **giữ đúng định dạng của ô native tương ứng** (như `NumberField`) để M21-06b thay thế không phải đổi logic gọi: month `yyyy-MM`, date `yyyy-MM-dd`, datetime `yyyy-MM-ddTHH:mm` (hoặc `…:ss`). Chưa gõ đủ/không hợp lệ → `""`.
  - Áp dụng cho 2 trang KPI: ô "Tháng" ở "Thiết lập doanh thu KPI" (`KpiTargetsPage`) và "Báo cáo KPI" (`KpiSalesFilters`).
- Ngoài phạm vi:
  - Thay các ô `type="date"`/`datetime-local` khác (báo cáo doanh thu, quà KH, nhật ký, bảng việc, khách hàng, nhân viên, đơn, tạo/sửa task) → **M21-06b**.
  - Ô "Đến tháng" trong "Copy sang tháng sau" (đang là `Select` danh sách tháng, không phải ô native) — giữ nguyên.
  - `min`/`max`, chọn khoảng ngày (range) — thêm ở 06b nếu cần.
  - Không thêm thư viện ngày (date-fns/dayjs/react-day-picker); tự xử lý bằng `Date` + chuỗi.

## 3. Acceptance Criteria
Ngày giả định "hôm nay" = 04/11/2026 (Asia/Ho_Chi_Minh).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-079 | `DateField mode="month" label="Tháng" value="2026-11"` | render | Ô có nhãn "Tháng", hiển thị `11/2026`; placeholder khi trống là `MM/yyyy` | component |
| AC-UI-080 | `mode="month"`, ô trống | gõ `112026` | Ô hiện `11/2026` (tự chèn `/` khi gõ); `onChange` được gọi với `"2026-11"`; trong lúc mới gõ `11` → `onChange("")` | component |
| AC-UI-081 | `mode="month"` | gõ `13/2026` rồi rời ô (blur) | Ô báo lỗi "Tháng không hợp lệ (MM/yyyy)." (`aria-invalid="true"`); `onChange("")`; ô vẫn giữ chữ đã gõ để sửa | component |
| AC-UI-082 | `mode="month"`, value `2026-11` | bấm nút lịch (icon `CalendarDays`, `aria-label="Chọn tháng"`) | Mở bảng chọn: tiêu đề "Năm 2026", nút "Năm trước"/"Năm sau", lưới 12 ô "Th1"…"Th12", ô Th11 được đánh dấu chọn (`aria-pressed="true"`) | component |
| AC-UI-083 | Bảng chọn tháng đang mở ở năm 2026 | bấm "Năm sau" rồi "Th1" | Bảng đóng; ô hiện `01/2027`; `onChange("2027-01")`; focus trả về nút lịch | component |
| AC-UI-084 | Bảng chọn đang mở | bấm `Esc` hoặc bấm ra ngoài | Bảng đóng, giá trị không đổi, `onChange` không được gọi | component |
| AC-UI-085 | `mode="date" label="Từ ngày" value="2026-11-04"` | render, bấm nút lịch (`aria-label="Chọn ngày"`) | Ô hiện `04/11/2026`; lịch tiêu đề "Tháng 11/2026", hàng thứ "T2 T3 T4 T5 T6 T7 CN" (tuần bắt đầu thứ Hai); ngày 1 rơi vào cột CN; ô ngày 4 đánh dấu chọn, ô "hôm nay" có viền | component |
| AC-UI-086 | `mode="date"`, ô trống | gõ `04112026`; rồi xoá, gõ `29022025` + blur | Lần 1: hiện `04/11/2026`, `onChange("2026-11-04")`. Lần 2: lỗi "Ngày không hợp lệ (dd/MM/yyyy)." (2025 không nhuận), `onChange("")` | component |
| AC-UI-087 | Lịch ngày đang mở ở Tháng 11/2026 | bấm "Tháng trước" rồi chọn ngày 31 | Ô hiện `31/10/2026`; `onChange("2026-10-31")` | component |
| AC-UI-088 | `mode="datetime"`, ô trống | gõ `041120261430` | Ô hiện `04/11/2026 14:30`; `onChange("2026-11-04T14:30")`. Với `withSeconds`: gõ `04112026143005` → `04/11/2026 14:30:05`, `onChange("2026-11-04T14:30:05")`. Gõ giờ `25:00` + blur → lỗi "Ngày giờ không hợp lệ (dd/MM/yyyy HH:mm)." | component |
| AC-UI-089 | `mode="datetime"`, value `2026-11-04T14:30` | mở lịch, chọn ngày 05 | Giữ nguyên giờ: ô `05/11/2026 14:30`, `onChange("2026-11-05T14:30")` (giờ chỉnh bằng gõ tay) | component |
| AC-UI-090 | Bất kỳ mode; props `error="…"`, `hint="…"`, `disabled` | render | Hiện lỗi/gợi ý giống `TextField` (cùng class, `aria-describedby`); `disabled` khoá cả ô và nút lịch. Ô + nút lịch cao ≥ 44px; ô ngày/tháng trong bảng chọn ≥ 44×44px | component |
| AC-UI-091 | Manager An mở `/settings/kpi-targets` (hôm nay 04/11/2026) | xem ô "Tháng" | Ô là `DateField mode="month"` hiện `11/2026` (không còn `input[type=month]`); gợi ý dưới ô "Tháng 11/2026" giữ nguyên; chọn Th12 trên bảng chọn → bảng chỉ tiêu tải lại với `month=2026-12`, về trang 1 | component + e2e |
| AC-UI-092 | Manager An mở "Báo cáo KPI" | chọn tháng `10/2026` bằng gõ tay | Gọi báo cáo với `month=2026-10`; gõ dở (`10/20`) không gọi API và không xoá bộ lọc đang dùng (giữ tháng cũ cho tới khi hợp lệ) | component |
| AC-UI-093 | Mobile 390px, trang "Thiết lập doanh thu KPI" | mở bảng chọn tháng | Bảng chọn nằm trọn trong màn hình (không cuộn ngang), lưới 3 cột; desktop 1440px lưới 4 cột, bảng neo dưới ô | e2e (mobile + desktop) |
| AC-UI-094 | Bất kỳ mode | bấm nút lịch để mở bảng chọn | Focus chuyển vào ô đang chọn (nếu có), không thì ô hôm nay, không thì ô đầu tiên của lưới; ô tháng/ngày hôm nay có `aria-current="date"`; Esc khi đang trong `Sheet` chỉ đóng bảng chọn, không đóng `Sheet` (bổ sung sau /review 2026-11-04) | component |

## 4. API
Không có thay đổi.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- `DateField` props: `label`, `mode`, `value` (chuỗi chuẩn như ô native), `onChange(value: string)`, `withSeconds?`, `hint?`, `error?`, `disabled?`, `required?`, `name?`, `id?`. Bố cục/nhãn/lỗi dùng chung style `TextField`.
- Ô nhập `inputMode="numeric"` (bàn phím số trên điện thoại); nút lịch bên phải trong ô, icon `CalendarDays` (lucide-react).
- Bảng chọn: popover `role="dialog"` có `aria-label` ("Chọn tháng"/"Chọn ngày"); mobile full chiều ngang ô (trừ gutter 16px), desktop neo dưới ô rộng ~320px.
- Copy: placeholder `MM/yyyy` · `dd/MM/yyyy` · `dd/MM/yyyy HH:mm`; nút "Năm trước"/"Năm sau", "Tháng trước"/"Tháng sau"; nhãn tháng "Th1…Th12"; lỗi "Tháng không hợp lệ (MM/yyyy).", "Ngày không hợp lệ (dd/MM/yyyy).", "Ngày giờ không hợp lệ (dd/MM/yyyy HH:mm)." (có giây: `HH:mm:ss`). Lỗi do `error` prop của trang gọi được ưu tiên hơn lỗi định dạng.
- `UI_GUIDELINES.md` §Định dạng thêm quy tắc: "Mọi ô nhập ngày/tháng dùng `DateField`, không dùng `type=date|month|datetime-local`" (06b hoàn tất phần thay thế).

## 7. Kịch bản UAT thủ công
1. Đổi ngôn ngữ trình duyệt sang English, mở "Thiết lập doanh thu KPI" → ô Tháng hiện `11/2026`.
2. Bấm icon lịch → chọn "Năm sau" → Th1 → ô thành `01/2027`, bảng tải lại.
3. Gõ tay `13/2026` rồi bấm ra ngoài → thấy lỗi tiếng Việt; sửa lại `12/2026` → bảng tải tháng 12.
4. Mở "Báo cáo KPI" trên điện thoại → bảng chọn tháng gọn trong màn hình, bấm dễ.

## 8. Giả định & câu hỏi
- Giả định A1: gợi ý "Tháng 11/2026" dưới ô ở 2 trang KPI **giữ nguyên** (dù trùng ý với ô) — để không đổi các test đã có (AC-KPI-047, AC-RPT liên quan).
- Giả định A2 (ảnh hưởng test đã commit): 2 test component đang kiểm `getByLabelText("Tháng")` `toHaveValue("2026-11")` và `fireEvent.change(..., "2026-12")` (`kpiTargets.test.tsx:192,309`, `kpiSales.test.tsx:181`) gắn với chi tiết của ô native. Sau thay đổi ô hiển thị `11/2026`, nên các dòng này phải đổi sang `toHaveValue("11/2026")` / gõ `122026` — **ý nghĩa AC không đổi** (vẫn kiểm tháng mặc định & đổi tháng). Đây là sửa test theo spec mới, không phải làm yếu test; cần chủ SP đồng ý khi duyệt spec.
- Giả định A3: tuần bắt đầu **thứ Hai** (T2…CN) theo thói quen VN; không có nút "Hôm nay" (đơn giản hoá) — chỉ đánh viền ngày hôm nay.
- Giả định A4: datetime trong 06a chỉ chỉnh giờ bằng gõ tay (không có bộ chọn giờ); đủ cho ô tạo/sửa task ở 06b.
- Không có câu hỏi nghiệp vụ mới (thuần UI, chủ SP đã chốt định dạng 2026-11-02) → không thêm dòng vào `OPEN_QUESTIONS.md`.
- Ước lượng: ~300 dòng code (component + 2 chỗ dùng) — không cần tách nhỏ thêm.
