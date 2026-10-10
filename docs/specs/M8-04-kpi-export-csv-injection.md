# M8-04 — Chặn CSV formula injection trong `GET /kpi/report/export`

- **Status:** Done
- **Backlog:** M8-04 · **Milestone:** M8
- **Liên quan:** spec/permissions.yaml#kpi.read, docs/specs/M8-01a-kpi-report-api.md, `reports/review-M8-01b.md` (phát hiện gốc, Low, security-auditor)

## 1. Mục tiêu
Là người mở file CSV xuất từ báo cáo KPI (QLKT/Manager), tôi muốn ô nào bắt đầu bằng `=`/`+`/`-`/`@` được vô hiệu hoá trước khi ghi ra, để Excel/Sheets không tự chạy nó như công thức khi tôi mở file.

## 2. Phạm vi
- Trong phạm vi: escape các cột text do người dùng đặt (`employee_full_name`, `employee_code`) trong `build_csv` (`backend/app/modules/kpi/service.py`) bằng cách thêm `'` (dấu nháy đơn) trước giá trị nếu ký tự đầu thuộc `=+-@`.
- Ngoài phạm vi: không đổi format số liệu, không đổi `_CSV_HEADER`, không đổi route/capability, không retroactive sửa dữ liệu `full_name` đã lưu.

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-KPI-027 | Employee có `full_name = "=1+1"` (MANAGER đặt tên này qua `PATCH /employees/{id}`), có 1 task hoàn tất trong khoảng báo cáo | MANAGER gọi `GET /kpi/report/export?from=...&to=...` | 200; nội dung CSV ở cột "Họ tên" của dòng tương ứng là `'=1+1` (có dấu `'` đứng trước), không phải `=1+1` thô | unit |
| AC-KPI-028 | Employee có `employee_code` hoặc `full_name` bắt đầu bằng `+`, `-`, hoặc `@` (3 case) | export CSV | mỗi ô tương ứng được thêm tiền tố `'` | unit |
| AC-KPI-029 | Employee có `full_name = "Nguyễn Văn A"` (không bắt đầu bằng ký tự nguy hiểm) | export CSV | ô "Họ tên" giữ nguyên `Nguyễn Văn A`, không thêm `'` | unit |
| AC-KPI-030 | Dữ liệu seed thực tế (tên tiếng Việt thường, `employee_code` dạng `NVxxx`) | MANAGER export CSV qua `GET /kpi/report/export` | 200; response vẫn đúng `Content-Disposition`/`media_type` như trước; không có cột nào bị escape (regression của M8-01a) | integration |

## 4. API
Không đổi. Vẫn `GET /api/v1/kpi/report/export`, capability `kpi.read`, request/response giữ nguyên theo M8-01a — chỉ đổi nội dung `build_csv`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Không đổi — không có màn hình nào bị ảnh hưởng (chỉ nội dung file CSV xuất ra).

## 7. Kịch bản UAT thủ công
1. Trong trang Nhân sự, đổi `full_name` của 1 KTV thành `=1+1`.
2. Vào `/reports/kpi`, chọn khoảng ngày có task của KTV đó, bấm "Xuất CSV".
3. Mở file bằng Excel/Google Sheets: cột "Họ tên" hiện chữ `=1+1` dạng text (có thể thấy dấu `'` ở đầu khi click vào ô), không bị tính như công thức.

## 8. Giả định & câu hỏi
- Giả định: chỉ `employee_code`/`employee_full_name` là cột có nguồn text tự do do người dùng nhập; các cột còn lại là số (int/Decimal) nên không cần escape. Không có câu hỏi mới — cách sửa đã được review đề xuất sẵn ("thêm `'` trước ô bắt đầu bằng `=+-@`").
- Không cần sửa `spec/*.yaml` — capability/permission không đổi.
