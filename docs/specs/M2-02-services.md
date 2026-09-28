# M2-02 — Danh mục dịch vụ

- **Status:** Approved
- **Backlog:** M2-02 · **Milestone:** M2
- **Liên quan:** DOMAIN_MODEL §3 (Service); `spec/permissions.yaml` (`catalog.read`: MANAGER/SALE/TECH_LEAD all; `catalog.manage`: MANAGER all; menu `catalog.services` đã khai báo sẵn, icon `Hammer`, path `/catalog/services`); M2-01a/M2-01b (mẫu CRUD danh mục — module `catalog`, cùng khuôn, tái dùng phần lớn code)

## 1. Mục tiêu
Là Quản lý chung, tôi tạo/sửa/tìm dịch vụ trong danh mục (giá, VAT, số giờ ước tính gợi ý), để Nhân viên kinh doanh chọn dịch vụ khi tạo đơn (M3) và Quản lý kỹ thuật dùng `default_estimated_hours` làm gợi ý khi tạo task (M4).

## 2. Phạm vi
Một item duy nhất, gộp API + giao diện (không tách a/b như M2-01): dịch vụ **không có ảnh/`attachments`** (DOMAIN_MODEL §3 không có `image_attachment_id`), nên không có phần upload/nén ảnh — phần lớn khác biệt so với M2-01 là ở đó. Ước lượng còn lại (bảng `services`, CRUD, danh sách/lọc/tìm, form, ngừng/mở kinh doanh) nhỏ hơn nhiều so với M2-01a+b (~106 dòng spec, không tính upload ảnh), nên giữ 1 item theo đúng backlog.
- **Trong phạm vi:** bảng `services`; API danh sách/tìm/lọc, chi tiết, tạo, sửa, ngừng/mở kinh doanh; trang Danh mục dịch vụ (`/catalog/services`) — danh sách, form tạo/sửa, ngừng/mở kinh doanh; chỉ đọc cho Sale/Quản lý kỹ thuật.
- **Ngoài phạm vi:** xoá vĩnh viễn (không bao giờ — chỉ "ngừng kinh doanh"); ảnh minh hoạ dịch vụ (không có trong DOMAIN_MODEL §3); import CSV/XLSX (M2-03); dùng `default_estimated_hours` khi tạo task (M4-01).

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN]. Dịch vụ mẫu: `DV-BOMMUC` "Bơm mực máy in" [REFILL], `DV-LAPCAM` "Công đi dây + lắp đặt hệ thống camera" [NETWORK_CABLING], `DV-SUAPC` "Sửa chữa PC" [REPAIR].

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CAT-019 | 3 dịch vụ trên, `DV-SUAPC` đã ngừng kinh doanh | An gọi `GET /services?q=sua&category=REPAIR&is_active=false&limit=20&offset=0` | 200 `{items, total, limit, offset}`; `q` tìm không phân biệt hoa/thường/dấu trong `code` và `name`; lọc đúng theo `category`, `unit`, `is_active`; sắp theo `code`; mỗi item `{id, code, name, category, unit, price, vat_rate, price_fixed, default_estimated_hours, is_active, version}`; `limit` > 100 → 422 | integration |
| AC-CAT-020 | Hoa (SALE) và Tuấn (TECH_LEAD) — cả hai có `catalog.read` all | `GET /services`, `GET /services/{id}` | cả hai: 200 (chỉ đọc); Khoa (TECHNICIAN, không có capability) → 403 `FORBIDDEN` trên mọi route bên dưới | integration |
| AC-CAT-021 | An | `POST /services {code:"DV-CAIDAT", name:"Cài đặt phần mềm", category:"SOFTWARE", unit:"LAN", price:150000, vat_rate:8, price_fixed:true, default_estimated_hours:1, description:"Cài Windows + phần mềm văn phòng"}` | 201; `is_active=true`, `version=1`; Hoa/Tuấn gọi cùng request → 403 `FORBIDDEN` (chỉ `catalog.manage`) | integration |
| AC-CAT-022 | An | tạo với: `code` đã tồn tại (khác hoa/thường) / `price` âm / `vat_rate` ngoài `[0,100]` hoặc > 2 chữ số thập phân / `default_estimated_hours` âm / `category` hoặc `unit` không thuộc enum DOMAIN_MODEL §3 / `name` rỗng | `code` trùng → 409 `CONFLICT` field `code`; còn lại → 422, `errors[].field` đúng tên trường, thông điệp tiếng Việt | integration |
| AC-CAT-023 | An | `POST /services {code:"DV-KSAT", name:"Khảo sát công trình", category:"OTHER", unit:"LAN", price:0, vat_rate:0, price_fixed:false, description:"Tính thực tế khi thi công"}` (không truyền `default_estimated_hours`) | 201; `default_estimated_hours=null`; `price=0` được chấp nhận (DOMAIN_MODEL §3: "tính thực tế khi thi công") | integration |
| AC-CAT-024 | An; `DV-LAPCAM` có `version=1` | `PATCH /services/{id} {version:1, name, price, vat_rate, price_fixed, default_estimated_hours, description}` | 200, `version=2`; sửa lại với `version:1` → 409 `STALE_VERSION`; gửi kèm `code` trong body → 422 (`code` không có trong `ServiceUpdate`, bất biến theo §4) | integration |
| AC-CAT-025 | An; `DV-SUAPC` đã ngừng kinh doanh (Given AC-CAT-019) | `POST /services/{id}/activate {version}` | 200 `is_active=true`; activate lần nữa → 409 `INVALID_TRANSITION`. `POST /services/{id}/deactivate {version}` khi đang hoạt động → 200 `is_active=false`; deactivate khi đã ngừng → 409 `INVALID_TRANSITION` | integration |
| AC-CAT-026 | — | mọi route trên | khai báo đúng 1 capability (`catalog.read` cho GET, `catalog.manage` cho lệnh ghi); nằm trong ma trận RBAC route thật | generated |
| AC-CAT-027 | An trên máy tính / điện thoại | mở "Danh mục" → "Dịch vụ" | máy tính: bảng Mã dịch vụ · Tên · Danh mục · Giá (đã format, `0 ₫` hiện là "Liên hệ"/"Tính thực tế" theo copy §6) · Trạng thái (badge); điện thoại: thẻ xếp dọc; ô tìm (gõ xong 300ms mới gọi API), lọc danh mục, lọc trạng thái; phân trang; trạng thái tải (Skeleton), trống ("Chưa có dịch vụ phù hợp."), lỗi (Thử lại) | component + e2e |
| AC-CAT-028 | An | bấm "Thêm dịch vụ" (icon `Hammer`), điền `code, name, category, unit, price, vat_rate, price_fixed, default_estimated_hours, description`, Lưu | zod kiểm ở client trước (giá ≥ 0, VAT `[0,100]`, số giờ ≥ 0 hoặc để trống); lỗi 409/422 server hiện dưới đúng ô; lưu xong → toast "Đã thêm dịch vụ Cài đặt phần mềm."; Sheet chuyển sang chế độ sửa cho dịch vụ vừa tạo (như M2-01b) | component + e2e |
| AC-CAT-029 | An mở một dịch vụ đã tồn tại | sửa thông tin (không có ô `code`/`category`/`unit` — đã khoá sau khi tạo), Lưu | toast "Đã cập nhật."; 409 `STALE_VERSION` → "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút Tải lại | component |
| AC-CAT-030 | An | "Ngừng kinh doanh" / "Mở lại kinh doanh" | `ConfirmDialog`: ngừng → "Dịch vụ sẽ không hiện khi tạo đơn mới."; mở lại → "Dịch vụ sẽ hiện lại khi tạo đơn mới."; xác nhận → badge đổi ngay, không cần tải lại trang | component + e2e |
| AC-CAT-031 | Hoa (SALE, có `catalog.read`) | mở `/catalog/services` trực tiếp (không qua menu) | xem được danh sách và chi tiết (chỉ đọc, không có nút Thêm/Sửa/Ngừng); Khoa (TECHNICIAN, không có capability) mở → trang 403 (M1-03a). *Menu "Danh mục" vẫn chỉ hiện với Manager theo YAML* | component + e2e |
| AC-CAT-032 | Các màn trên, iPhone 13 + 1440px | E2E | axe 0 serious/critical; không cuộn ngang 360px; vùng chạm ≥ 44px; ảnh `services.png`, `service-form.png` | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/services | catalog.read | `q, category, unit, is_active, limit≤100, offset` | `{items, total, limit, offset}` | 422 |
| GET | /api/v1/services/{id} | catalog.read | — | `ServiceDetail` | 404 |
| POST | /api/v1/services | catalog.manage | `ServiceCreate` | 201 `ServiceDetail` | 409, 422 |
| PATCH | /api/v1/services/{id} | catalog.manage | `{version, name?, price?, vat_rate?, price_fixed?, default_estimated_hours?, description?}` | `ServiceDetail` | 404, 409, 422 |
| POST | /api/v1/services/{id}/deactivate | catalog.manage | `{version}` | `ServiceDetail` | 404, 409 |
| POST | /api/v1/services/{id}/activate | catalog.manage | `{version}` | `ServiceDetail` | 404, 409 |

`code`, `category`, `unit` **không** đổi được qua PATCH sau khi tạo (như `sku` ở M2-01a — tránh lệch snapshot lịch sử đơn hàng ở M3). PATCH chỉ sửa thông tin; trạng thái đổi qua lệnh có tên (CLAUDE.md quy tắc 4).

## 5. Dữ liệu / Migration
- Bảng `services` mới theo DOMAIN_MODEL §3: `code varchar(40) unique`, `name varchar(255)`, `category` enum (`INSTALLATION, REPAIR, MAINTENANCE, REFILL, SOFTWARE, NETWORK_CABLING, OTHER`), `unit` enum (như Product + `LAN, DIEM, GIO`: `CAI, MAY, BO, MET, CUON, HOP, LICENSE, LAN, DIEM, GIO`), `price bigint`, `vat_rate numeric(5,2) default 8`, `price_fixed bool`, `default_estimated_hours numeric(5,2) null`, `description text`, `is_active bool default true`, `version int default 1`, `created_at/updated_at timestamptz`.
- Index: `services(is_active)`, `services(category)`; tìm không dấu như M2-01a (`unaccent`) trên `code` + `name`.
- Không đụng bảng `attachments` (dịch vụ không có ảnh).

## 6. UI
- Theo UI_GUIDELINES §3–§4, §6 (ConfirmDialog, Toast, Skeleton, EmptyState); bottom sheet trên điện thoại cho form và hộp xác nhận; icon menu `Hammer` (đã có trong YAML).
- Badge trạng thái: "Đang kinh doanh" (`completed`), "Đã ngừng kinh doanh" (`todo`) — như M2-01b.
- Giá `0` hiển thị là "Liên hệ báo giá" thay vì "0 ₫" (DOMAIN_MODEL §3: giá 0 nghĩa là "tính thực tế khi thi công").
- Copy chính: "Thêm dịch vụ", "Lưu", "Ngừng kinh doanh", "Mở lại kinh doanh".
- Nhãn trường: "Mã dịch vụ", "Tên dịch vụ", "Nhóm dịch vụ", "Đơn vị tính", "Đơn giá (chưa VAT)", "VAT (%)", "Giá cố định", "Số giờ ước tính (gợi ý)", "Mô tả".

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → "Danh mục" → "Dịch vụ" → "Thêm dịch vụ" → điền đủ thông tin (kể cả `default_estimated_hours`) → Lưu.
2. "Ngừng kinh doanh" dịch vụ đó → badge đổi ngay; "Mở lại kinh doanh" → badge đổi lại.
3. Đăng nhập Sale ở cửa sổ khác, mở thẳng `/catalog/services` → thấy danh sách nhưng không có nút sửa.
4. Tạo 1 dịch vụ với giá `0` → danh sách hiện "Liên hệ báo giá" thay vì "0 ₫".

## 8. Giả định & câu hỏi
- **Giả định (theo Q44, áp dụng tương tự cho `code` dịch vụ):** `code` do Manager tự gõ, hệ thống chỉ kiểm trùng (409 `CONFLICT`) — nhất quán với `sku` sản phẩm, ví dụ thực tế (`DV-BOMMUC`, `DV-LAPCAM`) là mã có ý nghĩa, không phải số tự sinh.
- **Giả định (phạm vi 1 item, không tách a/b):** khác M2-01 (Q42 — tách vì có thêm module `attachments`/upload ảnh), M2-02 không có ảnh nên khối lượng code nhỏ hơn nhiều; giữ 1 item như backlog đã ghi. Nếu lúc code thực tế vượt ~400 dòng (không tính test), sẽ tách `M2-02a`/`M2-02b` giữa chừng và báo lại.
- **Giả định:** `vat_rate` mặc định 8 khi không truyền (như Product, Q18); `default_estimated_hours` không bắt buộc, chỉ cần ≥ 0 khi có nhập; validate `price = 0` được phép (khác Product — Product không có ngữ nghĩa "giá 0", Service thì có theo DOMAIN_MODEL §3).
- **Câu hỏi mới — Q45 (đề xuất: "Liên hệ báo giá")**: Copy hiển thị khi `price = 0` trong danh sách/chi tiết dịch vụ là gì? DOMAIN_MODEL §3 chỉ ghi giá trị 0 = "tính thực tế khi thi công", chưa có copy UI chính thức. *Đề xuất:* hiện "Liên hệ báo giá" ở cột Giá (ngắn gọn, quen thuộc với khách hàng B2B); có thể đổi nếu chủ dự án muốn câu khác (vd "Báo giá khi khảo sát").
