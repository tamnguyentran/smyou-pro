# M2-03c — Import danh mục từ CSV: kiểm tra kích thước/số dòng ở client

- **Status:** Approved
- **Backlog:** M2-03c · **Milestone:** M2
- **Liên quan:** `M2-03b-catalog-import-ui.md` (đã Done — PR #43; AC-CAT-052 hiện test đường server cho `EMPTY_FILE`/`MISSING_COLUMNS`/`TOO_MANY_ROWS`/`INVALID_FILE`/`FILE_TOO_LARGE`); `M2-03a-catalog-import-api.md` (API, mã lỗi); Q58 (`docs/product/OPEN_QUESTIONS.md`)

## 1. Mục tiêu
Là Quản lý chung, khi tôi chọn nhầm file CSV quá lớn hoặc quá nhiều dòng, tôi muốn được báo ngay trên trình duyệt mà không phải chờ gọi server, để không tốn thời gian/băng thông cho một request chắc chắn sẽ bị từ chối.

## 2. Phạm vi
- **Trong phạm vi:** `CatalogImportSheet.tsx` (component dùng chung cho Products/Services, đã có ở M2-03b) tự kiểm `file.size > 2MB` và số dòng dữ liệu (đọc nội dung file, đếm dòng không tính header) `> 500` **trước khi** gọi `POST .../import/preview`; chặn ngay, không gọi API, hiện banner lỗi giống định dạng banner lỗi cấp file đã có.
- **Ngoài phạm vi:** đổi giới hạn (2MB/500 dòng vẫn như M2-03a); đổi hành vi server (`FILE_TOO_LARGE`/`TOO_MANY_ROWS` của M2-03a giữ nguyên làm lớp bảo vệ cuối, ví dụ khi số dòng đếm được ở client lệch với server do trường dữ liệu chứa newline trong ngoặc kép).

## 3. Acceptance Criteria
Kế thừa dữ liệu mẫu/tài khoản như `M2-03b` §3.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-059 | Bước 1 (Sheet nhập, Products hoặc Services) | chọn file `.csv` hợp lệ nhưng kích thước > 2MB | client chặn ngay bằng `file.size`, **không gọi** `preview`; banner đỏ "File vượt quá 2MB."; Sheet ở lại bước 1 | component |
| AC-CAT-060 | Bước 1 | chọn file `.csv` hợp lệ nhưng > 500 dòng dữ liệu (không tính header) | client đọc nội dung file (FileReader), đếm số dòng; nếu > 500 → chặn ngay, **không gọi** `preview`; banner đỏ "File có hơn 500 dòng, vui lòng chia nhỏ."; Sheet ở lại bước 1 | component |
| AC-CAT-061 | Bước 1 | chọn file `.csv` hợp lệ, ≤2MB, ≤500 dòng | luồng không đổi so với M2-03b — vẫn gọi `preview` bình thường (không regress) | component |

## 4. API
Không đổi — vẫn dùng API M2-03a, không thêm endpoint.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Thêm bước kiểm tra trong `CatalogImportSheet.tsx`, ngay sau khi người dùng chọn file (trước khi gọi `preview`): kiểm `.csv` (đã có, AC-CAT-053) → kiểm kích thước → kiểm số dòng → mới gọi `preview`.
- Đếm dòng: đọc file bằng `FileReader.readAsText`, tách theo `\n`, bỏ dòng trống cuối file, trừ 1 dòng header.
- Copy lỗi tái dùng đúng chữ đã có ở M2-03b §6 (`FILE_TOO_LARGE` → "File vượt quá 2MB."; `TOO_MANY_ROWS` → "File có hơn 500 dòng, vui lòng chia nhỏ.") — chỉ đổi nơi sinh ra lỗi (client thay vì chờ server), không đổi câu chữ hiển thị.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Đăng nhập Manager → "Danh mục" → "Sản phẩm" → "Nhập từ CSV" → chọn một file CSV > 2MB (vd ghép nhiều file mẫu lại).
2. Thấy banner đỏ "File vượt quá 2MB." ngay lập tức, không có spinner "Đang xử lý…" (chứng tỏ không gọi server).
3. Chọn file CSV hợp lệ, > 500 dòng → thấy banner "File có hơn 500 dòng, vui lòng chia nhỏ." ngay, không gọi server.
4. Chọn lại file mẫu bình thường (`products_ok.csv`) → luồng xem trước/xác nhận vẫn hoạt động như trước.

## 8. Giả định & câu hỏi
- Q58 đã quyết (xem `OPEN_QUESTIONS.md`): kiểm tra trước ở client. Không còn câu hỏi mở.
