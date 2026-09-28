# M3-01 — Khách hàng

- **Status:** Done
- **Backlog:** M3-01 · **Milestone:** M3
- **Liên quan:** DOMAIN_MODEL §4 (Customer); `spec/permissions.yaml` (`customer.read`: MANAGER/SALE/TECH_LEAD all; `customer.manage`: MANAGER/SALE all — không có scope `own`, sổ khách hàng dùng chung); menu `customers` (`M1-03a`, capability `customer.manage`, path `/customers`); ARCHITECTURE §5 (`code_sequences` — đã có bảng + hàm `next_value`, dùng lại như M1-04a, scope mới `customer`); M1-04a/M2-01a/M2-02 (mẫu CRUD danh mục — module này cùng khuôn, không có ảnh/trạng thái hoạt động)

## 1. Mục tiêu
Là Nhân viên kinh doanh hoặc Quản lý chung, tôi tạo/sửa/tìm khách hàng trong sổ khách hàng dùng chung, được cảnh báo khi số điện thoại trùng khách đã có, để tránh tạo trùng khi lập đơn hàng ở M3-02.

## 2. Phạm vi
Một item duy nhất (gộp API + giao diện, như M2-02): khách hàng không có ảnh/`attachments`, không có trạng thái hoạt động/ngừng hoạt động (DOMAIN_MODEL §4 không có cột `is_active`) — nên không có lệnh activate/deactivate như Sản phẩm/Dịch vụ/Nhân viên.
- **Trong phạm vi:** bảng `customers`; API danh sách/tìm/lọc, chi tiết, tạo, sửa; cảnh báo (không chặn) khi số điện thoại trùng khách khác; trang "Khách hàng" (`/customers`) — danh sách, form tạo/sửa; chỉ đọc cho Quản lý kỹ thuật.
- **Ngoài phạm vi:** xoá khách hàng (không bao giờ — không có cột trạng thái để ẩn, và `orders.customer_id` tham chiếu tới bản ghi nên không xoá được; nếu cần "khách không còn giao dịch" sẽ bổ sung sau nếu có yêu cầu thật); gắn khách hàng vào đơn hàng và "Khách lẻ" (M3-02); import CSV (đã làm cho danh mục SP/DV ở M2-03, không bao gồm khách hàng — ngoài phạm vi trừ khi có backlog riêng); hợp nhất (merge) 2 khách hàng trùng.

## 3. Acceptance Criteria
Dữ liệu mẫu: **An** NV001 [MANAGER]; **Hoa** NV005 [SALE]; **Tuấn** NV010 [TECH_LEAD]; **Khoa** NV014 [TECHNICIAN]. Khách hàng mẫu: `KH00001` "Cty Sáng Tạo Mới" [COMPANY], SĐT `0909123456`, MST `0312345678`; `KH00002` "Anh Ngọc - Grand Hotel" [INDIVIDUAL], SĐT `0918234567`; `KH00003` "Cty Kim Long" [COMPANY], SĐT `0912345678`, MST `0311122233`.

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CUS-001 | 3 khách hàng trên | Hoa gọi `GET /customers?q=kim long&limit=20&offset=0` rồi `GET /customers?q=0918234567` rồi `GET /customers?q=0311122233` | mỗi lần: 200 `{items, total, limit, offset}`; `q` tìm không phân biệt hoa/thường/dấu, khớp trong `name`, `phone`, `tax_code` (theo backlog "tìm theo tên/SĐT/MST"); lọc thêm được theo `type`; sắp theo `code`; mỗi item `{id, code, type, name, contact_person, phone, email, tax_code, address, note, created_by, version}`; `limit` > 100 → 422 | integration |
| AC-CUS-002 | An, Hoa (`customer.manage` ⇒ có luôn quyền đọc), Tuấn (TECH_LEAD, chỉ `customer.read`) | `GET /customers`, `GET /customers/{id}` | cả ba: 200; Khoa (TECHNICIAN, không có capability) → 403 `FORBIDDEN` trên **mọi** route ở mục này, kể cả GET | integration |
| AC-CUS-003 | Hoa | `POST /customers {type:"COMPANY", name:"Cty Việt Phát", contact_person:"Chị Mai", phone:"0987654321", email:"ketoan@vietphat.vn", tax_code:"0399988877", address:"45 Nguyễn Huệ, Q1, TP.HCM", note:"Khách quen từ 2024"}` | 201; mã tự sinh tiếp theo (`KH00004`); `version=1`; `duplicate_phone_matches: []` (SĐT chưa từng dùng); Tuấn (chỉ đọc) gọi cùng request → 403 `FORBIDDEN` (chỉ `customer.manage`) | integration |
| AC-CUS-004 | Hoa | tạo với: `phone` không phải 10 số bắt đầu 0 (vd `"098765"`, `"12987654321"`) / `name` rỗng / `type` không thuộc `COMPANY`\|`INDIVIDUAL` / `email` có nhưng sai định dạng | lần lượt 422, `errors[].field` đúng tên trường (`phone`/`name`/`type`/`email`), thông điệp tiếng Việt | integration |
| AC-CUS-005 | `KH00003` "Cty Kim Long" có SĐT `0912345678` | Hoa `POST /customers {type:"INDIVIDUAL", name:"Anh Tùng", phone:"0912345678", address:"..."}` (số trùng khách khác, khác công ty) | 201 (không chặn); response có `duplicate_phone_matches: [{id, code:"KH00003", name:"Cty Kim Long", phone:"0912345678"}]`; khách mới vẫn được tạo bình thường, `total` khách hàng tăng thêm 1 | integration |
| AC-CUS-006 | An; `KH00002` "Anh Ngọc - Grand Hotel" có `version=1` | `PATCH /customers/{id} {version:1, name, contact_person, phone, email, tax_code, address, note}` (không đổi SĐT) | 200, `version=2`, `duplicate_phone_matches: []`; sửa lại với `version:1` → 409 `STALE_VERSION`; gửi kèm `code` trong body → 422 (`code` không có trong `CustomerUpdate`, bất biến — tự sinh, không sửa được) | integration |
| AC-CUS-007 | An; `KH00002` đổi SĐT sang `0909123456` (trùng `KH00001` "Cty Sáng Tạo Mới") | `PATCH /customers/{id} {version, phone:"0909123456", ...}` | 200 (không chặn); `duplicate_phone_matches: [{id, code:"KH00001", name:"Cty Sáng Tạo Mới", phone:"0909123456"}]`; SĐT của `KH00002` vẫn đổi thành công | integration |
| AC-CUS-008 | — | mọi route ở mục này | khai báo đúng 1 capability (`customer.read` cho GET, `customer.manage` cho POST/PATCH); nằm trong ma trận RBAC route thật | generated |
| AC-CUS-009 | An trên máy tính / điện thoại | mở "Đơn hàng" → "Khách hàng" | máy tính: bảng Mã KH · Loại · Tên · Người liên hệ · SĐT · MST · Địa chỉ; điện thoại: thẻ xếp dọc (tên + SĐT nổi bật, còn lại gọn); ô tìm (gõ xong 300ms mới gọi API, tìm theo tên/SĐT/MST), lọc Loại khách hàng; phân trang; trạng thái tải (Skeleton), trống ("Chưa có khách hàng phù hợp."), lỗi (Thử lại) | component + e2e |
| AC-CUS-010 | Hoa | bấm "Thêm khách hàng" (icon `UserPlus`), điền `type, name, contact_person, phone, email, tax_code, address, note`, Lưu | zod kiểm ở client trước (SĐT 10 số bắt đầu 0, `name` bắt buộc, `type` bắt buộc); lỗi 422 server hiện dưới đúng ô; lưu thành công → toast "Đã thêm khách hàng Cty Việt Phát."; nếu `duplicate_phone_matches` không rỗng → thêm dòng cảnh báo màu vàng trong toast/banner "SĐT này đã dùng cho: Cty Kim Long (KH00003)." — **không** có nút huỷ, chỉ để biết | component + e2e |
| AC-CUS-011 | Hoa mở một khách hàng đã tồn tại | sửa thông tin (không có ô `code` — đã khoá), Lưu | toast "Đã cập nhật."; 409 `STALE_VERSION` → "Thông tin đã bị người khác thay đổi. Vui lòng tải lại." + nút Tải lại; đổi SĐT trùng khách khác → cùng cảnh báo không chặn như AC-CUS-010 | component |
| AC-CUS-012 | Tuấn (TECH_LEAD, có `customer.read`, không có `customer.manage`) | mở `/customers` trực tiếp (không qua menu — menu chỉ khai `customer.manage`) | xem được danh sách và chi tiết (chỉ đọc, không có nút Thêm/Sửa); Khoa (TECHNICIAN, không có capability) mở → trang 403 (M1-03a) | component + e2e |
| AC-CUS-013 | Các màn trên, iPhone 13 + 1440px | E2E | axe 0 serious/critical; không cuộn ngang 360px; vùng chạm ≥ 44px; ảnh `customers.png`, `customer-form.png` | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/customers | customer.read | `q, type, limit≤100, offset` | `{items, total, limit, offset}` | 422 |
| GET | /api/v1/customers/{id} | customer.read | — | `CustomerDetail` | 404 |
| POST | /api/v1/customers | customer.manage | `CustomerCreate` | 201 `CustomerDetail` (+ `duplicate_phone_matches[]`) | 422 |
| PATCH | /api/v1/customers/{id} | customer.manage | `{version, type?, name?, contact_person?, phone?, email?, tax_code?, address?, note?}` | `CustomerDetail` (+ `duplicate_phone_matches[]`) | 404, 409, 422 |

`code` **không** đổi được qua PATCH (tự sinh lúc tạo, bất biến — tránh lệch snapshot đơn hàng ở M3-02). `duplicate_phone_matches` là **cảnh báo**, không phải lỗi: HTTP vẫn 201/200, không có mã lỗi; liệt kê khách hàng khác (loại trừ chính mình khi sửa) có SĐT đã chuẩn hoá trùng khớp.

## 5. Dữ liệu / Migration
- Bảng `customers` theo DOMAIN_MODEL §4: `code varchar(20) unique`, `type` enum (`COMPANY`, `INDIVIDUAL`), `name varchar(255)`, `contact_person varchar(120) null`, `phone varchar(20)` (chuẩn hoá chỉ chữ số, 10 số bắt đầu 0 — Q51), `email varchar(255) null`, `tax_code varchar(20) null`, `address text`, `note text`, `created_by uuid → employees`, `version int default 1`, `created_at/updated_at timestamptz`.
- Dùng lại bảng `code_sequences` (đã có từ M1-04a) + hàm `next_value(session, "customer", ...)`: mã `KH` + 5 chữ số (`KH00001`), tiếp nối mã lớn nhất hiện có.
- Index: `customers(phone)` (tra cứu trùng SĐT nhanh); tìm không dấu trên `name` như M1-04a/M2-01a (`unaccent` hoặc cột chuẩn hoá), áp dụng cả cho `phone`/`tax_code` (so khớp chuỗi số, không cần unaccent).
- Không có unique constraint DB trên `phone` hay `tax_code` (chỉ cảnh báo ở tầng service, không chặn — theo backlog).

## 6. UI
- Trang `/customers`, menu "Đơn hàng" → "Khách hàng" (đã khai ở M1-03a, chỉ Sale/Manager thấy menu; TECH_LEAD vào bằng URL trực tiếp, chỉ đọc).
- Desktop: bảng; Mobile: thẻ. Nút "Thêm khách hàng" mở `Sheet` (như Product/Service); Sửa mở lại `Sheet` ở chế độ sửa.
- Form: `type` (radio/segmented Công ty | Cá nhân), `name`, `contact_person`, `phone`, `email`, `tax_code`, `address`, `note` (textarea).
- Cảnh báo trùng SĐT: banner màu vàng/amber (không phải đỏ — không phải lỗi) sau khi lưu, liệt kê tên + mã khách hàng trùng; không chặn thao tác tiếp theo.
- Copy tiếng Việt: nút "Thêm khách hàng", "Lưu", toast "Đã thêm khách hàng {name}.", "Đã cập nhật.", cảnh báo "SĐT này đã dùng cho: {name} ({code})."

## 7. Kịch bản UAT thủ công
1. `make up`; đăng nhập Hoa (SALE) → "Đơn hàng" → "Khách hàng" → "Thêm khách hàng", điền SĐT `0909123456` (trùng `KH00001` nếu đã seed) → lưu → thấy banner cảnh báo, khách vẫn được tạo.
2. Tìm theo MST một khách vừa tạo → thấy đúng 1 kết quả.
3. Đăng nhập Tuấn (TECH_LEAD) → mở thẳng URL `/customers` (không có mục menu) → chỉ xem, không có nút Thêm/Sửa.

## 8. Giả định & câu hỏi
- **Câu hỏi mới — Q50 (đề xuất: cảnh báo không chặn, hiện sau khi lưu)**: Backlog ghi "chống trùng SĐT (cảnh báo)" nhưng không nói rõ cảnh báo hiện **trước** khi lưu (chặn tạm, cần xác nhận thêm 1 bước như dialog "Vẫn tạo?") hay **sau** khi lưu (chỉ thông báo, không cần thao tác thêm). *Đề xuất:* sau khi lưu — server luôn tạo/sửa thành công, trả kèm `duplicate_phone_matches` để FE hiện banner cảnh báo; không có bước xác nhận thứ hai. Lý do: đơn giản hơn, đúng nghĩa "cảnh báo" (không phải "chặn"); Sale vẫn có thể tự tra cứu bằng ô tìm kiếm (theo SĐT) trước khi tạo mới nếu muốn kiểm tra trước.
- **Câu hỏi mới — Q51 (đề xuất: giống nhân viên)**: DOMAIN_MODEL §4 chỉ ghi "phone chuẩn hoá", không nói rõ định dạng. *Đề xuất:* dùng lại đúng quy tắc nhân viên (DOMAIN_MODEL §1): chuẩn hoá chỉ giữ chữ số, phải đúng 10 số bắt đầu `0`.
- Giả định: `email` và `tax_code` khách hàng **không** unique (khác `email` nhân viên) — một công ty có thể có nhiều khách hàng ghi cùng MST chi nhánh, không phải lỗi hệ thống; `contact_person` tự do, không validate định dạng; danh sách mặc định sắp theo `code` (giống Product/Service/Employee, nhất quán toàn hệ thống) — không phải theo tên; `created_by` ghi người tạo lúc `POST`, không đổi được qua PATCH, không hiển thị trên form (chỉ phục vụ audit/báo cáo sau này nếu cần).
