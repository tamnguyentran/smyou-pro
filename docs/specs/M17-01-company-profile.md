# M17-01 — Thông tin công ty

- **Status:** Approved (2026-10-28, chủ dự án duyệt nguyên các giả định ở §8)
- **Backlog:** M17-01 · **Milestone:** M17
- **Liên quan:** `spec/permissions.yaml` (capability mới `company.manage`, menu mới, `GET /attachments` cho owner `COMPANY`); `backend/app/modules/files/` (pipeline ảnh M6-01, tái dùng cho logo); `backend/app/modules/audit/`; DOMAIN_MODEL §15 (mới); nguồn dữ liệu: hoá đơn bán hàng `Tài liệu tham khảo/1790242987806_…_8c23a5fe2eb6cdd26217b5c73df9e28c.jpg`

## 1. Mục tiêu
Là Manager, tôi muốn lưu và sửa thông tin công ty SMYou (tên, mã số thuế, địa chỉ, điện thoại, fax, email, website, logo) ở một màn hình cài đặt, để có một nguồn dữ liệu chuẩn dùng lại sau này (in phiếu, hoá đơn…).

## 2. Phạm vi
- Trong phạm vi:
  - **Đúng 1 bản ghi** thông tin công ty (singleton) — không có tạo/xoá, chỉ xem + sửa. Migration tạo sẵn bản ghi với dữ liệu đọc từ hoá đơn (chủ dự án chốt 2026-10-28):

    | Trường | Giá trị seed |
    |---|---|
    | Tên công ty | CÔNG TY TNHH SMYOU |
    | Mã số thuế | 0309390732 |
    | Địa chỉ | 8C/A-9C/A Nguyễn Ảnh Thủ, Khu Phố 1, P. Trung Mỹ Tây, TP.HCM |
    | Điện thoại 1 | 0932068787 |
    | Điện thoại 2 | 02862501997 |
    | Fax | 02862533978 |
    | Email | kimyensmyou@gmail.com |
    | Website | http://smyou.vn |
    | Logo | (trống — Manager tải lên trên màn hình) |

  - Sửa thông tin (kèm `version`, chống ghi đè), tải logo mới (thay logo cũ).
  - Mỗi lần sửa/đổi logo ghi 1 `audit_events`.
  - Màn hình "Thông tin công ty" (chỉ Manager), menu mới.
- Ngoài phạm vi: hiển thị thông tin/logo ở chỗ khác (thanh bên, trang đăng nhập, phiếu in) — chủ dự án chốt "chỉ lưu + màn cài đặt"; xoá logo (chỉ thay); nhiều công ty/chi nhánh (PRD: ngoài phạm vi); số tài khoản ngân hàng, người đại diện pháp luật (không có trên hoá đơn — xem §8 Q101); phòng ban (M17-02).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-122 | Database vừa migrate xong; An (MANAGER) | `GET /api/v1/company-profile` | 200; đúng dữ liệu seed ở §2 (tên "CÔNG TY TNHH SMYOU", `tax_code` "0309390732", `phone` "0932068787", `phone_secondary` "02862501997", `fax` "02862533978", `email` "kimyensmyou@gmail.com", `website` "http://smyou.vn"), `logo_attachment_id = null`, `version = 1` | integration |
| AC-SYS-123 | Bản ghi `version = 1` | An `PATCH /api/v1/company-profile` `{"address": "8C/A-9C/A Nguyễn Ảnh Thủ, KP1, P. Trung Mỹ Tây, TP.HCM", "version": 1}` | 200; `address` đổi, các trường khác giữ nguyên, `version = 2`; 1 `audit_events` `action = company_profile.update`, `actor = An`, `data` chỉ chứa trường đã đổi dạng `{address: {from, to}}` | integration |
| AC-SYS-124 | Bản ghi `version = 1` | An `PATCH` `{"phone": "0932 06 8787", "phone_secondary": "028.6250.1997", "fax": "028 6253 3978", "version": 1}` | 200; lưu `"0932068787"`, `"02862501997"`, `"02862533978"` (bỏ khoảng trắng/dấu chấm/gạch); số di động 10 chữ số và số bàn 11 chữ số (028…) đều hợp lệ | unit + integration |
| AC-SYS-125 | Bản ghi `version = 1` | An `PATCH` lần lượt: `name = "  "`; `tax_code = "03093907"`; `email = "kimyen"`; `website = "smyou.vn"` (thiếu `http(s)://`); `phone = "12345"` | Mỗi lần 422 `VALIDATION_ERROR`, `errors[].field` đúng trường sai, thông báo tiếng Việt; bản ghi không đổi | unit + integration |
| AC-SYS-126 | Bản ghi `version = 1` | An `PATCH` `{"phone_secondary": null, "fax": null, "email": null, "website": null, "version": 1}` | 200; các trường tuỳ chọn được xoá trống. `name`, `tax_code`, `address`, `phone` gửi `null` → 422 (bắt buộc) | integration |
| AC-SYS-127 | Bản ghi đã `version = 2` (Bình — MANAGER khác — vừa sửa) | An `PATCH` kèm `version = 1` | 409 `STALE_VERSION`; bản ghi không đổi; không ghi audit | integration |
| AC-SYS-128 | Hoa (SALE), Chi (CUSTOMER_CARE), Long (TECH_LEAD), Đức (TECHNICIAN) | `GET` và `PATCH /api/v1/company-profile`, `POST /api/v1/company-profile/logo` | 403 `FORBIDDEN` cho mọi vai trò trên | integration + generated |
| AC-SYS-129 | Bản ghi `version = 2`, chưa có logo | An `POST /api/v1/company-profile/logo?version=2` (multipart, `logo-smyou.png` hợp lệ ≤ `UPLOAD_MAX_MB`) | 200; `logo_attachment_id` = attachment mới (`owner_type = COMPANY`, `kind = COMPANY_LOGO`), `version = 3`; 1 audit `company_profile.logo_update`; An `GET /api/v1/attachments/{logo_attachment_id}` → 200 đúng ảnh | integration |
| AC-SYS-130 | Đã có logo A, `version = 3` | An tải logo B (`version = 3`) | 200; `logo_attachment_id` = B, `version = 4`. Tải với `version` cũ → 409 `STALE_VERSION`, logo vẫn là B | integration |
| AC-SYS-131 | — | An tải `logo.png` thực chất là file `.txt` | 422 `INVALID_FILE_TYPE`; bản ghi không đổi | integration |
| AC-SYS-132 | Đã có logo | Hoa (SALE) `GET /api/v1/attachments/{logo_attachment_id}` | 403 | integration |
| AC-SYS-133 | An đăng nhập, desktop 1440px | Mở menu "Thông tin công ty" | Form điền sẵn dữ liệu hiện tại, 2 cột từ `md:`; ô logo hiện ảnh hoặc chữ "Chưa có logo" + nút "Tải logo"; sửa địa chỉ → bấm "Lưu" → toast "Đã lưu thông tin công ty" | component + e2e |
| AC-SYS-134 | An, mobile 390px | Mở "Thông tin công ty" | Form 1 cột, không cuộn ngang; nút "Lưu" và "Tải logo" cao ≥ 44px | e2e |
| AC-SYS-135 | An đang ở form | Xoá trống "Tên công ty" hoặc nhập email "kimyen" | Lỗi tiếng Việt hiện ngay dưới ô ("Vui lòng nhập tên công ty", "Email không hợp lệ"); nút "Lưu" bị vô hiệu cho tới khi sửa xong (theo quy ước M10-02) | component |
| AC-SYS-136 | Server trả 409 `STALE_VERSION` khi lưu | — | Hiện thông báo lỗi của server + nút "Tải lại" (giống form Khách hàng); bấm "Tải lại" → form nạp dữ liệu mới nhất | component |
| AC-SYS-137 | Hoa (SALE) đăng nhập | Xem menu; gõ thẳng URL `/settings/company` | Không thấy mục "Thông tin công ty"; URL trực tiếp hiện trang "không có quyền" có sẵn | component |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/company-profile | company.manage | — | `CompanyProfile` | 403 |
| PATCH | /api/v1/company-profile | company.manage | `CompanyProfileUpdate` (mọi trường tuỳ chọn trừ `version`; chỉ trường có gửi mới đổi) | `CompanyProfile` | 403, 409 `STALE_VERSION`, 422 |
| POST | /api/v1/company-profile/logo | company.manage | multipart `file` + query `version` | `CompanyProfile` | 403, 409 `STALE_VERSION`, 422 `FILE_TOO_LARGE` / `INVALID_FILE_TYPE` |
| GET | /api/v1/attachments/{id} | (động) `company.manage` khi `owner_type = COMPANY` | — | ảnh | 403, 404 |

`CompanyProfile`: `{name, tax_code, address, phone, phone_secondary, fax, email, website, logo_attachment_id, version, updated_at}`.

Kiểm tra dữ liệu:
- `name` bắt buộc, trim, 1–255 ký tự; `address` bắt buộc, trim, 1–500.
- `tax_code` bắt buộc, dạng `^\d{10}(-\d{3})?$` (MST 10 số, hoặc 13 số cho chi nhánh).
- `phone` bắt buộc; `phone_secondary`, `fax` tuỳ chọn — chuẩn hoá bằng `normalize_phone` có sẵn, rồi khớp `^0\d{9,10}$` (khác số khách hàng `^0\d{9}$` vì số bàn TP.HCM có 11 chữ số).
- `email` tuỳ chọn, đúng định dạng email; `website` tuỳ chọn, URL `http://` hoặc `https://`, ≤ 255.

## 5. Dữ liệu / Migration
- Bảng mới `company_profile`: `id smallint pk default 1` + `CHECK (id = 1)` (bảo đảm chỉ 1 dòng), `name varchar(255)`, `tax_code varchar(14)`, `address varchar(500)`, `phone varchar(20)`, `phone_secondary varchar(20) null`, `fax varchar(20) null`, `email varchar(255) null`, `website varchar(255) null`, `logo_attachment_id uuid null fk → attachments.id`, `version int default 1`, `created_at`, `updated_at` (timestamptz).
- Migration chèn sẵn dòng `id = 1` với dữ liệu seed ở §2.
- `attachments`: thêm giá trị `owner_type = COMPANY`, `kind = COMPANY_LOGO` (nếu là CHECK constraint thì cập nhật bằng migration mới). Logo cũ khi thay **không xoá** (đúng quy ước attachments hiện có), chỉ đổi con trỏ.
- DOMAIN_MODEL: thêm §15 `CompanyProfile`.

## 6. UI
- **Menu:** mục cấp 1 mới "Thông tin công ty", icon `Building2`, path `/settings/company`, capability `company.manage`, đặt ngay trước "Nhật ký hệ thống". Không có trên bottom nav mobile (vào qua menu đầy đủ).
- **Màn hình** (thẻ theo kiểu M11): tiêu đề "Thông tin công ty".
  - Khối logo: ảnh logo (tối đa 120px cao) hoặc chữ "Chưa có logo"; nút "Tải logo" (icon `Upload`) → chọn ảnh → tải ngay, toast "Đã cập nhật logo". Đang tải: nút hiện spinner + vô hiệu.
  - Form, mobile 1 cột, từ `md:` 2 cột: "Tên công ty"* (rộng hết dòng), "Mã số thuế"*, "Điện thoại 1"*, "Điện thoại 2", "Fax", "Email", "Website", "Địa chỉ"* (rộng hết dòng). Dấu * là bắt buộc.
  - Nút "Lưu" (icon `Save`) cuối form; vô hiệu khi chưa đổi gì hoặc còn lỗi. Thành công → toast "Đã lưu thông tin công ty".
  - Loading: skeleton form. Lỗi tải: "Không tải được thông tin công ty." + nút "Thử lại".
- Thông báo lỗi ô: "Vui lòng nhập tên công ty", "Vui lòng nhập địa chỉ", "Mã số thuế gồm 10 hoặc 13 chữ số (dạng 0309390732 hoặc 0309390732-001)", "Số điện thoại không hợp lệ", "Email không hợp lệ", "Website phải bắt đầu bằng http:// hoặc https://".

## 7. Kịch bản UAT thủ công (cho chủ dự án)
1. Đăng nhập Manager → menu "Thông tin công ty" → thấy đúng thông tin như trên hoá đơn.
2. Bấm "Tải logo", chọn ảnh logo SMYou → logo hiện trên màn hình.
3. Sửa địa chỉ, bấm "Lưu" → tải lại trang vẫn thấy địa chỉ mới.
4. Mở "Nhật ký hệ thống" → thấy 2 dòng: sửa thông tin công ty, đổi logo.
5. Đăng nhập Sale → không thấy menu "Thông tin công ty".

## 8. Giả định & câu hỏi
Đã chốt (chủ dự án, 2026-10-28): chỉ 1 bản ghi; chỉ lưu + màn cài đặt, chưa hiện/in ở chỗ khác; dữ liệu seed lấy từ hoá đơn.

Giả định (AI đề xuất — chủ dự án xem khi duyệt):
- **Chỉ Manager xem + sửa** (capability mới `company.manage: { MANAGER: all }` dùng cho cả GET). Khi sau này cần in phiếu, sẽ thêm quyền đọc cho vai trò khác ở item đó.
- Sửa thông tin/đổi logo **ghi `audit_events`** (giống lịch sử sửa quà tặng M16-01a) để biết ai đổi gì.
- Hai số điện thoại tách 2 ô ("Điện thoại 1" bắt buộc, "Điện thoại 2" tuỳ chọn) thay vì 1 ô ghi tự do.
- Chưa có nút xoá logo, chỉ thay logo.
- Q101 (mới): có cần thêm số tài khoản ngân hàng / người đại diện pháp luật không? Giả định: chưa cần, vì hoá đơn không có.

Đề xuất sửa `spec/permissions.yaml` (chưa sửa — làm ở `/implement` sau khi duyệt):
```diff
   # --- Báo cáo ---
   ...
   audit.read:            { MANAGER: all }
+  # --- Hệ thống ---
+  company.manage:        { MANAGER: all }   # M17-01: view + edit the single company profile, upload logo
   notification.read:     { MANAGER: self, SALE: self, TECH_LEAD: self, TECHNICIAN: self }
 ...
+  - id: company
+    label: Thông tin công ty
+    icon: Building2
+    path: /settings/company
+    capability: company.manage
   - id: audit
     label: Nhật ký hệ thống
```
Và chú thích `dynamic_routes`/`files/router.py`: `GET /attachments/{id}` với `owner_type = COMPANY` kiểm tra `company.manage`.
