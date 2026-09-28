# M2-03a — Import danh mục từ CSV: API

- **Status:** Approved
- **Backlog:** M2-03a · **Milestone:** M2
- **Liên quan:** DOMAIN_MODEL §2 (Product), §3 (Service); `spec/permissions.yaml` (`catalog.manage`: MANAGER all — như tạo tay); M2-01a (mẫu `ProductCreate`, lỗi 409 `sku`/422 field), M2-02 (mẫu `ServiceCreate`); OPEN_QUESTIONS Q15 (import CSV/XLSX)

## 1. Mục tiêu
Là Quản lý chung, tôi nhập nhiều sản phẩm/dịch vụ cùng lúc từ file CSV (xem trước lỗi từng dòng trước khi ghi), để không phải gõ tay từng dòng khi nhập danh mục ban đầu hoặc bổ sung hàng loạt.

## 2. Phạm vi
- **Trong phạm vi (M2-03a — API):** import CSV cho **Sản phẩm** và **Dịch vụ** (2 cặp endpoint riêng, cùng cơ chế 2 bước: xem trước → xác nhận); mỗi dòng validate như tạo tay (`ProductCreate`/`ServiceCreate`); báo lỗi theo từng dòng (số dòng + trường + mã lỗi); **không import nửa chừng** — nếu còn bất kỳ dòng lỗi nào, không ghi dòng nào vào DB.
- **Ngoài phạm vi (item này):**
  - Giao diện tải file/xem trước/xác nhận → `M2-03b` (chưa viết spec).
  - **XLSX**: cần thêm thư viện phân tích Excel (`openpyxl` — không có trong ARCHITECTURE §2 stack hiện tại, cần ADR nếu thêm). Item này chỉ làm **CSV** (dùng module `csv` chuẩn của Python, không thêm dependency). Xem Q47.
  - Cập nhật bản ghi đã tồn tại qua import (upsert) — mã trùng với bản ghi đã có → báo lỗi dòng đó, không tự sửa. Xem Q48.
  - Tải file mẫu (template) — để `M2-03b` cung cấp file tĩnh, không cần API riêng.
  - Import Khách hàng/Đơn hàng — ngoài milestone M2 (chỉ danh mục).

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]. Sản phẩm đã có sẵn trong DB: `MAYBO3551`. Dịch vụ đã có sẵn: `DV-BOMMUC`.

File CSV sản phẩm hợp lệ mẫu (`products_ok.csv`, 3 dòng, header đúng §4):
```
sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs
MAYBO9101,PC SMYOU CORE I3-12100,PC,SMYOU,BO,8500000,8,true,24,I3-12100/8GB/SSD 256GB
LCD9102,Màn hình Dell 24 inch,MONITOR,Dell,CAI,3200000,8,false,12,
HOPMUC9103,Hộp mực Canon 325,PRINTER_SUPPLY,Canon,HOP,650000,8,true,,
```

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-033 | An; `products_ok.csv` ở trên | `POST /products/import/preview` multipart file | 200 `{total:3, valid_count:3, invalid_count:0, rows:[{line, data, errors:null} ×3]}`; **không** có sản phẩm mới nào trong DB (`GET /products?q=MAYBO9101` → `total:0`) | integration |
| AC-CAT-034 | An; file như trên nhưng dòng 2 có `category=TIVI` (không thuộc enum §2) | `POST /products/import/preview` | 200; `invalid_count:1`, `valid_count:2`; `rows[1].errors == [{field:"category", code:"invalid_enum", message:"..."}]`; `rows[0].errors` và `rows[2].errors` đều `null`; không ghi DB | integration |
| AC-CAT-035 | An; file như AC-CAT-034 (1 dòng lỗi) | `POST /products/import/commit` cùng file | 422 `IMPORT_HAS_ERRORS`, body có `rows` giống preview (dòng lỗi kèm chi tiết); **0 sản phẩm được tạo** — kể cả 2 dòng hợp lệ (`GET /products?q=MAYBO9101` → `total:0`) | integration |
| AC-CAT-036 | An; `products_ok.csv` (3 dòng hợp lệ) | `POST /products/import/commit` | 201 `{created:3}`; `GET /products` thấy đủ `MAYBO9101`/`LCD9102`/`HOPMUC9103`, `is_active=true`, `version=1`; mỗi sản phẩm có đúng 1 `audit_event` (`entity_type=PRODUCT`, `action=create`) cùng `request_id` | integration |
| AC-CAT-037 | An; file 2 dòng cùng `sku=MAYBO9101` | `POST /products/import/preview` | 200; dòng 2 có lỗi `{field:"sku", code:"duplicate_in_file", message:"..."}`; dòng 1 `errors:null` (dòng 1 tự nó hợp lệ, lỗi chỉ nêu ở dòng gây trùng) | integration |
| AC-CAT-038 | An; file 1 dòng `sku=MAYBO3551` (đã tồn tại trong DB) | `POST /products/import/preview` rồi `commit` | preview: dòng có lỗi `{field:"sku", code:"taken", message:"..."}` (như 409 khi tạo tay, nhưng nằm trong `errors` vì đây là kết quả xem trước, không phải lỗi request); commit: 422 `IMPORT_HAS_ERRORS`, không tạo gì | integration |
| AC-CAT-039 | An; file chỉ có dòng header, không có dòng dữ liệu | `POST /products/import/preview` | 422 `EMPTY_FILE` (lỗi cấp file, không phải per-row) | integration |
| AC-CAT-040 | An; file thiếu cột `price` | `POST /products/import/preview` | 422 `MISSING_COLUMNS`, `detail` liệt kê cột thiếu (`price`) | integration |
| AC-CAT-041 | An; file 501 dòng dữ liệu hợp lệ | `POST /products/import/preview` | 422 `TOO_MANY_ROWS` (giới hạn 500 dòng/lần) | integration |
| AC-CAT-042 | An; file không phải CSV hợp lệ (nhị phân ngẫu nhiên) / file 3MB | `POST /products/import/preview` | lần lượt 422 `INVALID_FILE` / 422 `FILE_TOO_LARGE` (giới hạn 2MB) | integration |
| AC-CAT-043 | Hoa (SALE) hoặc Tuấn (TECH_LEAD) | `POST /products/import/preview` hoặc `/commit` với file hợp lệ | 403 `FORBIDDEN` (chỉ `catalog.manage`); không ghi DB | integration |
| AC-CAT-044 | An; file CSV dịch vụ hợp lệ 2 dòng (header `code,name,category,unit,price,vat_rate,price_fixed,default_estimated_hours,description`) và 1 dòng có `code=DV-BOMMUC` (đã tồn tại) | `POST /services/import/preview` rồi với file chỉ 2 dòng hợp lệ → `POST /services/import/commit` | preview: dòng trùng `DV-BOMMUC` báo lỗi `taken` như AC-CAT-038; commit (file 2 dòng hợp lệ): 201 `{created:2}`, mỗi dịch vụ có 1 `audit_event action=create` — cùng cơ chế preview/commit/all-or-nothing như Sản phẩm | integration |
| AC-CAT-045 | — | mọi route trên (`/products/import/*`, `/services/import/*`) | khai đúng 1 capability `catalog.manage`; nằm trong ma trận RBAC route thật | generated |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| POST | /api/v1/products/import/preview | catalog.manage | multipart file (`text/csv`, ≤2MB, ≤500 dòng dữ liệu) | 200 `ImportPreview` | 422 (lỗi cấp file: `EMPTY_FILE`, `MISSING_COLUMNS`, `TOO_MANY_ROWS`, `INVALID_FILE`, `FILE_TOO_LARGE`) |
| POST | /api/v1/products/import/commit | catalog.manage | multipart file (như trên) | 201 `{created: int}` | 422 (như trên, hoặc `IMPORT_HAS_ERRORS` nếu còn dòng lỗi khi re-validate) |
| POST | /api/v1/services/import/preview | catalog.manage | multipart file (như trên) | 200 `ImportPreview` | như trên |
| POST | /api/v1/services/import/commit | catalog.manage | multipart file (như trên) | 201 `{created: int}` | như trên |

`ImportPreview = {total: int, valid_count: int, invalid_count: int, rows: [{line: int, data: object, errors: [{field, code, message}] | null}]}`. `commit` **luôn re-validate toàn bộ file** ngay tại thời điểm ghi (không dùng lại kết quả `preview` trước đó qua token — tránh lệch dữ liệu nếu DB đổi giữa 2 lần gọi); nếu `invalid_count > 0` sau re-validate → 422 `IMPORT_HAS_ERRORS` kèm `rows` giống `ImportPreview`, không ghi dòng nào. Cột file — Sản phẩm: `sku,name,category,brand,unit,price,vat_rate,price_fixed,warranty_months,specs` (bắt buộc: `sku,name,category,unit,price`; còn lại để trống nếu không có, `vat_rate` mặc định 8, `price_fixed` mặc định `false`). Dịch vụ: `code,name,category,unit,price,vat_rate,price_fixed,default_estimated_hours,description` (bắt buộc: `code,name,category,unit,price`). Giá trị enum (`category`, `unit`) phải khớp chính xác (viết hoa) như DOMAIN_MODEL §2/§3 — không tự chuẩn hoá/suy luận. `price_fixed` nhận `true`/`false` (không phân biệt hoa/thường); để trống = `false`.

## 5. Dữ liệu / Migration
Không có bảng mới. Dùng lại `products`/`services`/`audit_events` hiện có; mỗi dòng import thành công gọi cùng logic tạo (`create_product`/`create_service`) trong **1 transaction DB cho toàn bộ file** (rollback hết nếu có lỗi ở bất kỳ dòng nào khi ghi).

## 7. Kịch bản UAT thủ công (API — giao diện ở M2-03b)
1. `make up`; đăng nhập Manager, mở `/smyoutask/api/docs` (dev) → `POST /products/import/preview` với file CSV 3 dòng (1 dòng cố ý sai `category`) → thấy `invalid_count:1`.
2. Sửa file cho đúng → `POST /products/import/preview` lại → `invalid_count:0` → `POST /products/import/commit` → `created:3`.
3. Thử `commit` file có `sku` trùng sản phẩm đã tạo ở bước 2 → 422 `IMPORT_HAS_ERRORS`, không tạo thêm gì.

## 8. Giả định & câu hỏi
- Tham chiếu **Q15 ✅**: có import CSV/XLSX — item này làm phần CSV trước (xem Q47).
- **Câu hỏi mới — Q46 (đề xuất: cả Sản phẩm và Dịch vụ, 2 endpoint riêng)**: Import áp dụng cho Sản phẩm, Dịch vụ, hay cả hai? *Đề xuất:* cả hai, giữ nhất quán với việc 2 bảng đã tách từ M2-01/M2-02.
- **Câu hỏi mới — Q47 (đề xuất: chỉ CSV ở M2-03a)**: Backlog ghi "CSV/XLSX" nhưng XLSX cần thêm thư viện (`openpyxl`) không có trong ARCHITECTURE §2 (cần ADR nếu thêm). *Đề xuất:* M2-03a chỉ làm CSV (module chuẩn, không thêm dependency); XLSX để sau (item riêng + ADR) nếu chủ dự án thực sự cần — CSV mở được bằng Excel/Google Sheets nên đủ dùng cho nhập ban đầu.
- **Câu hỏi mới — Q48 (đề xuất: chỉ tạo mới, không upsert)**: Mã trùng với bản ghi đã tồn tại (kể cả đã ngừng kinh doanh) thì báo lỗi hay tự cập nhật? *Đề xuất:* báo lỗi (`taken`), không tự sửa — tránh ghi đè giá/thông tin ngoài ý muốn khi nhập lại file cũ.
- **Câu hỏi mới — Q49 (đề xuất: ≤500 dòng, ≤2MB, UTF-8, phân tách phẩy)**: Giới hạn file. *Đề xuất:* như trên — đủ cho nhập ban đầu, tránh transaction lớn khoá bảng lâu.
- Giả định kỹ thuật: `commit` re-validate toàn bộ thay vì cache kết quả `preview` (đơn giản, tránh lệch dữ liệu — đổi lại người dùng phải gửi lại file ở bước xác nhận, chấp nhận được vì tần suất dùng thấp); lỗi mỗi dòng dùng cùng cấu trúc `{field, code, message}` như lỗi 422 tạo tay (M2-01a/M2-02) để tái dùng logic hiển thị ở FE.
