# M11-02a — Lan style thẻ (bỏ viền, p-5) ra thẻ mobile của 5 trang danh sách

- **Status:** Done
- **Backlog:** M11-02a · **Milestone:** M11
- **Liên quan:** `docs/design/UI_GUIDELINES.md` §1.1 (nguyên tắc card không viền, trừ bảng/input/thẻ tô màu trạng thái — đã chốt ở M11-01), `docs/specs/M11-01-ui-card-style-refresh.md` (mẫu đã duyệt). Không đụng `spec/*.yaml`, không đổi API/DB/phân quyền.

## 1. Mục tiêu
Là chủ dự án, tôi muốn thẻ danh sách trên điện thoại (Đơn hàng, Khách hàng, Nhân viên, Sản phẩm, Dịch vụ) có cùng style "nổi bằng bóng mờ, không viền, khoảng trắng rộng hơn" như 4 component mẫu đã duyệt ở M11-01, để toàn app nhất quán.

## 2. Phạm vi
- Trong phạm vi — đúng 1 đoạn `className` (nút/thẻ `<li>` ở layout mobile) mỗi file, bỏ `border border-line`, giữ `shadow-card`/`hover:shadow-card-hover`, tăng `p-4` → `p-5`:
  1. `frontend/src/features/orders/components/OrderList.tsx` (dòng ~108, nút thẻ đơn hàng mobile)
  2. `frontend/src/features/customers/components/CustomerList.tsx` (dòng ~73)
  3. `frontend/src/features/employees/components/EmployeeList.tsx` (dòng ~94)
  4. `frontend/src/features/products/components/ProductList.tsx` (dòng ~121)
  5. `frontend/src/features/services/components/ServiceList.tsx` (dòng ~84)
- **Không đụng `<table>` desktop của 5 trang trên** — bảng dữ liệu vẫn giữ `border border-line` theo đúng ngoại lệ "bảng" ở UI_GUIDELINES §1.1.
- **Không đụng** badge trạng thái, ảnh sản phẩm (`ImageUploadField`/placeholder ảnh trong `ProductList` vẫn giữ viền — không phải "card" nổi).
- Ngoài phạm vi (các item sau, M11-02b/c…): màn hình chi tiết đơn hàng (`OrderDetailTabs`, `OrderInfoTab`, `OrderHistoryTab`, `OrderTasksTab`, `ConfirmationAttachmentsTab`), điều phối (`DispatchQueueList`, `WorkloadList`), nhật ký (`AuditEventList`), KPI còn lại (`KpiRows`), Việc của tôi (`MyAssignmentList`), trang form đơn lẻ (Đăng nhập, Đổi mật khẩu, Hồ sơ cá nhân).

## 3. Acceptance Criteria
> Thuần UI, không đổi API/quyền/trạng thái — không có AC 403/404/409/422. Kiểm chứng bằng class CSS render ra + test không-hồi-quy hiện có (component, e2e, lint).

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-UI-008 | `OrderList` render ≥1 đơn, viewport mobile | render | nút thẻ đơn hàng gốc có `shadow-card`, `hover:shadow-card-hover`, `p-5`; **không** có class `border`/`border-line`; bấm vẫn điều hướng chi tiết đúng 1 lần (không hồi quy AC-ORD-107/108/109) | component |
| AC-UI-009 | `OrderList` render, viewport desktop | render | `table` gốc **vẫn giữ** `border border-line` (không đổi) | component (regression) |
| AC-UI-010 | `CustomerList` render ≥1 khách hàng, viewport mobile | render | nút thẻ khách hàng gốc có `shadow-card`, `p-5`; không còn `border`/`border-line`; `table` desktop vẫn giữ `border border-line` | component |
| AC-UI-011 | `EmployeeList` render ≥1 nhân viên, viewport mobile | render | nút thẻ nhân viên gốc có `shadow-card`, `p-5`; không còn `border`/`border-line`; `table` desktop vẫn giữ `border border-line` | component |
| AC-UI-012 | `ProductList` render ≥1 sản phẩm, viewport mobile | render | nút thẻ sản phẩm gốc có `shadow-card`, `p-5`; không còn `border`/`border-line` ở chính nút thẻ; khung ảnh/placeholder ảnh sản phẩm **vẫn giữ** `border border-line` (không đổi); `table` desktop vẫn giữ `border border-line` | component |
| AC-UI-013 | `ServiceList` render ≥1 dịch vụ, viewport mobile | render | nút thẻ dịch vụ gốc có `shadow-card`, `p-5`; không còn `border`/`border-line`; `table` desktop vẫn giữ `border border-line` | component |
| AC-UI-014 | Trang Đơn hàng, Khách hàng, Nhân viên, Sản phẩm, Dịch vụ ở 390px và 1440px (e2e hiện có: `orders.spec.ts`, `customers.spec.ts`, `employees.spec.ts`, `products.spec.ts`, `services.spec.ts`) | chạy lại sau khi sửa | không có vi phạm axe-core `serious`/`critical` mới; không hồi quy điều hướng/lọc/tìm kiếm đã có | e2e |
| AC-UI-015 | `scripts/check_no_raw_colors` | chạy sau khi sửa 5 file trên | 0 vi phạm mới | lint |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Mỗi file chỉ đổi 1 class string của thẻ mobile (dạng `<li><button className="...">`), theo đúng khuôn mẫu đã dùng ở `TaskBoardCard`/`TodayTaskCard` (M11-01): bỏ `border border-line`, giữ nguyên `shadow-card`/`hover:shadow-card-hover`, `p-4` → `p-5`.
- Không đổi bố cục bên trong thẻ (vị trí tên/mã/badge/tổng tiền…), không đổi copy, không đổi màu chữ/icon, không đổi hành vi bấm/điều hướng.
- Bảng desktop (`<table>`) của cả 5 trang giữ nguyên hoàn toàn — nằm trong ngoại lệ "bảng" ở UI_GUIDELINES §1.1.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Mở trang Đơn hàng trên điện thoại (390px) — mỗi thẻ đơn không còn viền kẻ, có bóng mờ nhẹ, khoảng trắng trong thẻ rộng hơn trước; bấm vào vẫn mở chi tiết đơn như cũ.
2. Mở trang Khách hàng (390px) — tương tự, thẻ khách hàng bỏ viền.
3. Mở trang Nhân viên (390px) — thẻ nhân viên bỏ viền.
4. Mở trang Sản phẩm (390px) — thẻ sản phẩm bỏ viền ở khung ngoài, nhưng khung ảnh sản phẩm bên trong vẫn có viền mảnh như cũ (để phân tách ảnh).
5. Mở trang Dịch vụ (390px) — thẻ dịch vụ bỏ viền. Mở lại cùng 5 trang trên máy tính (1440px) — bảng dữ liệu vẫn có viền như cũ, không đổi.

## 8. Giả định & câu hỏi
- Giả định: tách `M11-02` thành nhiều item nhỏ theo khu vực UI vì tổng số file có `border-line`/`shadow-card` cần xét trên toàn app là ~20 file thuộc nhiều trang khác nhau (danh sách, chi tiết đơn, điều phối, KPI, form đơn lẻ) — vượt quá ~400 dòng non-test nếu làm chung 1 item, và mỗi khu vực có logic/markup khác nhau nên cần soát riêng để không lỡ bỏ viền ở bảng/input. `M11-02a` là lát cắt đầu: 5 trang danh sách, cùng 1 khuôn mẫu class, rủi ro thấp nhất.
- Đề xuất các item tiếp theo (chưa viết spec, sẽ `/spec` riêng sau khi `M11-02a` được duyệt/ship): `M11-02b` — màn hình chi tiết đơn hàng (các tab trong `OrderDetailTabs`); `M11-02c` — điều phối (Bảng đầu việc đã xong ở M11-01, còn `DispatchQueueList`, `WorkloadList`) + Việc của tôi (`MyAssignmentList`) + KPI còn lại (`KpiRows`) + Nhật ký (`AuditEventList`); `M11-02d` — 3 trang form đơn lẻ (Đăng nhập, Đổi mật khẩu, Hồ sơ cá nhân) nếu card của chúng cũng đang dùng viền trang trí (cần soát kỹ vì đây là form có input, dễ nhầm với ngoại lệ "input" của §1.1).
- Giả định: giữ nguyên viền của khung ảnh/placeholder ảnh trong `ProductList` vì đó là khung phân tách ảnh với nền thẻ, không phải viền trang trí của thẻ.
- Không có câu hỏi mới cần chủ dự án quyết — nguyên tắc đã chốt ở M11-01, item này chỉ áp dụng lại đúng khuôn mẫu.
