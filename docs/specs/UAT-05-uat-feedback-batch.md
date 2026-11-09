# UAT-05 — Góp ý UAT 2026-11-09: modal quà tặng, tự đánh dấu đã đọc, về Tổng quan sau đăng nhập, tiềm năng chỉ từ KTV, tỷ lệ đạt dòng tổng KPI

- **Status:** Approved (chủ dự án yêu cầu 2026-11-09)
- **Backlog:** UAT-05 · **Milestone:** UAT
- **Liên quan:** M16-01b (AC-GFT-022…025), M7-01b (thông báo), M1 auth (AC-AUTH-021/023), M27-01a (AC-CUS-061/067/068, Q192 → thay bằng Q199), M21-02a/b (AC-RPT-080, 089…094)

## 1. Mục tiêu
Sửa 5 góp ý của chủ dự án sau UAT, trong một lần.

## 2. Phạm vi
1. **Ghi nhận quà tặng KH:** sheet Thêm/Sửa lưu thành công → toast rồi **tự đóng**; lỗi → báo lỗi, sheet **giữ nguyên** dữ liệu đã nhập để sửa. Ảnh quà tặng: thêm sau bằng cách mở lại bản ghi (sheet sửa).
2. **Thông báo:** thông báo chưa đọc nằm trong vùng nhìn thấy (≥ 50% diện tích) liên tục **3 giây** → tự đánh dấu đã đọc (`POST /notifications/{id}/read`, API có sẵn). Ra khỏi vùng nhìn trước 3 giây → huỷ đếm.
3. **Đăng nhập:** đăng nhập thành công luôn vào **Tổng quan** (`/`), bỏ chuyển tới trang đích `?next=`. Chưa đăng nhập mở link sâu → `/dang-nhap` (không kèm `next`). Phải đổi mật khẩu → vẫn `/doi-mat-khau` như cũ.
4. **Tiềm năng sử dụng dịch vụ** chỉ là ghi chú của KTV (Q199, thay Q192): ghi cuộc gọi CSKH **không** tạo `customer_potential_notes`. Bản ghi cũ từ cuộc gọi CSKH (`care_call_id` khác NULL) **không** hiện ở lịch sử tiềm năng của đơn và cột "Tiềm năng" của báo cáo Doanh thu theo KH (giữ trong DB, không xoá). "Ghi nhận yêu cầu của KH" vẫn lưu ở cuộc gọi.
5. **Báo cáo KPI doanh số:** dòng "Tổng cộng" có **Tỷ lệ đạt** = tổng doanh thu thuần ÷ tổng mục tiêu × 100, làm tròn 1 chữ số (ROUND_HALF_UP như từng dòng); tổng mục tiêu = 0 → trống ("—"). API thêm `totals.achievement_pct`.
- Ngoài phạm vi: file CSV KPI (không có dòng tổng), migration xoá dữ liệu.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-GFT-044 | Sheet "Thêm quà tặng" nhập đủ | bấm Lưu, server 201 | Toast "Đã thêm quà tặng.", sheet đóng, danh sách hiện bản ghi mới | component |
| AC-GFT-045 | Sheet "Sửa quà tặng" | bấm Lưu, server 200 | Toast "Đã cập nhật.", sheet đóng | component |
| AC-GFT-046 | Sheet Thêm/Sửa | bấm Lưu, server lỗi (422/409) | Hiện lỗi, sheet vẫn mở, giữ giá trị đã nhập | component |
| AC-NTF-054 | Thông báo chưa đọc trong vùng nhìn | đủ 3 giây | Gọi `POST /notifications/{id}/read` đúng 1 lần | component |
| AC-NTF-055 | Thông báo chưa đọc vào vùng nhìn / thông báo đã đọc | rời vùng nhìn trước 3 giây / ở trong vùng nhìn 3 giây | Không gọi API đánh dấu đã đọc | component |
| AC-AUTH-087 | Ở `/dang-nhap?next=/orders` | đăng nhập thành công | Vào `/` (Tổng quan) | component |
| AC-AUTH-088 | Chưa đăng nhập | mở `/orders` | Chuyển tới `/dang-nhap`, không có `next` | component |
| AC-CUS-086 | CSKH ghi cuộc gọi có yêu cầu của KH | `POST /customer-care-calls` | 201, cuộc gọi lưu `customer_request`; không thêm `customer_potential_notes` | integration |
| AC-CUS-087 | Khách có ghi chú tiềm năng cũ từ cuộc gọi CSKH (mới hơn ghi chú KTV) | xem lịch sử tiềm năng của đơn / báo cáo Doanh thu theo KH | Chỉ ghi chú KTV; cột tiềm năng = ghi chú KTV mới nhất | integration |
| AC-RPT-171 | Tổng doanh thu thuần 29.000.000, tổng mục tiêu 35.000.000 / tổng mục tiêu 0 | `GET /reports/kpi-sales` | `totals.achievement_pct` = 82.9 / `null` | integration |
| AC-RPT-172 | Báo cáo có `totals.achievement_pct` | xem bảng (desktop) và thẻ Tổng cộng (mobile) | Ô "Tỷ lệ đạt" dòng Tổng cộng hiện 82,9% (null → "—") | component |

## 4. API
- `GET /reports/kpi-sales`: `totals` thêm `achievement_pct: float | null`.
- `POST /customer-care-calls`: hành vi đổi (không ghi tiềm năng), schema không đổi.

## 5. Dữ liệu / Migration
Không có. Bản ghi tiềm năng cũ từ cuộc gọi CSKH được lọc khi đọc.

## 6. UI
Không thêm màn hình. Dòng Tổng cộng KPI có thêm ô Tỷ lệ đạt (desktop) / ô "Tỷ lệ đạt" trong thẻ Tổng cộng (mobile).

## 7. Kịch bản UAT thủ công
1. Quà tặng: thêm bản ghi đủ thông tin → toast, sheet đóng; sửa và để trống "Tên gói quà" hoặc gây lỗi server → sheet vẫn mở.
2. Thông báo: mở trang Thông báo có thông báo chưa đọc, chờ ~3 giây → chấm xanh biến mất, số chưa đọc giảm.
3. Đăng xuất, mở link `/orders`, đăng nhập → vào Tổng quan.
4. CSKH ghi cuộc gọi có yêu cầu → khối "Tiềm năng sử dụng dịch vụ" của đơn và báo cáo Doanh thu theo KH không đổi.
5. Báo cáo KPI doanh số → dòng Tổng cộng có Tỷ lệ đạt.

## 8. Giả định & câu hỏi
- Q199 (chốt 2026-11-09): tiềm năng chỉ từ KTV, thay Q192.
- Giả định: "trong view" = ≥ 50% hàng thông báo hiển thị; thông báo ở trang Thông báo (nơi duy nhất có danh sách).
