# M17-05 — Giải thích phân quyền trên trang "Nhân sự & phân quyền"

- **Status:** Approved (2026-10-30)
- **Backlog:** M17-05 · **Milestone:** M17
- **Liên quan:** `spec/permissions.yaml` (roles, capabilities, scopes — nguồn sự thật); `docs/product/PERMISSIONS.md`; `docs/specs/M15-01-customer-care-role.md` (luật Quản lý chung kèm Sale/CSKH/QLKT, không cùng KTV); `docs/specs/M1-04b-employees-ui.md`; `scripts/export_menu.py` + `backend/tests/generated/test_menu_sync.py` (mẫu sinh file từ YAML)

## 1. Mục tiêu
Là Quản lý chung (hoặc Quản lý kỹ thuật đang xem trang Nhân sự), tôi muốn đọc ngay trên trang "Nhân sự & phân quyền" phần giải thích **logic và luồng phân quyền hiện tại** (vai trò → quyền → phạm vi, ai thấy menu gì, ai được làm gì) để gán vai trò cho nhân viên đúng mà không phải hỏi lập trình viên.

## 2. Phạm vi
- Trong phạm vi:
  - Nút "Cách phân quyền hoạt động" (icon `ShieldQuestion`) ở thanh công cụ trang `/employees`, mở/đóng một khối giải thích (mặc định **đóng**).
  - Khối gồm 3 phần:
    1. **Nguyên tắc** (văn bản tĩnh, 6 ý — copy ở §6).
    2. **Luồng phân quyền** (5 bước đánh số, dạng sơ đồ dọc trên mobile, ngang từ `lg:`).
    3. **Quyền theo vai trò**: với mỗi vai trò, "Màn hình được vào" (tính từ `menu.json`) và "Thao tác được làm" kèm phạm vi — sinh **tự động** từ `spec/permissions.yaml` (không gõ tay) để không bao giờ lệch với quyền thật.
  - File sinh `frontend/src/features/employees/permissionMatrix.json` (roles + nhóm quyền + capability × role → scope), sinh bằng `make contract` như `menu.json`; test backend so khớp file với YAML.
  - Nhãn tiếng Việt cho từng capability nằm ở frontend (`permissionLabels.ts`); test bắt buộc mọi capability trong JSON đều có nhãn (thêm capability mới mà quên nhãn → test đỏ).
- Ngoài phạm vi: không đổi bất kỳ quyền/vai trò/API nào; không làm trang riêng hay menu mới; không cho sửa quyền trên giao diện (quyền vẫn chỉ đổi qua `permissions.yaml`).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-EMP-080 | `spec/permissions.yaml` hiện tại | so `permissionMatrix.json` với tài liệu sinh từ YAML | Giống hệt: có `roles` (5 vai trò + nhãn), `scopes`, `groups` (Danh mục, Nhân sự, Khách hàng, Đơn hàng, Đầu việc, Báo cáo, Hệ thống — theo thứ tự comment `# ---` trong YAML), mỗi capability có map role → scope | unit (backend) |
| AC-EMP-081 | `permissionMatrix.json` | duyệt mọi capability | Mỗi capability có nhãn tiếng Việt trong `permissionLabels.ts`; không có nhãn thừa cho capability không tồn tại | unit (frontend) |
| AC-EMP-082 | An (MANAGER) mở `/employees` | trang tải xong | Thấy nút "Cách phân quyền hoạt động" (`aria-expanded="false"`), khối giải thích **chưa** hiện | component |
| AC-EMP-083 | An ở `/employees` | bấm "Cách phân quyền hoạt động" | Khối hiện 3 tiêu đề "Nguyên tắc", "Luồng phân quyền", "Quyền theo vai trò"; nút `aria-expanded="true"`; bấm lại → khối ẩn | component |
| AC-EMP-084 | Khối đang mở, màn hình ≥ 1024px | xem "Quyền theo vai trò" | Bảng: cột đầu = tên quyền (nhóm theo module), 5 cột vai trò; ô hiện "Tất cả" / "Của mình" / "Được giao" / "Bản thân" theo scope, trống hiện "—". Vd hàng "Sửa đơn nháp": Quản lý chung "Tất cả", Nhân viên kinh doanh "Của mình", Nhân viên kỹ thuật "—" | component |
| AC-EMP-085 | Khối đang mở, màn hình 390px | xem "Quyền theo vai trò" | Có ô chọn "Vai trò" (mặc định Quản lý chung); chỉ liệt kê các quyền vai trò đó **có**, nhóm theo module, kèm nhãn phạm vi; đổi sang "Nhân viên kỹ thuật" → danh sách đổi (vd có "Nhận/từ chối/bắt đầu/xong việc được giao — Bản thân", không có "Tạo đơn"). Trang không cuộn ngang | component + e2e (mobile) |
| AC-EMP-086 | Hoa (TECH_LEAD, chỉ có `employee.read`) mở `/employees` | bấm nút giải thích | Vẫn xem được khối giải thích (chỉ là tài liệu đọc); không có nút "Thêm nhân viên" như trước | component |
| AC-EMP-087 | Khối đang mở | xem "Nguyên tắc" | Có câu về luật Quản lý chung: "Tick Quản lý chung sẽ tự kèm Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật và không thể đồng thời là Nhân viên kỹ thuật." | component |
| AC-EMP-088 | Khối đang mở, chọn vai trò (ô chọn trên mobile / cột trên desktop) | xem mục "Màn hình được vào" của vai trò đó | Danh sách màn hình tính từ `menu.json` (mục menu có capability vai trò đó nắm giữ, theo cấu trúc 2 cấp). Vd Nhân viên kỹ thuật: "Tổng quan", "Việc của tôi", "Báo cáo › Báo cáo KPI" — không có "Đơn hàng", "Điều phối kỹ thuật"; Nhân viên kinh doanh có "Đơn hàng › Khách hàng", không có "Danh mục" | component |
| AC-EMP-089 | Vai trò "Quản lý chung" được chọn | xem quyền & màn hình | Hiển thị **hợp quyền** của Quản lý chung + 3 vai trò tự kèm (Sale, CSKH, QLKT), có ghi chú "Gồm cả quyền của Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật (tự kèm)" — vd có "Điều phối kỹ thuật" trong màn hình được vào | component |
| AC-EMP-090 | Thêm 1 capability giả vào bản sao `permissions.yaml` trong test | sinh lại tài liệu ma trận | Test nhãn (AC-EMP-081) đỏ cho tới khi có nhãn — chứng minh mọi thay đổi quyền buộc phải hiện trên trang | unit (frontend) |

## 4. API
Không có API mới. Dữ liệu lấy từ file JSON tĩnh đóng gói cùng frontend.

## 5. Dữ liệu / Migration
Không có. Thêm `permission_matrix_document()` cạnh `menu_document()` trong `backend/app/core/spec_loader.py`, script xuất JSON, và thêm bước vào `make contract` (cùng kiểm tra `git diff --exit-code`).

## 6. UI
- Vị trí: thanh công cụ trang Nhân sự, cạnh "Thêm nhân viên" (Manager) — nút `variant="secondary"`, cao ≥ 44px. Khối mở ra nằm **trên** danh sách nhân viên, thẻ bo góc, nền `card`.
- **Nguyên tắc** (copy chính xác):
  1. Mỗi nhân viên có một hoặc nhiều **vai trò**. Vai trò quyết định **quyền** (được làm gì) và **phạm vi** (trên dữ liệu nào).
  2. Có nhiều vai trò thì được **cộng gộp** quyền; phạm vi rộng hơn được ưu tiên (Tất cả > Của mình / Được giao).
  3. Tick Quản lý chung sẽ tự kèm Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật và không thể đồng thời là Nhân viên kỹ thuật.
  4. Menu chỉ hiện mục mà người dùng có quyền. Quyền được kiểm tra lại ở máy chủ mỗi lần thao tác, nên ẩn menu không phải là cách duy nhất chặn truy cập.
  5. Dữ liệu ngoài phạm vi sẽ báo "không tìm thấy"; thiếu quyền sẽ báo "không có quyền".
  6. Hệ thống luôn giữ ít nhất 1 Quản lý chung đang hoạt động. Tài khoản bị khoá không đăng nhập được; mở khoá thì quyền trở lại như cũ.
- **Giải thích phạm vi** (ngay dưới bảng): Tất cả = mọi bản ghi · Của mình = bản ghi mình tạo (đơn, khách hàng) hoặc dòng hàng ghi doanh số cho mình (báo cáo doanh thu) · Được giao = đơn/đầu việc mình đang hoặc từng được giao · Bản thân = chỉ dữ liệu của chính mình.
- **Luồng phân quyền** (5 bước): ① Quản lý chung thêm nhân viên & tick vai trò → ② Hệ thống tính quyền = hợp quyền các vai trò → ③ Nhân viên đăng nhập, menu hiện theo quyền → ④ Mỗi thao tác, máy chủ kiểm tra quyền + phạm vi → ⑤ Mọi đổi vai trò/khoá/mở khoá được ghi Nhật ký hệ thống.
- Mobile (390px): ô chọn vai trò + danh sách; ≥ `lg:`: bảng đầy đủ (cột đầu dính trái nếu bảng rộng hơn khung, cuộn ngang **trong** khung bảng).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → menu Thông tin Công ty → Nhân sự & phân quyền.
2. Bấm "Cách phân quyền hoạt động" → đọc Nguyên tắc, Luồng, Bảng quyền.
3. Trên điện thoại: chọn lần lượt từng vai trò, kiểm tra danh sách quyền đúng như thực tế công ty dùng.
4. Bấm lại nút → khối đóng.

## 8. Giả định & câu hỏi
- **Quy tắc duy trì (chủ dự án yêu cầu 2026-10-30):** mọi thay đổi logic phân quyền (`spec/permissions.yaml`, luật gán vai trò, luật phạm vi trong `backend/app/core/authz.py`/scope rules) phải cập nhật khối này **trong cùng thay đổi**: bảng quyền + màn hình tự sinh lại qua `make contract`; nhãn mới ở `permissionLabels.ts`; câu chữ Nguyên tắc/Luồng nếu luật đổi. Ghi trong `CLAUDE.md` quy tắc 13.
- Ghi nhận khi rà soát, chưa đổi: CSKH không có `notification.read` (Q115); CSKH tạo được đơn nháp nhưng không có `order.submit` (Q116). Khối giải thích hiển thị đúng như quyền đang chạy.
- Giả định: khối mặc định đóng (không chiếm chỗ danh sách nhân viên); không nhớ trạng thái mở/đóng giữa các lần vào trang.
- Giả định: Quản lý kỹ thuật (đang được xem trang này, Q36) cũng xem được phần giải thích.
- Giả định: nhãn từng quyền do em viết theo nghĩa nghiệp vụ hiện tại (vd `order.edit_contact` → "Sửa SĐT/địa chỉ/ghi chú đơn sau khi gửi"); anh/chị xem danh sách nhãn trong UAT, chỉnh câu chữ nếu cần — không đổi quyền.
