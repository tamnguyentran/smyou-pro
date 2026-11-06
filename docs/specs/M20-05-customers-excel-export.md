# M20-05 — Khách hàng: xuất Excel đầy đủ thông tin khách

- **Status:** Approved
- **Backlog:** M20-05 · **Milestone:** M20
- **Liên quan:** spec/permissions.yaml#customer.manage · DOMAIN_MODEL §customers · `M3-01-customers.md`, `M15-05-customer-extended-fields.md` (các trường mở rộng) · Q100 ("Excel" = CSV UTF-8 BOM) · mẫu export: `M15-09a` (`revenue_report/service.py` `build_csv` + `_escape_csv_formula`), mẫu nút: `M8-01b`/`M15-09b` (`kpiExportUrl` — link trực tiếp dùng session cookie, không `fetch`+`Blob`)

## 1. Mục tiêu
Là Quản lý/Sale/CSKH, ở trang "Khách hàng" tôi muốn bấm "Xuất Excel" để tải về toàn bộ khách hàng (theo bộ lọc đang chọn) kèm **đầy đủ** thông tin từng khách, để gọi điện chăm sóc, gửi quà, đối chiếu ngoài hệ thống.

## 2. Phạm vi
- Trong phạm vi:
  - Endpoint `GET /api/v1/customers/export?q=&type=` — CSV UTF-8 BOM (Q100), **toàn bộ** khách khớp bộ lọc (không phân trang), sắp theo mã KH tăng dần, cùng logic tìm/lọc với `GET /customers` (tìm không dấu theo tên, mã, SĐT, email, MST).
  - 20 cột (thứ tự cố định): Mã KH · Loại · Tên khách hàng · Số điện thoại · Email · Mã số thuế · Địa chỉ · Người liên hệ · SĐT người liên hệ · Ngày thành lập · Giám đốc · SĐT giám đốc · Phụ trách IT · SĐT phụ trách IT · Ngày sinh · Giới tính · Nghề nghiệp · Ghi chú · Người tạo · Ngày tạo.
  - Định dạng: Loại `Công ty`/`Cá nhân`; Giới tính `Nam`/`Nữ`/`Khác`; ngày `dd/MM/yyyy`; Ngày tạo theo giờ `Asia/Ho_Chi_Minh` `dd/MM/yyyy HH:mm`; Người tạo = họ tên nhân viên; trường trống → ô trống. Chống CSV injection như các export cũ (ô bắt đầu `= + - @ \t \r` → thêm `'`). Cột SĐT/MST giữ số 0 đầu khi mở bằng Excel (Q133).
  - Nút "Xuất Excel" (icon `Download`) trên trang `/customers`, chỉ hiện trên desktop ≥1024px (giống M18-01a), là link tới URL export kèm `q`/`type` đang lọc.
- Ngoài phạm vi: file `.xlsx` thật (Q100); chọn cột; xuất theo trang hiện tại; ghi audit cho thao tác xuất (audit_events chỉ dành cho chuyển trạng thái); xuất kèm doanh thu/quà tặng (đã có báo cáo riêng M15-09/M16-02).

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-CUS-027 | An (MANAGER); có 25 khách (nhiều hơn 1 trang 20), gồm KH0001 "Công ty TNHH Minh Phát" (COMPANY, đủ mọi trường công ty) và KH0002 "Trần Thị Lan" (INDIVIDUAL, đủ mọi trường cá nhân) | `GET /api/v1/customers/export` | 200; `Content-Type: text/csv; charset=utf-8`; nội dung bắt đầu BOM `﻿`; `Content-Disposition: attachment; filename="khach-hang-2026-11-01.csv"` (ngày theo `Asia/Ho_Chi_Minh`); dòng 1 đúng 20 tiêu đề §2 theo thứ tự; đúng 25 dòng dữ liệu, sắp theo mã KH tăng dần | integration |
| AC-CUS-028 | KH0001 COMPANY: `founded_date=2015-03-12`, `director_name="Nguyễn Văn Phát"`, tạo bởi "Lê Thị Hoa" lúc `2026-10-31T17:30:00Z`; KH0002 INDIVIDUAL: `date_of_birth=1990-07-05`, `gender=FEMALE`, `occupation="Kế toán"`, `email=null` | export | KH0001: Loại `Công ty`, Ngày thành lập `12/03/2015`, Giám đốc `Nguyễn Văn Phát`, cột cá nhân trống, Người tạo `Lê Thị Hoa`, Ngày tạo `01/11/2026 00:30`; KH0002: Loại `Cá nhân`, Ngày sinh `05/07/1990`, Giới tính `Nữ`, Nghề nghiệp `Kế toán`, Email trống, cột công ty trống | unit + integration |
| AC-CUS-029 | 3 khách: "Công ty TNHH Minh Phát" (COMPANY), "Nguyễn Minh Tuấn" (INDIVIDUAL), "Trần Thị Lan" (INDIVIDUAL) | `GET /customers/export?q=minh` ; `?q=minh&type=INDIVIDUAL` | lần 1: đúng 2 dòng (Minh Phát, Minh Tuấn — tìm không dấu như `GET /customers`); lần 2: chỉ "Nguyễn Minh Tuấn" | integration |
| AC-CUS-030 | Khách có `name="=HYPERLINK(\"http://x\")"`, `note="+84 gọi lại"`, `address="-Lô 5 KCN"`, `occupation="@admin"` | export | các ô tương ứng ghi `'=HYPERLINK(...)`, `'+84 gọi lại`, `'-Lô 5 KCN`, `'@admin`; tên "Trần Thị Lan" giữ nguyên; ghi chú nhiều dòng vẫn nằm trong 1 ô (CSV quote đúng) | unit |
| AC-CUS-031 | Khách `phone="0901234567"`, `tax_code="0312345678"`, `director_phone="0987654321"` | export | các ô SĐT/MST được ghi dạng giữ số 0 đầu khi mở bằng Excel theo Q133 (mặc định `="0901234567"`); ô trống vẫn trống (không ghi `=""`) | unit |
| AC-CUS-032 | Hoa (SALE) và Mai (CUSTOMER_CARE); 3 khách do An (MANAGER) tạo, 1 khách do Hoa tạo | mỗi người `GET /customers/export` | 200; cả 2 đều nhận đủ 4 dòng (scope `all`, không lọc theo người tạo) | integration |
| AC-CUS-033 | Tuấn (TECH_LEAD — có `customer.read` nhưng không `customer.manage`) và Khoa (TECHNICIAN) | `GET /customers/export` | 403 `FORBIDDEN` (thiếu capability `customer.manage`, Q132) | integration + generated |
| AC-CUS-034 | Chưa đăng nhập | `GET /customers/export` | 401 | integration |
| AC-CUS-035 | An (MANAGER) | `?q=` dài 101 ký tự; `?type=FOO` | 422 `VALIDATION_ERROR` (cùng luật tham số với `GET /customers`) | integration |
| AC-CUS-036 | An; không khách nào khớp `q=zzzz` | export | 200; file chỉ có BOM + dòng tiêu đề, 0 dòng dữ liệu | integration |
| AC-CUS-037 | An ở `/customers`, desktop 1440px; gõ tìm "Minh", chọn Loại "Công ty", đang ở trang 2 | nhìn khu bộ lọc | có nút "Xuất Excel" (icon `Download`, cao ≥44px) cạnh nút "Thêm khách hàng"; `href` = `/api/v1/customers/export?q=Minh&type=COMPANY` (theo bộ lọc hiện tại; **không** có `limit`/`offset`); bỏ lọc → `href` = `/api/v1/customers/export` | component + e2e |
| AC-CUS-038 | An ở `/customers`, mobile 390px | nhìn trang | **không** có nút "Xuất Excel"; trang không cuộn ngang (`scrollWidth <= clientWidth`) | component + e2e |
| AC-CUS-039 | An ở `/customers` desktop trên stack thật, có ≥1 khách seed | bấm "Xuất Excel" | trình duyệt tải file `khach-hang-<ngày VN>.csv`; 3 byte đầu là BOM; dòng 1 bắt đầu `Mã KH,Loại,Tên khách hàng`; vẫn ở trang `/customers` | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/customers/export | customer.manage | query `q` (≤100), `type` (`COMPANY`\|`INDIVIDUAL`) — giống `GET /customers`, không có `limit`/`offset` | `text/csv; charset=utf-8` (BOM), `Content-Disposition: attachment` | 401, 403, 422 |

Ghi chú cài đặt: khai báo route `/export` **trước** `/{customer_id}` trong `customers/router.py` (tránh bị bắt bởi path UUID → 422). Tái dùng hàm dựng query tìm/lọc của `service.list_customers` (tách phần `where` ra dùng chung, không sao chép). Hàm `_escape_csv_formula` hiện bị lặp ở `kpi`, `revenue_report`, `dashboard` — được phép gom vào một chỗ dùng chung nếu không đổi hành vi các export cũ.

## 5. Dữ liệu / Migration
Không có. Chỉ đọc bảng `customers` + join `employees` (họ tên người tạo).

## 6. UI
- `frontend/src/features/customers/pages/CustomersPage.tsx`: thêm `<a>` "Xuất Excel" (icon `Download` của `lucide-react`, kiểu nút phụ/outline) trong hàng nút phía trên danh sách, `hidden lg:inline-flex`, `href={customersExportUrl({ q, type })}` (hàm mới trong `features/customers/api.ts`, mẫu `kpiExportUrl`; bỏ tham số rỗng).
- Không cần trạng thái loading/lỗi riêng: trình duyệt tự tải file (như nút xuất ở báo cáo KPI/doanh thu).
- Copy: nút "Xuất Excel".

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager trên máy tính, vào **Khách hàng**.
2. Bấm "Xuất Excel" → mở file bằng Excel: tiếng Việt đúng dấu, đủ 20 cột, SĐT/MST còn số 0 đầu, đủ mọi khách (không chỉ 20 khách trang đầu).
3. Gõ tìm "Minh", chọn Loại "Công ty", bấm lại "Xuất Excel" → file chỉ còn khách công ty có "Minh".
4. Mở trên điện thoại → không thấy nút "Xuất Excel".

## 8. Giả định & câu hỏi
- Giả định (theo Q100 đã chốt): "Excel" = CSV UTF-8 BOM, không `.xlsx`.
- **Q132 (mới):** Ai được xuất danh sách khách? Mặc định: ai vào được trang Khách hàng (`customer.manage` — Manager, Sale, CSKH), xuất toàn bộ khách (scope `all`, giống xem danh sách). QLKT/Kỹ thuật viên không xuất được (403). Không đổi `spec/permissions.yaml`. Nếu chủ SP muốn chỉ Manager được xuất (dữ liệu khách là tài sản nhạy cảm), sẽ thêm capability mới:
  ```yaml
  # spec/permissions.yaml (chỉ khi Q132 chọn "chỉ Manager")
  +  customer.export:       { MANAGER: all }    # M20-05
  ```
  kèm nhãn ở `permissionLabels.ts` + `make contract` (quy tắc 13).
- **Q133 (mới):** Excel tự cắt số 0 đầu của SĐT/MST khi mở CSV (`0901234567` → `901234567`). Mặc định: ghi các cột SĐT (4 cột) và MST dạng `="0901234567"` để Excel hiện đúng dạng chữ (chỉ khi giá trị toàn chữ số — SĐT đã được server kiểm tra `^0[0-9]{9}$`). Nhược điểm: mở bằng Google Sheets/Numbers thì vẫn đúng, nhưng nếu nhập lại file bằng công cụ khác sẽ thấy `="…"`. Các export cũ (doanh thu theo KH) chưa xử lý — không sửa trong item này.
- Giả định: nút chỉ hiện desktop ≥1024px (giống nút "Xuất Excel" ở popup Tổng quan M18-01a); API vẫn cho gọi từ mọi thiết bị.
