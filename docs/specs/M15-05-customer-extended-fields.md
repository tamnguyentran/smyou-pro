# M15-05 — Thông tin mở rộng khách hàng (tổ chức / cá nhân)

- **Status:** Done (2026-10-22)
- **Backlog:** M15-05 · **Milestone:** M15
- **Liên quan:** `docs/product/DOMAIN_MODEL.md` §4 (Customer); `docs/specs/M3-01-customers.md` (API/UI khách hàng hiện có)

## 1. Mục tiêu
Là Sale/CSKH/Manager, tôi muốn lưu thêm thông tin phù hợp với từng loại khách hàng (tổ chức hoặc cá nhân) để biết rõ hơn về khách khi chăm sóc/bán hàng.

## 2. Phạm vi
- Trong phạm vi:
  - `customers` thêm cột, tuỳ `type`:
    - `COMPANY`: `founded_date` (date null, "Ngày thành lập"), `director_name` (varchar(120) null, "Giám đốc"), `it_contact_name` (varchar(120) null, "Phụ trách IT"), `it_contact_phone` (varchar(20) null, "SĐT phụ trách IT"), `it_contact_email` (varchar(255) null, "Email phụ trách IT").
    - `INDIVIDUAL`: `date_of_birth` (date null), `gender` (enum `MALE`,`FEMALE`,`OTHER`, null), `occupation` (varchar(120) null, "Nghề nghiệp").
  - `POST /customers`, `PATCH /customers/{id}` (M3-01) nhận thêm các trường trên theo `type`; server từ chối (422) nếu gửi trường thuộc nhóm không khớp `type` (vd gửi `founded_date` cho khách `INDIVIDUAL`).
  - Form tạo/sửa khách hàng: hiện đúng bộ trường theo `type` đã chọn.
- Ngoài phạm vi: không bắt buộc nhập các trường này (tất cả optional — PRD không yêu cầu bắt buộc).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CUS-016 | Hoa (SALE) | `POST /customers {type:"COMPANY", name, phone, founded_date:"2015-03-01", director_name:"Nguyễn Văn A", it_contact_name:"Trần Thị B", it_contact_phone:"0988123456", it_contact_email:"it@congty.vn"}` | 201; `CustomerDetail` có đủ 5 trường | integration |
| AC-CUS-016b | Hoa | `POST /customers {type:"COMPANY", name, phone, it_contact_phone:"098812"}` (sai định dạng, không đủ 10 số) | 422 field `it_contact_phone` | integration |
| AC-CUS-017 | Như trên | `POST /customers {type:"COMPANY", name, phone, date_of_birth:"1990-01-01"}` | 422 field `date_of_birth` — không hợp lệ với `type=COMPANY` | integration |
| AC-CUS-018 | Hoa | `POST /customers {type:"INDIVIDUAL", name, phone, date_of_birth:"1990-05-20", gender:"FEMALE", occupation:"Giáo viên"}` | 201; đủ 3 trường cá nhân | integration |
| AC-CUS-019 | Khách hàng `COMPANY` có `version=1` | `PATCH /customers/{id} {version:1, director_name:"Lê Văn C"}` | 200; chỉ `director_name` đổi, các trường khác giữ nguyên | integration |
| AC-CUS-020 | Form tạo khách hàng, chọn "Tổ chức" | render | Hiện 5 ô: "Ngày thành lập", "Giám đốc", "Phụ trách IT", "SĐT phụ trách IT", "Email phụ trách IT"; không hiện ô cá nhân | component |
| AC-CUS-021 | Form tạo khách hàng, chọn "Cá nhân" | render | Hiện 3 ô: "Ngày sinh", "Giới tính" (dropdown Nam/Nữ/Khác), "Nghề nghiệp"; không hiện ô tổ chức | component |
| AC-CUS-022 | Khách hàng `COMPANY` có `version=1` | `PATCH /customers/{id} {version:1, type:"INDIVIDUAL"}` | 422 field `type` — `type` bất biến, không sửa qua PATCH (giống `code`) | integration |
| AC-CUS-023 | Khách hàng `INDIVIDUAL` có `version=1` | `PATCH /customers/{id} {version:1, director_name:"Lê Văn C"}` (trường thuộc nhóm `COMPANY`) | 422 field `director_name` — không hợp lệ với `type` hiện tại của khách hàng (`INDIVIDUAL`) | integration |
| AC-CUS-024 | Form sửa khách hàng đã có (`type="COMPANY"`) | render | Ô "Loại khách hàng" bị khoá (disabled), không đổi được sau khi tạo | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/customers | customer.manage | Thêm field tuỳ `type` như §2 |
| PATCH | /api/v1/customers/{id} | customer.manage | Thêm field tuỳ `type` (không đổi `type` qua PATCH — bất biến như các entity khác) |

`it_contact_phone` chuẩn hoá/validate giống `phone` khách hàng (10 số bắt đầu `0`, Q51); `it_contact_email` validate định dạng email tiêu chuẩn (giống `email` khách hàng) — cả hai optional, không unique, không có `duplicate_phone_matches` riêng (chỉ áp dụng cho `phone` chính của khách hàng).

## 5. Dữ liệu / Migration
`make migration name=customer_extended_fields` — thêm 8 cột nullable vào `customers` (5 cho COMPANY: `founded_date`, `director_name`, `it_contact_name`, `it_contact_phone`, `it_contact_email`; 3 cho INDIVIDUAL: `date_of_birth`, `gender`, `occupation`); không backfill (dữ liệu cũ để trống).

## 6. UI
- Form khách hàng (trang Khách hàng, M3-01 UI): 2 bộ field hiện/ẩn theo `type` đã chọn ở đầu form. Bộ tổ chức: "Ngày thành lập", "Giám đốc", "Phụ trách IT" (tên), "SĐT phụ trách IT", "Email phụ trách IT".
- Trang chi tiết khách hàng: hiện thêm các trường đã nhập (ẩn dòng nếu rỗng).

## 7. Kịch bản UAT thủ công
1. Tạo khách hàng tổ chức, nhập đủ 3 trường mới → lưu → mở lại thấy đúng.
2. Tạo khách hàng cá nhân, nhập đủ 3 trường mới → lưu → mở lại thấy đúng.
3. Đổi `type` không được (field bất biến) — kiểm tra form không cho đổi sau khi tạo.

## 8. Giả định & câu hỏi
- **Đã chốt (chủ dự án, 2026-10-22, Q87 → archive):** "Phụ trách IT" có thêm `it_contact_phone`, `it_contact_email` riêng (khác `contact_person`/`phone`/`email` chung của khách hàng).
- **Đã chốt (chủ dự án, 2026-10-22):** `gender` dùng enum 3 giá trị `MALE`/`FEMALE`/`OTHER` (Nam/Nữ/Khác) — không thêm option thứ 4.
