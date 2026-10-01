# M2-03b — Import danh mục từ CSV: giao diện

- **Status:** Approved
- **Backlog:** M2-03b · **Milestone:** M2
- **Liên quan:** `M2-03a-catalog-import-api.md` (API, capability `catalog.manage`, mã lỗi, giới hạn file — Q46–Q49); `M2-01b-products-ui.md` (mẫu Sheet, ConfirmDialog, Toast, Skeleton, ảnh nén phía client, không có route theo id); `M2-02-services.md` (trang Dịch vụ); UI_GUIDELINES §3–§6

## 1. Mục tiêu
Là Quản lý chung, tôi tải lên một file CSV sản phẩm hoặc dịch vụ, xem trước lỗi từng dòng, rồi xác nhận nhập, để bổ sung danh mục hàng loạt mà không phải gõ tay từng dòng.

## 2. Phạm vi
- **Trong phạm vi:** nút "Nhập từ CSV" trên trang `/catalog/products` và `/catalog/services` (chỉ Manager thấy, dùng `catalog.manage` như nút "Thêm"); Sheet 2 bước dùng chung 1 component (tham số hoá cột theo entity) gọi `POST .../import/preview` rồi `.../import/commit` của M2-03a; bảng xem trước hiện lỗi từng dòng theo `{field, code, message}`; nút "Xác nhận nhập" chỉ bật khi `invalid_count = 0`; tải file mẫu CSV tĩnh (đúng cột §4 của M2-03a) cho cả 2 entity.
- **Ngoài phạm vi (item này):**
  - Tải lên XLSX (Q47 — chưa làm ở M2-03a).
  - Sửa/xoá dòng lỗi trực tiếp trong bảng xem trước rồi nhập lại không cần tải file mới — người dùng sửa file gốc và tải lại (đơn giản hoá, nhất quán với API không cache preview).
  - Xem lịch sử các lần import trước.

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]. File mẫu như `M2-03a` §3 (`products_ok.csv` 3 dòng hợp lệ; biến thể dòng 2 `category=TIVI` sai; biến thể trùng `sku=MAYBO3551` đã có trong DB).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-046 | An trên `/catalog/products` (máy tính) | bấm "Nhập từ CSV" (icon `Upload`, cạnh nút "Thêm sản phẩm") | mở Sheet "Nhập sản phẩm từ CSV" bước 1: vùng kéo-thả/chọn file (`accept=".csv"`), liên kết "Tải file mẫu" (`products_template.csv`, đúng cột M2-03a §4), chú thích "Tối đa 500 dòng, 2MB, mã hoá UTF-8" | component + e2e |
| AC-CAT-047 | Sheet đang mở bước 1 | chọn `products_ok.csv` (3 dòng hợp lệ) | gọi `POST /products/import/preview`; hiện spinner "Đang xử lý…"; xong → bước 2 "Xem trước": bảng 3 dòng, mỗi dòng badge xanh "Hợp lệ", tổng kết "3/3 dòng hợp lệ"; nút "Xác nhận nhập" bật | component + e2e |
| AC-CAT-048 | Bước 2, file có dòng 2 `category=TIVI` | (tiếp AC-CAT-047 với file lỗi) | dòng 2 badge đỏ "Lỗi", ô `category` viền đỏ kèm chữ nhỏ dưới ô theo `message` server trả về; tổng kết "2/3 dòng hợp lệ · 1 dòng lỗi"; nút "Xác nhận nhập" **bị khoá** (disabled), có chú thích "Sửa file gốc và tải lại để nhập." | component |
| AC-CAT-049 | Bước 2, `invalid_count=0` (như AC-CAT-047) | bấm "Xác nhận nhập" | `ConfirmDialog`: "Nhập 3 sản phẩm mới vào danh mục?"; xác nhận → gọi `POST /products/import/commit` cùng file; 201 → Sheet đóng, toast "Đã nhập 3 sản phẩm."; danh sách sản phẩm tự tải lại, thấy `MAYBO9101`/`LCD9102`/`HOPMUC9103` | component + e2e |
| AC-CAT-050 | Bước 2 hợp lệ, nhưng giữa lúc xem trước và bấm xác nhận, người khác đã tạo `sku=MAYBO9101` | bấm "Xác nhận nhập" → xác nhận dialog | `commit` trả 422 `IMPORT_HAS_ERRORS`; Sheet **không đóng**, quay lại bước 2 với `rows` mới nhận (dòng `MAYBO9101` giờ báo lỗi `taken`); banner đỏ trên bảng: "File có dòng bị lỗi (có thể do dữ liệu vừa thay đổi). Kiểm tra lại bên dưới." | component |
| AC-CAT-051 | Bước 1 | chọn file `MAYBO3551.csv` (1 dòng, `sku` đã tồn tại trong DB) | preview: dòng 1 badge đỏ, ô `sku` báo "Mã hàng đã tồn tại."; tổng kết "0/1 dòng hợp lệ · 1 dòng lỗi" | component |
| AC-CAT-052 | Bước 1 | chọn file rỗng (chỉ header) / file thiếu cột `price` / file > 500 dòng / file không phải CSV / file > 2MB | server trả lần lượt `EMPTY_FILE`/`MISSING_COLUMNS`/`TOO_MANY_ROWS`/`INVALID_FILE`/`FILE_TOO_LARGE`; Sheet ở lại bước 1, banner đỏ tương ứng: "File không có dữ liệu.", "File thiếu cột: price.", "File có hơn 500 dòng, vui lòng chia nhỏ.", "File không đúng định dạng CSV.", "File vượt quá 2MB."; không chuyển sang bước 2 | component |
| AC-CAT-053 | Bước 1 | chọn file có phần mở rộng khác `.csv` (vd `.xlsx`, `.png`) | client chặn ngay, không gọi API: banner "Chỉ chấp nhận file .csv." | component |
| AC-CAT-054 | Bước 2 (đang xem trước, chưa xác nhận) | bấm "Chọn file khác" | quay lại bước 1, giữ Sheet mở, không mất trạng thái trang danh sách phía sau | component |
| AC-CAT-055 | Hoa (SALE) hoặc Tuấn (TECH_LEAD) | mở `/catalog/products` hoặc `/catalog/services` | không thấy nút "Nhập từ CSV" (chỉ `catalog.manage`, như nút "Thêm" ở M2-01b AC-CAT-017); component Sheet nhập không mount | component |
| AC-CAT-056 | An trên `/catalog/services` | bấm "Nhập từ CSV" → chọn file dịch vụ hợp lệ (2 dòng, cột theo M2-03a §4 Dịch vụ) | cùng luồng bước 1→2→xác nhận gọi `/services/import/preview` rồi `/services/import/commit`; toast "Đã nhập 2 dịch vụ."; liên kết "Tải file mẫu" tải `services_template.csv` (cột dịch vụ) | component + e2e |
| AC-CAT-057 | An trên điện thoại (390px), `/catalog/products` | bấm "Nhập từ CSV" | Sheet mở dạng bottom sheet full-height; bước 2 hiện danh sách thẻ xếp dọc (không bảng ngang) — mỗi thẻ: số dòng, tên/mã, badge trạng thái, lỗi liệt kê bên dưới nếu có; nút "Xác nhận nhập" dính đáy màn hình | component + e2e |
| AC-CAT-058 | Các màn trên, iPhone 13 + 1440px | E2E | axe 0 serious/critical; không cuộn ngang 360px; vùng chạm ≥ 44px; ảnh `catalog-import-preview.png`, `catalog-import-errors.png` | e2e |

## 4. API
Dùng API của M2-03a (`/api/v1/products/import/preview|commit`, `/api/v1/services/import/preview|commit`, capability `catalog.manage`). Không thêm endpoint mới.

## 5. Dữ liệu / Migration
Không có. Thêm 2 file tĩnh vào frontend: `public/templates/products_template.csv`, `public/templates/services_template.csv` (header đúng M2-03a §4, kèm 1 dòng ví dụ mẫu để người dùng biết định dạng).

## 6. UI
- Điểm vào: nút phụ "Nhập từ CSV" (icon `Upload`, variant outline) cạnh nút chính "Thêm sản phẩm"/"Thêm dịch vụ" trên trang danh sách — chỉ hiện khi có `catalog.manage` (giống điều kiện hiện nút "Thêm").
- Sheet 2 bước dùng chung 1 component `CatalogImportSheet` tham số hoá theo entity (`products` | `services`): tiêu đề, cột bảng xem trước, đường dẫn API, tên file mẫu khác nhau.
- **Bước 1 — Chọn file:** vùng thả file (dashed border, icon `FileUp`), nút "Chọn file", liên kết "Tải file mẫu", chú thích giới hạn; banner đỏ khi lỗi cấp file.
- **Bước 2 — Xem trước:** máy tính = bảng (STT, các cột dữ liệu chính, badge Hợp lệ/Lỗi, cột "Chi tiết lỗi"); điện thoại = thẻ. Thanh tổng kết trên cùng "x/y dòng hợp lệ". Nút "Chọn file khác" (quay lại bước 1) + "Xác nhận nhập" (disabled khi còn lỗi).
- `ConfirmDialog` trước khi gọi `commit`, theo mẫu M2-01b (bottom sheet trên điện thoại).
- Toast thành công: "Đã nhập N sản phẩm."/"Đã nhập N dịch vụ."; đóng Sheet, tự tải lại danh sách (không cần F5).
- Copy lỗi cấp file tiếng Việt: `EMPTY_FILE` → "File không có dữ liệu."; `MISSING_COLUMNS` → "File thiếu cột: {danh sách}."; `TOO_MANY_ROWS` → "File có hơn 500 dòng, vui lòng chia nhỏ."; `INVALID_FILE` → "File không đúng định dạng CSV."; `FILE_TOO_LARGE` → "File vượt quá 2MB."; `IMPORT_HAS_ERRORS` (ở bước xác nhận) → banner "File có dòng bị lỗi (có thể do dữ liệu vừa thay đổi). Kiểm tra lại bên dưới." rồi hiện lại bảng lỗi.
- Copy lỗi từng dòng lấy trực tiếp `message` server trả (đã tiếng Việt theo M2-03a/M2-01a).

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Đăng nhập Manager → "Danh mục" → "Sản phẩm" → "Nhập từ CSV" → tải file mẫu, sửa thêm 1 dòng cố ý sai `category` → chọn file đó.
2. Xem bước "Xem trước": thấy 1 dòng báo lỗi màu đỏ, nút "Xác nhận nhập" bị khoá.
3. Sửa lại dòng lỗi trong file, chọn lại ("Chọn file khác") → tất cả dòng xanh → "Xác nhận nhập" → xác nhận → thấy toast và sản phẩm mới trong danh sách.
4. Đăng nhập Sale ở cửa sổ khác, mở `/catalog/products` → xác nhận không thấy nút "Nhập từ CSV".

## 8. Giả định & câu hỏi
- Không dùng route riêng cho import (vd `/catalog/products/import`) — dùng Sheet mở từ trang danh sách, nhất quán với quyết định M2-01b ("app chưa có route theo id, dùng Sheet").
- **Giả định:** `commit` thất bại do `IMPORT_HAS_ERRORS` sau khi đã qua bước xem trước sạch (dữ liệu đổi giữa 2 lần gọi, AC-CAT-050) là trường hợp hiếm nhưng phải xử lý vì API M2-03a re-validate toàn bộ ở `commit`; UI hiện lại lỗi thay vì chỉ báo "có lỗi, thử lại" chung chung.
- **Câu hỏi mới — Q58 (đề xuất: không giới hạn thêm ở client, dựa hoàn toàn vào lỗi server)**: Ngoài kiểm tra phần mở rộng `.csv` (AC-CAT-053), có cần client tự đếm số dòng/kiểm dung lượng trước khi gọi `preview` để tránh gọi API thừa không? *Đề xuất:* không — file ≤2MB/500 dòng tải lên rất nhanh, kiểm tra kép làm phức tạp code mà lợi ích nhỏ; để server là nguồn sự thật duy nhất cho các giới hạn này (nhất quán quy tắc "không suy luận trạng thái ở frontend").
