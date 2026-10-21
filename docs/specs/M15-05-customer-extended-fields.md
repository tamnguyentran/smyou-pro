# M15-05 — Thông tin mở rộng khách hàng (tổ chức / cá nhân)

- **Status:** Draft
- **Backlog:** M15-05 · **Milestone:** M15
- **Liên quan:** `docs/product/DOMAIN_MODEL.md` §4 (Customer); `docs/specs/M3-01-customers.md` (API/UI khách hàng hiện có)

## 1. Mục tiêu
Là Sale/CSKH/Manager, tôi muốn lưu thêm thông tin phù hợp với từng loại khách hàng (tổ chức hoặc cá nhân) để biết rõ hơn về khách khi chăm sóc/bán hàng.

## 2. Phạm vi
- Trong phạm vi:
  - `customers` thêm cột, tuỳ `type`:
    - `COMPANY`: `founded_date` (date null, "Ngày thành lập"), `director_name` (varchar(120) null, "Giám đốc"), `it_contact_name` (varchar(120) null, "Phụ trách IT").
    - `INDIVIDUAL`: `date_of_birth` (date null), `gender` (enum `MALE`,`FEMALE`,`OTHER`, null), `occupation` (varchar(120) null, "Nghề nghiệp").
  - `POST /customers`, `PATCH /customers/{id}` (M3-01) nhận thêm các trường trên theo `type`; server từ chối (422) nếu gửi trường thuộc nhóm không khớp `type` (vd gửi `founded_date` cho khách `INDIVIDUAL`).
  - Form tạo/sửa khách hàng: hiện đúng bộ trường theo `type` đã chọn.
- Ngoài phạm vi: không bắt buộc nhập các trường này (tất cả optional — PRD không yêu cầu bắt buộc).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-CUS-016 | Hoa (SALE) | `POST /customers {type:"COMPANY", name, phone, founded_date:"2015-03-01", director_name:"Nguyễn Văn A", it_contact_name:"Trần Thị B"}` | 201; `CustomerDetail` có đủ 3 trường | integration |
| AC-CUS-017 | Như trên | `POST /customers {type:"COMPANY", name, phone, date_of_birth:"1990-01-01"}` | 422 field `date_of_birth` — không hợp lệ với `type=COMPANY` | integration |
| AC-CUS-018 | Hoa | `POST /customers {type:"INDIVIDUAL", name, phone, date_of_birth:"1990-05-20", gender:"FEMALE", occupation:"Giáo viên"}` | 201; đủ 3 trường cá nhân | integration |
| AC-CUS-019 | Khách hàng `COMPANY` có `version=1` | `PATCH /customers/{id} {version:1, director_name:"Lê Văn C"}` | 200; chỉ `director_name` đổi, các trường khác giữ nguyên | integration |
| AC-CUS-020 | Form tạo khách hàng, chọn "Tổ chức" | render | Hiện 3 ô: "Ngày thành lập", "Giám đốc", "Phụ trách IT"; không hiện ô cá nhân | component |
| AC-CUS-021 | Form tạo khách hàng, chọn "Cá nhân" | render | Hiện 3 ô: "Ngày sinh", "Giới tính" (dropdown Nam/Nữ/Khác), "Nghề nghiệp"; không hiện ô tổ chức | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| POST | /api/v1/customers | customer.manage | Thêm field tuỳ `type` như §2 |
| PATCH | /api/v1/customers/{id} | customer.manage | Thêm field tuỳ `type` (không đổi `type` qua PATCH — bất biến như các entity khác) |

## 5. Dữ liệu / Migration
`make migration name=customer_extended_fields` — thêm 6 cột nullable vào `customers` (3 cho COMPANY, 3 cho INDIVIDUAL); không backfill (dữ liệu cũ để trống).

## 6. UI
- Form khách hàng (trang Khách hàng, M3-01 UI): 2 bộ field hiện/ẩn theo `type` đã chọn ở đầu form.
- Trang chi tiết khách hàng: hiện thêm các trường đã nhập (ẩn dòng nếu rỗng).

## 7. Kịch bản UAT thủ công
1. Tạo khách hàng tổ chức, nhập đủ 3 trường mới → lưu → mở lại thấy đúng.
2. Tạo khách hàng cá nhân, nhập đủ 3 trường mới → lưu → mở lại thấy đúng.
3. Đổi `type` không được (field bất biến) — kiểm tra form không cho đổi sau khi tạo.

## 8. Giả định & câu hỏi
- Giả định: "Phụ trách IT" chỉ lưu **tên**, không có ô sđt/email riêng — khách hàng tổ chức đã có `contact_person`/`phone`/`email` chung ở mức khách hàng; nếu cần sđt/email riêng cho người phụ trách IT thì khác người liên hệ chính. → ghi vào `OPEN_QUESTIONS.md`: "Phụ trách IT" chỉ cần tên, hay cần thêm sđt/email riêng (khác `contact_person`/`phone` của khách hàng)?
- Giả định: `gender` dùng enum 3 giá trị (Nam/Nữ/Khác) theo chuẩn đã dùng ở các hệ thống tương tự trong ngành — PRD/DOMAIN_MODEL chưa có tiền lệ, cần chủ dự án xác nhận tên enum và có cần option "Không xác định/không muốn nêu" không.
