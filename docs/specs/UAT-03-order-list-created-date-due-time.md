# UAT-03 — Danh sách đơn lọc theo ngày tạo, giờ mặc định khi chọn hạn từ lịch, giải thích tải ảnh xác nhận

- **Status:** Approved (chủ dự án chốt Q186–Q188, 2026-11-07)
- **Backlog:** UAT-03 · **Milestone:** UAT
- **Liên quan:** `docs/specs/M15-02b-customer-feedback-ui.md` (AC-CSK-010/012 — thay Q92), `docs/specs/M20-02-csat-unrated-filter.md` (AC-CSK-026), `docs/specs/M21-06a-vietnamese-date-field.md` (AC-UI-089), `docs/specs/M6-01-upload-confirmation-photo.md` (AC-CMP-012…014), `docs/product/OPEN_QUESTIONS.md` Q186–Q188

## 1. Mục tiêu
- Q186 (lỗi 1): người có vai trò CSKH (kể cả Quản lý kiêm CSKH) mở "Danh sách đơn" chỉ thấy đơn **đã hoàn tất** trong tháng, vì bộ lọc ngày mặc định lọc theo `completed_at` (Q92). Chủ dự án chốt: bộ lọc ngày của danh sách đơn lọc theo **ngày tạo đơn** → đơn ở mọi trạng thái đều hiện.
- Q187 (lỗi 2): form giao việc, ô "Hạn hoàn thành" đang trống → chọn ngày từ lịch chỉ điền `dd/MM/yyyy`, thiếu giờ → báo lỗi. Chốt: lịch của ô ngày-giờ phải chọn được **cả ngày lẫn giờ** (dữ liệu ô là ngày giờ) — khung lịch có ô Giờ/Phút + nút "Xong"; chưa có giờ thì bắt đầu từ **17:00**.
- Q188 (lỗi 3): KTV không thấy nút "Tải ảnh phiếu xác nhận". Tái hiện: nút hiện đúng khi đơn "Chờ KH xác nhận"; không hiện khi đơn còn đầu việc khác chưa xong (đơn "Đang thực hiện"/"Chỉnh sửa") — đúng quy tắc. Thêm dòng giải thích ở tab "Tệp đính kèm" cho trường hợp này.

## 2. Phạm vi
- Trong phạm vi:
  - `GET /orders?from&to` và `GET /orders/csat-summary?from&to` lọc theo `Order.created_at` (ngày VN) thay cho `completed_at` — cả hai cùng đổi để số trên ô sao khớp số dòng khi bấm (giữ AC-CSK-026). Ô thống kê vẫn chỉ đếm đơn `COMPLETED`.
  - `DateField mode="datetime"`: khung lịch có thêm ô chọn "Giờ" (00–23), "Phút" (bước 5 phút, kèm phút lẻ đã gõ) và nút "Xong"; bấm ngày không đóng khung. Chưa có giờ gõ đủ → ô giờ bắt đầu ở `17:00`; đã có giờ đủ → giữ nguyên (AC-UI-089). Vẫn gõ tay được như cũ.
  - Tab "Tệp đính kèm": đơn `IN_PROGRESS`/`REVISION` → dòng giải thích.
- Ngoài phạm vi: thẻ CSAT ở Tổng quan (dashboard, hàm riêng) không đổi; quy tắc ai/khi nào được tải ảnh, thêm dòng tại chỗ không đổi.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-ORD-275 | Đơn tạo trong 01–26/09/2026 ở mỗi trạng thái `DRAFT`, `PENDING_DISPATCH`, `IN_PROGRESS`, `AWAITING_CONFIRMATION`, `COMPLETED`, `REVISION`, `CANCELLED`; 1 đơn tạo 15/08 nhưng hoàn tất 15/09 | Lan `GET /orders?from=2026-09-01&to=2026-09-26` | Có đủ 7 đơn tạo trong khoảng; không có đơn tạo 15/08 | integration |
| AC-ORD-276 | Như trên, đơn `COMPLETED` tạo trong khoảng có 3★, đơn tạo 15/08 hoàn tất 15/09 có 3★ | Lan `GET /orders/csat-summary?from=2026-09-01&to=2026-09-26` và `GET /orders?...&csat_rating=3` | Ô `"3"` = 1 = số dòng danh sách (chỉ đơn tạo trong khoảng) | integration |
| AC-UI-108 | `mode="datetime"`, ô trống | mở lịch, chọn ngày 05 | Ô `05/11/2026 17:00`; `onChange("2026-11-05T17:00")` | component |
| AC-UI-109 | `mode="datetime"`, đã gõ `0411202614` (giờ chưa đủ) | mở lịch, chọn ngày 05 | Ô `05/11/2026 17:00`; `onChange("2026-11-05T17:00")` | component |
| AC-UI-110 | `mode="datetime"`, ô trống | mở lịch, chọn ngày 05, Giờ `09`, Phút `30`, bấm "Xong" | Lịch vẫn mở sau khi chọn ngày; ô `05/11/2026 09:30`, `onChange("2026-11-05T09:30")`; "Xong" đóng lịch | component |
| AC-UI-111 | `mode="datetime"`, ô trống (hôm nay 04/11/2026) / value `2026-11-04T14:37` | mở lịch | Ô trống: Giờ `17`, Phút `00`; chọn Giờ `08` trước khi chọn ngày → `04/11/2026 08:00`. Value 14:37: Giờ `14`, Phút `37` | component |
| AC-CMP-015 | Đơn `IN_PROGRESS` (hoặc `REVISION`) | mở tab "Tệp đính kèm" | Không có nút tải ảnh; có dòng "Tải được ảnh phiếu xác nhận khi mọi đầu việc của đơn đã hoàn thành (đơn chuyển sang \"Chờ KH xác nhận\")." | component |

## 4. API
Không thêm endpoint/tham số. Đổi nghĩa `from`/`to` của `GET /orders` và `GET /orders/csat-summary` (mô tả OpenAPI cập nhật).

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Khung lịch ngày-giờ thêm hàng Giờ/Phút/Xong (thay giả định A4 của M21-06a: "giờ chỉ chỉnh bằng gõ tay"). Copy mới: "Giờ", "Phút", "Xong", dòng giải thích ở AC-CMP-015.

## 7. Kịch bản UAT thủ công
1. Nam (Quản lý kiêm CSKH) mở "Danh sách đơn": thấy đơn tạo trong tháng ở mọi trạng thái; bấm từng chip trạng thái đều ra đơn tương ứng.
2. Toàn mở "Tạo đầu việc", ô "Hạn hoàn thành" trống → mở lịch, chọn ngày, chọn Giờ/Phút, bấm "Xong" → ô hiện `dd/MM/yyyy HH:mm`, lưu được.
3. Đơn 2 đầu việc, Quân xong việc của mình, Đạt chưa xong → Quân mở tab "Tệp đính kèm" thấy dòng giải thích; Đạt xong → Quân thấy nút "Tải ảnh phiếu xác nhận".

## 8. Giả định & câu hỏi
- Q186–Q188 đã chốt (xem `OPEN_QUESTIONS.md`).
