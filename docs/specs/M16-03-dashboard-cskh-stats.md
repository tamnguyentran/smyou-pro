# M16-03 — Dashboard: thẻ thống kê CSKH (KH đã chăm sóc, NV gọi điện, đơn phải sửa)

- **Status:** Approved (2026-10-24, chủ dự án chốt câu hỏi nghiệp vụ trực tiếp trong phiên — xem mục 8)
- **Backlog:** M16-03 · **Milestone:** M16
- **Liên quan:** `docs/specs/M15-04-dashboard-top-customers-feedback.md` (khối "Phản hồi – đánh giá KH" đặt ngay sau khối này); M15-02a (`csat_rating`/`csat_recorded_by`); `spec/state_machines.yaml` (`order_revisions`/`request_revision`); `spec/permissions.yaml#dashboard.read`

## 1. Mục tiêu
Là Manager/Quản lý kỹ thuật/Sale/CSKH, tôi muốn thấy ngay trên "Tổng quan" số khách hàng đã được chăm sóc, số nhân viên CSKH đang hoạt động, và số đơn phải sửa trong tháng, để nắm nhanh hiệu suất chăm sóc khách hàng và chất lượng đơn hàng.

## 2. Phạm vi
- Trong phạm vi: `GET /api/v1/dashboard` thêm 3 trường mới vào response, hiện khi actor có **bất kỳ** vai trò trong `MANAGER/TECH_LEAD/SALE/CUSTOMER_CARE` (cùng điều kiện với `top_customers`/`feedback_summary` hiện có — tái dùng `_DASHBOARD_ROLES_FOR_CUSTOMER_SECTIONS`):
  - `care_summary` — `{"today": n, "month": m}`: số **đơn hàng** có `csat_recorded_at` rơi vào hôm nay / tháng hiện tại (giờ VN). Đây là proxy cho "khách đã được chăm sóc" vì hệ thống chưa có log gọi điện riêng — mỗi đơn tính 1 lần dù khách hàng trùng nhau giữa các đơn.
  - `care_staff_count` — số nhân viên **duy nhất** (`csat_recorded_by`) đã ghi CSAT cho ít nhất 1 đơn trong tháng hiện tại.
  - `orders_needing_revision_count` — số **đơn hàng duy nhất** có ít nhất 1 dòng `order_revisions.requested_at` trong tháng hiện tại (đếm theo đơn, không đếm theo số lần yêu cầu sửa nếu 1 đơn bị yêu cầu sửa nhiều lần trong cùng tháng).
  - 3 thẻ UI mới chèn vào trang "Tổng quan", **ngay trước** khối "Phản hồi – đánh giá từ khách hàng" (M15-04): "Khách hàng đã chăm sóc" (2 số: hôm nay/tháng này), "NV đã gọi điện CSKH (tháng này)", "Đơn hàng phải sửa (tháng này)".
- Ngoài phạm vi: log chi tiết từng lần gọi điện/chăm sóc (cần model mới, không làm trong item này); bộ lọc ngày tuỳ chọn cho dashboard (giữ nguyên "tháng hiện tại" cố định như M15-04).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-DASH-060 | Tháng hiện tại có 8 đơn ghi CSAT, trong đó 2 đơn ghi CSAT hôm nay | An (MANAGER) `GET /api/v1/dashboard` | `care_summary = {"today": 2, "month": 8}` | integration |
| AC-DASH-061 | Tháng này có 3 NV CSKH khác nhau ghi CSAT cho các đơn khác nhau, 1 NV ghi CSAT cho 2 đơn | Lan (CUSTOMER_CARE) `GET /api/v1/dashboard` | `care_staff_count = 3` (không đếm trùng NV) | integration |
| AC-DASH-062 | Tháng này có 2 đơn có `order_revisions`, 1 trong 2 đơn bị yêu cầu sửa 2 lần trong tháng | Tuấn (TECH_LEAD) `GET /api/v1/dashboard` | `orders_needing_revision_count = 2` (đếm theo đơn, không theo số lần yêu cầu) | integration |
| AC-DASH-063 | Đức (TECHNICIAN, không có vai trò khác) | `GET /api/v1/dashboard` | Response không có 3 khoá `care_summary`/`care_staff_count`/`orders_needing_revision_count` | integration |
| AC-DASH-064 | An (MANAGER) mở "Tổng quan" trên desktop (1440px) | render | Thấy 3 thẻ mới (Khách hàng đã chăm sóc, NV gọi điện CSKH, Đơn phải sửa) ngay trước khối "Phản hồi – đánh giá từ khách hàng" | component |
| AC-DASH-065 | Lan (CUSTOMER_CARE) mở "Tổng quan" trên mobile (390px) | render | 3 thẻ xếp dọc/lưới phù hợp 390px, không vỡ layout, không đè lên khối Phản hồi | component |

## 4. API
| Method | Path | Capability | Thay đổi |
|---|---|---|---|
| GET | /api/v1/dashboard | dashboard.read | Thêm `care_summary`, `care_staff_count`, `orders_needing_revision_count` vào response khi vai trò phù hợp (§2); không đổi bảng quyền (dùng đúng điều kiện role đã có của `top_customers`) |

## 5. Dữ liệu / Migration
Không có (dùng lại `orders.csat_recorded_at`, `orders.csat_recorded_by` từ M15-02a và `order_revisions` đã có từ M6-03a).

## 6. UI
- 3 thẻ mới chèn vào trang "Tổng quan", ngay trước khối "Top 10 khách hàng" + "Phản hồi – đánh giá từ khách hàng" (M15-04), cùng hàng lưới thống kê hiện có.
- Copy: "Khách hàng đã chăm sóc" (phụ đề: "Hôm nay: n · Tháng này: m"), "NV đã gọi điện CSKH (tháng này)", "Đơn hàng phải sửa (tháng này)".

## 7. Kịch bản UAT thủ công
1. Seed vài đơn `COMPLETED` có `csat_recorded_at`/`csat_recorded_by` khác nhau trong ngày và trong tháng hiện tại; seed 1-2 `order_revisions` trong tháng.
2. Đăng nhập Manager/CSKH/Sale/QLKT → Tổng quan → thấy đúng 3 thẻ mới với số liệu khớp dữ liệu seed, nằm trước khối Phản hồi.
3. Đăng nhập Kỹ thuật viên thuần → không thấy 3 thẻ này.

## 8. Giả định & câu hỏi
Chủ dự án đã chốt trực tiếp trong phiên làm việc (2026-10-24), không cần ghi vào `OPEN_QUESTIONS.md`:
- "KH đã chăm sóc" = số đơn có `csat_recorded_at` trong ngày/tháng (không phải số khách hàng duy nhất) — vì hệ thống chưa có log chăm sóc/gọi điện riêng, CSAT là proxy duy nhất hiện có.
- "NV đã gọi điện CSKH" = số NV duy nhất có `csat_recorded_by` trong tháng (không filter theo vai trò hiện tại của NV đó, vì cột không lưu role tại thời điểm ghi) — cũng là proxy từ CSAT, không phải log gọi điện thật.
- "Đơn phải sửa" = số đơn duy nhất có `order_revisions.requested_at` trong tháng (không phải số đơn đang ở trạng thái `REVISION` tại thời điểm xem).
- Vai trò xem: giữ đúng `_DASHBOARD_ROLES_FOR_CUSTOMER_SECTIONS` đã có (MANAGER/TECH_LEAD/SALE/CUSTOMER_CARE) để đồng bộ với khối Phản hồi liền kề, không tạo rule quyền riêng.
