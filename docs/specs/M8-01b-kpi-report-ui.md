# M8-01b — Báo cáo KPI thô theo KTV: giao diện

- **Status:** Approved
- **Backlog:** M8-01 (tách a/b theo mẫu M6-03) · **Milestone:** M8
- **Liên quan:** `M8-01a-kpi-report-api.md` (API `GET /api/v1/kpi/report`, `GET /api/v1/kpi/report/export` — dùng nguyên, không đổi); `spec/permissions.yaml` (menu `reports`, `label: Báo cáo KPI`, `icon: BarChart3`, `path: /reports/kpi`, `capability: kpi.read` — route menu đã có sẵn từ trước, item này chỉ lắp nội dung trang); `docs/design/UI_GUIDELINES.md` (danh sách = bảng ở desktop, card dọc ở mobile — không bảng ngang trên điện thoại; `max-w-7xl mx-auto p-4 lg:p-8`); `docs/specs/M7-02-role-dashboard.md` (mẫu trang theo vai trò, `StatusPage` lỗi chung, skeleton biết trước theo vai trò từ `GET /me`); `docs/specs/M4-03b-dispatch-board-ui.md` AC-DSP-085 (mẫu bộ lọc "Từ ngày"/"Đến ngày" + nút "Xoá lọc").

## 1. Mục tiêu
Là Quản lý kỹ thuật/Quản lý, tôi mở trang "Báo cáo KPI" để xem bảng số liệu theo từng KTV trong một khoảng ngày tôi chọn, và tải file CSV để lưu/gửi báo cáo. Là kỹ thuật viên, tôi mở trang này để xem số liệu của chính mình.

## 2. Phạm vi
- **Trong phạm vi:**
  - Trang `/reports/kpi` (route + capability `kpi.read` đã gắn sẵn trong `menu.ts`, chỉ cần thêm nội dung):
    - Bộ lọc đầu trang: 2 ô chọn ngày "Từ ngày"/"Đến ngày" (mặc định 30 ngày gần nhất tính tới hôm nay, giờ VN); với MANAGER/TECH_LEAD thêm ô chọn KTV (dropdown "Tất cả KTV" + danh sách tên, tuỳ chọn) — ẩn hẳn ô này với TECHNICIAN (API tự bỏ qua, nhưng ẩn luôn ở UI cho rõ ràng, tránh gây hiểu lầm "lọc được người khác").
    - Nút "Xuất CSV" (icon `Download`) gọi thẳng `GET /api/v1/kpi/report/export` với cùng tham số lọc đang chọn (mở trình duyệt tải file, không qua `fetch` + blob trừ khi cần gắn cookie session — dùng cách đã chuẩn hoá cho tải file có auth trong dự án, xem "Ghi chú kỹ thuật").
    - MANAGER/TECH_LEAD (nhiều dòng — scope `all`): desktop (≥1024px) bảng các cột theo §4 của M8-01a (rút gọn nhãn cột); mobile (<768px) danh sách card dọc, mỗi card 1 KTV, các số liệu xếp dạng nhãn:giá trị.
    - TECHNICIAN (luôn đúng 1 dòng — scope `self`): không hiện bảng/danh sách nhiều dòng; hiện dạng thẻ số liệu cá nhân (giống khối thẻ ở `M7-02`) — không có ô chọn KTV, không cần "Xuất CSV" nổi bật nhưng vẫn cho phép (xuất ra đúng 1 dòng của mình).
    - Trống (không có KTV nào / lọc trúng 0 dòng — chỉ xảy ra khi lọc `employee_id` trúng người không còn vai trò TECHNICIAN, nhưng khi đó API đã 404 nên UI hiện lỗi, không hiện trạng thái trống rỗng riêng): không cần xử lý trạng thái "0 dòng" vì API M8-01a luôn trả ≥1 dòng/KTV đang có trong hệ thống (trừ khi chưa từng tạo KTV nào — hiện thông báo trống chung).
    - Tải: skeleton bảng/card theo đúng dạng hiển thị dự kiến (biết trước từ vai trò ở `GET /me`, giống `M7-02`).
    - Lỗi API: `StatusPage` lỗi chung + nút "Tải lại", giống `M7-02`.
- **Ngoài phạm vi (không làm ở item này):**
  - Biểu đồ/trực quan hoá số liệu — chỉ bảng/thẻ số, để sau nếu cần.
  - Sắp xếp/lọc theo cột trên bảng (vd bấm tiêu đề cột để sắp) — chỉ sắp cố định theo mã KTV như API trả về.
  - Lưu bộ lọc đã chọn giữa các lần mở trang (không có "ghi nhớ lần lọc gần nhất").

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-KPI-016 | An (MANAGER) mở `/reports/kpi` lần đầu, chưa đổi bộ lọc | render | Gọi `GET /api/v1/kpi/report?from=<hôm_nay-30>&to=<hôm_nay>` (định dạng `YYYY-MM-DD`, giờ VN); ô "Từ ngày"/"Đến ngày" hiện đúng 2 giá trị mặc định đó | component |
| AC-KPI-017 | An trên desktop (1440px); API trả 3 dòng KTV (Khoa, Minh, Lan) như `M8-01a` AC-KPI-004 | render | Bảng 3 dòng, cột: "KTV" (mã+tên), "Xong", "Đúng hạn" (vd "1/2 · 50%"), 5 cột từ chối theo lý do (nhãn ngắn "Bận"/"Ốm"/"Không đúng CM"/"Xa"/"Khác") + "Tổng", "Lỗi", "Giờ ước tính/thực tế" (vd "5 / 1.5"); Đạt (KTV đã nghỉ) có badge nhỏ "Đã nghỉ" cạnh tên (từ `is_active=false`, dữ liệu này đến từ danh sách nhân viên đã có ở `GET /employees` hoặc đánh dấu sẵn trong response KPI — xem "Ghi chú kỹ thuật") | component |
| AC-KPI-018 | An trên mobile (390px); cùng dữ liệu | render | Danh sách 3 card dọc (không bảng ngang); mỗi card: tên+mã KTV ở đầu, các dòng nhãn:giá trị bên dưới (Xong, Đúng hạn, 5 lý do từ chối + tổng, Lỗi, Giờ ước tính/thực tế) | component |
| AC-KPI-019 | An; dòng Khoa `completed_task_count=0` | render | Ô "Đúng hạn" của Khoa hiện "—" (không hiện "0/0 · 0%" gây hiểu lầm tỷ lệ 0%, khớp `on_time_rate=null`) | component |
| AC-KPI-020 | An | đổi "Từ ngày"/"Đến ngày" sang khoảng khác rồi rời focus ô cuối (hoặc bấm nút "Lọc" nếu có) | gọi lại API với tham số mới; bảng cập nhật; không tự validate "Từ ngày" > "Đến ngày" phía client — để server trả 422 và hiện banner lỗi tương ứng (tái dùng copy lỗi chung, không cần chuỗi riêng) | component |
| AC-KPI-021 | An | mở dropdown "Tất cả KTV", chọn "Khoa" | gọi lại API với `employee_id=Khoa.id`; bảng/card chỉ còn 1 dòng Khoa | component |
| AC-KPI-022 | An | bấm "Xuất CSV" (đang lọc `employee_id=Khoa.id`, khoảng ngày X) | trình duyệt tải file CSV đúng tham số đang lọc (request tới `GET /api/v1/kpi/report/export?...`); không điều hướng rời trang | e2e |
| AC-KPI-023 | Đức (TECHNICIAN) mở `/reports/kpi` | render | Không có ô chọn KTV; chỉ 1 khối thẻ số liệu của chính Đức (Xong, Đúng hạn, Lỗi, Giờ ước tính/thực tế, 5 thẻ nhỏ lý do từ chối + tổng); vẫn thấy nút "Xuất CSV" | component |
| AC-KPI-024 | Đức | bấm "Xuất CSV" | tải file CSV chỉ có 1 dòng (đúng mình), không có ô lọc KTV để đổi | e2e |
| AC-KPI-025 | Hoa (SALE, không có `kpi.read`) | thử mở `/reports/kpi` trực tiếp bằng URL | Trang 403 chung (route guard theo capability, giống các trang khác); không thấy mục "Báo cáo KPI" trong menu | component |
| AC-KPI-026 | Bất kỳ vai trò hợp lệ; API lỗi mạng/5xx | render | `StatusPage` lỗi chung, nút "Tải lại" | component |

## 4. API
Không có API mới — dùng nguyên `M8-01a`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Tiêu đề trang "Báo cáo KPI". Hàng bộ lọc ngay dưới tiêu đề: 2 ô chọn ngày (component ngày đã dùng ở `M4-03b`) + (MANAGER/TECH_LEAD) dropdown KTV + nút "Xuất CSV" (variant outline, icon `Download`) — mobile: xếp dọc full-width; desktop: 1 hàng ngang, nút "Xuất CSV" bên phải.
- Bảng desktop dùng style bảng chung của dự án (như trang Nhân sự `M1-04b`); cột số căn phải.
- Card mobile: viền nhẹ, padding theo chuẩn `UI_GUIDELINES`, chạm ≥44px cho vùng dropdown/nút.
- Badge "Đã nghỉ": tông màu trung tính (`muted`), không phải `urgent` — chỉ là thông tin, không phải cảnh báo.
- Icon dùng `lucide-react`: `Download` (xuất CSV), `Users`/`UserCog` nếu cần icon cho dropdown KTV (tuỳ chọn, không bắt buộc).

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → menu "Báo cáo KPI" → thấy bảng số liệu các KTV trong 30 ngày gần nhất.
2. Đổi "Từ ngày"/"Đến ngày" sang khoảng có dữ liệu biết trước (đối chiếu Postman/API docs) → số khớp.
3. Chọn 1 KTV cụ thể trong dropdown → bảng chỉ còn 1 dòng → bấm "Xuất CSV" → mở file, so khớp số với màn hình.
4. Đăng nhập 1 KTV → mở trang → chỉ thấy số liệu của chính mình, không có ô chọn người khác.

## 8. Giả định & câu hỏi
- Giả định: nút "Xuất CSV" điều hướng trình duyệt tới URL API trực tiếp (tải file qua session cookie hiện có) — cần xác nhận cơ chế auth hiện tại của dự án là cookie (không phải Bearer token trong header JS) để cách này hoạt động không cần thêm mã; nếu auth dùng Bearer header, phải đổi sang tải qua `fetch` + tạo `Blob URL` tạm. *Ghi chú kỹ thuật cho `/implement`*: kiểm `backend/app/core/authz.py`/cấu hình session trước khi code phần này.
- Giả định: badge "Đã nghỉ" trên dòng KTV lấy từ field `employee_is_active` của `KpiReportOut` (đã bổ sung vào `M8-01a` §4 cho đúng mục đích này).
- Không có câu hỏi nghiệp vụ mới ngoài phần kỹ thuật đã nêu — toàn bộ quy tắc số liệu đã chốt ở `M8-01a`.
