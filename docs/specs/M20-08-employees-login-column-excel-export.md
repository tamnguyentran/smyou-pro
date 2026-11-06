# M20-08 — Nhân sự: cột "Tài khoản đăng nhập", hiện SĐT + ngày sinh, xuất Excel đầy đủ

- **Status:** Approved
- **Backlog:** M20-08 · **Milestone:** M20
- **Liên quan:** spec/permissions.yaml#employee.read, #employee.manage · DOMAIN_MODEL §employees · `M17-03a` (trường cá nhân), `M17-03b` (username đăng nhập), `M17-02b` (phòng ban) · Q100 ("Excel" = CSV UTF-8 BOM) · mẫu export + nút: `M20-05` (`customers/export.py`, `customersExportUrl`)

## 1. Mục tiêu
Là Quản lý, ở trang "Nhân sự" tôi muốn thấy rõ **tài khoản đăng nhập** của từng nhân viên ở cột riêng, kèm SĐT và ngày sinh, và bấm "Xuất Excel" để tải toàn bộ danh sách nhân viên (theo bộ lọc) với đầy đủ thông tin hồ sơ.

## 2. Phạm vi
- Trong phạm vi:
  - **Danh sách desktop (≥1024px):** cột theo thứ tự `Mã · Họ tên · Tài khoản đăng nhập · Email · SĐT · Ngày sinh · Vai trò · Trạng thái`. Username chuyển từ dòng phụ dưới họ tên sang cột riêng. Ngày sinh `dd/MM/yyyy`; trống → `—`.
  - **Thẻ mobile (<1024px):** giữ dạng thẻ; hiện nhãn rõ `Tài khoản: <username>`, SĐT, `Ngày sinh: dd/MM/yyyy` (dòng nào trống thì ẩn).
  - **Tìm kiếm** ô "Tìm" trên trang Nhân sự khớp thêm theo username (Q140).
  - Endpoint `GET /api/v1/employees/export?q=&role=&is_active=` — CSV UTF-8 BOM, **toàn bộ** nhân viên khớp bộ lọc (không phân trang), cùng logic tìm/lọc và thứ tự với `GET /employees` (mã NV tăng dần).
  - 18 cột (thứ tự cố định): Mã NV · Họ tên · Tài khoản đăng nhập · Email · Số điện thoại · Ngày sinh · Nơi sinh · Giới tính · Địa chỉ · Số CMND/CCCD · Ngày cấp · Nơi cấp · Tình trạng hôn nhân · Phòng ban · Chức danh · Vai trò · Trạng thái · Ngày tạo.
  - Định dạng: Giới tính `Nam`/`Nữ`/`Khác`; Hôn nhân `Độc thân`/`Đã kết hôn`/`Ly hôn`/`Goá` (cùng nhãn UI `MARITAL_STATUS_LABELS`); Vai trò = nhãn tiếng Việt từ `permissions.yaml navigation.roles`, nối bằng `, `; Trạng thái `Đang hoạt động`/`Đã khoá`; ngày `dd/MM/yyyy`; Ngày tạo giờ `Asia/Ho_Chi_Minh` `dd/MM/yyyy HH:mm`; trống → ô trống. Chống CSV injection và giữ số 0 đầu cho SĐT + CMND/CCCD (Q133) — **tái dùng helper của M20-05** (gom về chỗ dùng chung, không sao chép).
  - Nút "Xuất Excel" (icon `Download`) cạnh "Thêm nhân viên", chỉ desktop ≥1024px, là link tới URL export kèm `q`/`role`/`is_active` đang lọc; chỉ hiện khi người dùng có quyền xuất (Q141).
- Ngoài phạm vi: `.xlsx` thật (Q100); xuất mật khẩu/trạng thái khoá đăng nhập/`must_change_password`; chọn cột; audit thao tác xuất; reset mật khẩu (M20-09).

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-EMP-105 | An (MANAGER) ở `/employees`, desktop 1440px; có NV0007 "Phạm Văn Khoa", username `khoapv`, SĐT `0912345678`, ngày sinh `1995-04-20`; NV0008 "Lê Thị Hoa" không có SĐT, ngày sinh | nhìn bảng | tiêu đề cột đúng thứ tự `Mã · Họ tên · Tài khoản đăng nhập · Email · SĐT · Ngày sinh · Vai trò · Trạng thái`; hàng NV0007: cột Tài khoản `khoapv`, SĐT `0912345678`, Ngày sinh `20/04/1995`; ô Họ tên **không** còn dòng phụ username; hàng NV0008: SĐT `—`, Ngày sinh `—` | component + e2e |
| AC-EMP-106 | An ở `/employees`, mobile 390px, cùng dữ liệu | nhìn thẻ | thẻ NV0007 hiện `Tài khoản: khoapv`, `0912345678`, `Ngày sinh: 20/04/1995`; thẻ NV0008 không có dòng SĐT/ngày sinh; trang không cuộn ngang (`scrollWidth <= clientWidth`); thẻ vẫn bấm mở chi tiết (vùng chạm ≥44px) | component + e2e |
| AC-EMP-107 | An; NV0007 username `khoapv`, họ tên không chứa "khoapv" | `GET /api/v1/employees?q=khoapv` | 200; có NV0007 (tìm theo username, Q140); các cách tìm cũ (họ tên không dấu, mã, email, SĐT) vẫn chạy như trước | integration |
| AC-EMP-108 | An; 25 nhân viên (hơn 1 trang 20), gồm NV0007 đủ mọi trường hồ sơ và NV0008 chỉ có trường bắt buộc | `GET /api/v1/employees/export` | 200; `Content-Type: text/csv; charset=utf-8`; bắt đầu BOM; `Content-Disposition: attachment; filename="nhan-vien-2026-11-01.csv"` (ngày theo `Asia/Ho_Chi_Minh`); dòng 1 đúng 18 tiêu đề §2 theo thứ tự; đúng 25 dòng dữ liệu theo mã NV tăng dần (`NV0002` trước `NV0010`) | integration |
| AC-EMP-109 | NV0007: `birth_date=1995-04-20`, `birth_place="Đà Nẵng"`, `gender=MALE`, `id_number="048095001234"`, `id_issued_date=2021-06-15`, `marital_status=MARRIED`, phòng "Phát Triển Kinh Tế", chức danh "Kỹ thuật viên", vai trò `TECHNICIAN`+`TECH_LEAD`, đang hoạt động, tạo lúc `2026-10-31T17:30:00Z`; NV0008: `email=null`, đã khoá (`is_active=false`) | export | NV0007: Ngày sinh `20/04/1995`, Giới tính `Nam`, Ngày cấp `15/06/2021`, Hôn nhân `Đã kết hôn`, Phòng ban `Phát Triển Kinh Tế`, Vai trò chứa cả 2 nhãn tiếng Việt nối `, `, Trạng thái `Đang hoạt động`, Ngày tạo `01/11/2026 00:30`; NV0008: Email trống, các trường hồ sơ trống, Trạng thái `Đã khoá` | unit + integration |
| AC-EMP-110 | NV `phone="0912345678"`, `id_number="048095001234"`; NV khác `address="=HYPERLINK(\"http://x\")"`, `title="+Trưởng nhóm"` | export | SĐT và CMND/CCCD ghi dạng giữ số 0 đầu khi mở Excel (`="0912345678"`, như Q133); ô trống vẫn trống; `'=HYPERLINK(...)`, `'+Trưởng nhóm` (chống CSV injection); file không có cột/giá trị mật khẩu | unit |
| AC-EMP-111 | 3 NV: "Nguyễn Minh Tuấn" (TECH_LEAD, hoạt động), "Trần Minh Châu" (SALE, đã khoá), "Lê Thị Hoa" (SALE, hoạt động) | `?q=minh` ; `?role=SALE&is_active=true` | lần 1: đúng 2 dòng (Tuấn, Châu — tìm không dấu như `GET /employees`); lần 2: chỉ "Lê Thị Hoa" | integration |
| AC-EMP-112 | Tuấn (TECH_LEAD — có `employee.read` nhưng không `employee.manage`), Hoa (SALE), Mai (CUSTOMER_CARE), Khoa (TECHNICIAN) | `GET /employees/export` | 403 `FORBIDDEN` (capability `employee.manage`, Q141) | integration + generated |
| AC-EMP-113 | Chưa đăng nhập | `GET /employees/export` | 401 | integration |
| AC-EMP-114 | An | `?q=` dài 101 ký tự; `?role=FOO`; `?is_active=abc` | 422 `VALIDATION_ERROR` (cùng luật tham số với `GET /employees`) | integration |
| AC-EMP-115 | An; không NV nào khớp `q=zzzz` | export | 200; chỉ BOM + dòng tiêu đề, 0 dòng dữ liệu | integration |
| AC-EMP-116 | An ở `/employees` desktop 1440px; gõ tìm "Minh", lọc vai trò "Sale", trạng thái "Đang hoạt động", đang ở trang 2 | nhìn thanh nút | có nút "Xuất Excel" (icon `Download`, cao ≥44px) cạnh "Thêm nhân viên"; `href` = `/api/v1/employees/export?q=Minh&role=SALE&is_active=true` (không `limit`/`offset`); bỏ lọc → `/api/v1/employees/export` | component + e2e |
| AC-EMP-117 | (a) An ở `/employees` mobile 390px; (b) Tuấn (TECH_LEAD) ở `/employees` desktop 1440px | nhìn trang | (a) và (b) đều **không** có nút "Xuất Excel" | component + e2e |
| AC-EMP-118 | An ở `/employees` desktop trên stack thật, có NV seed | bấm "Xuất Excel" | trình duyệt tải `nhan-vien-<ngày VN>.csv`; 3 byte đầu là BOM; dòng 1 bắt đầu `Mã NV,Họ tên,Tài khoản đăng nhập`; vẫn ở `/employees` | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/employees | employee.read (không đổi) | thêm: `q` khớp cả `username` | `EmployeePage` (không đổi) | — |
| GET | /api/v1/employees/export | employee.manage | query `q` (≤100), `role`, `is_active` — giống `GET /employees`, không `limit`/`offset` | `text/csv; charset=utf-8` (BOM), `Content-Disposition: attachment` | 401, 403, 422 |

Ghi chú cài đặt: route `/export` khai báo **trước** `/{employee_id}`. Tách phần dựng `where` của `service.list_employees` ra dùng chung cho list + export. Helper CSV (`_text`, `_number_text`, `_day`, `_moment`, BOM) của `customers/export.py` được gom vào module dùng chung (vd. `app/core/csv_export.py`) — không đổi hành vi export khách hàng (test M20-05 vẫn xanh). Không đổi `spec/permissions.yaml` → không cần `make contract` cho quyền (quy tắc 13 không áp dụng).

## 5. Dữ liệu / Migration
Không có. Chỉ đọc `employees` + `employee_roles` + `departments`.

## 6. UI
- `features/employees/components/EmployeeList.tsx`: bảng desktop thêm cột "Tài khoản đăng nhập" và "Ngày sinh" (bỏ dòng username dưới họ tên); thẻ mobile thêm nhãn "Tài khoản:" và dòng "Ngày sinh:".
- `features/employees/pages/EmployeesPage.tsx`: `<a>` "Xuất Excel" (`Download`, kiểu nút phụ), `hidden lg:inline-flex`, chỉ render khi có `employee.manage`; `href={employeesExportUrl({ q, role, is_active })}` (hàm mới trong `features/employees/api.ts`, mẫu `customersExportUrl`, bỏ tham số rỗng).
- Không có trạng thái loading/lỗi riêng (trình duyệt tự tải).
- Copy: cột "Tài khoản đăng nhập", "Ngày sinh"; thẻ "Tài khoản: …", "Ngày sinh: …"; nút "Xuất Excel".

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager trên máy tính, vào **Nhân sự** → thấy cột "Tài khoản đăng nhập", "SĐT", "Ngày sinh".
2. Gõ tên đăng nhập của một nhân viên vào ô Tìm → ra đúng người đó.
3. Bấm "Xuất Excel" → mở bằng Excel: đúng dấu tiếng Việt, đủ 18 cột, SĐT/CCCD còn số 0 đầu, đủ mọi nhân viên (không chỉ 20 người trang đầu).
4. Lọc vai trò "Sale" rồi xuất lại → file chỉ còn Sale.
5. Mở trên điện thoại → thẻ hiện "Tài khoản: …", không có nút "Xuất Excel".

## 8. Giả định & câu hỏi
- Giả định (Q100 đã chốt): "Excel" = CSV UTF-8 BOM. Giữ số 0 đầu theo cách Q133 (M20-05), áp cho SĐT và CMND/CCCD.
- **Q140 (mới):** Ô tìm trên trang Nhân sự hiện không tìm theo tên đăng nhập. Mặc định: thêm khớp `username` (vì giờ là cột riêng, Manager hay tra theo tài khoản). Ô chọn nhân viên ở màn đơn hàng (`/employees/lookup`) **không** đổi.
- **Q141 (mới):** Ai được xuất danh sách nhân viên? File có CMND/CCCD, địa chỉ, ngày sinh — dữ liệu cá nhân nhạy cảm. Mặc định: **chỉ Manager** (dùng capability sẵn có `employee.manage`, không sửa YAML); QLKT vẫn xem danh sách/chi tiết như cũ nhưng không xuất (403, không thấy nút). Nếu muốn QLKT cũng xuất được → dùng `employee.read` thay vì `employee.manage`.
- Giả định: không xuất trạng thái "Tạm khoá đăng nhập" (khoá tạm do sai mật khẩu — thông tin vận hành, không phải hồ sơ) và không xuất "Ngày cập nhật".
