# M15-09b — Báo cáo Doanh thu theo khách hàng — Giao diện

- **Status:** Superseded by `docs/specs/M16-06-revenue-by-customer-line-based.md` (2026-10-24) — UI này cần cập nhật theo trục nhóm mới (xem M16-06 §6); ACs dưới đây giữ nguyên làm lịch sử, không còn enforce coverage
- **Backlog:** M15-09b · **Milestone:** M15
- **Liên quan:** M15-09a (API `GET /api/v1/reports/revenue-by-customer`, `.../{customer_id}/orders`, `.../export`); `docs/specs/M8-01b-kpi-report-ui.md` (mẫu màn báo cáo: bộ lọc, nút xuất file qua URL trực tiếp dùng session cookie, `StatusPage` lỗi chung, route guard theo capability); `docs/design/UI_GUIDELINES.md`; `docs/product/OPEN_QUESTIONS_ARCHIVE.md` Q88/Q96 (scope `own` cho SALE/CUSTOMER_CARE, tách dòng theo người bán)

## 1. Mục tiêu
Là Manager/Sale/QLKT/CSKH, tôi muốn xem báo cáo doanh thu theo khách hàng dưới dạng bảng có thể lọc, bấm vào từng dòng để xem đơn, bấm vào đơn để xem dòng hàng, và xuất file.

## 2. Phạm vi
- **Trong phạm vi:**
  - Trang `/reports/revenue-by-customer` (route mới, tự kiểm `report.revenue.read` giống cách `/reports/kpi` tự kiểm `kpi.read` — **không** có mục menu ở item này, menu gộp làm ở M15-11):
    - Bộ lọc đầu trang: "Từ ngày"/"Đến ngày" (mặc định đầu tháng hiện tại → hôm nay, giờ VN, cùng mẫu `KpiFilters`), ô tìm khách hàng (autocomplete dùng lại `useCustomers` — xem "Ghi chú kỹ thuật" §8, **không** phải component `CustomerPicker` của M3 vì component đó gắn liền form tạo đơn/react-hook-form) mặc định rỗng = "Tất cả", toggle trạng thái "Đã hoàn tất"/"Chưa xong" mặc định "Đã hoàn tất" (`status=COMPLETED`/`NOT_COMPLETED`).
    - Bảng kết quả, mỗi dòng là 1 cặp (khách hàng × người bán) đúng như API trả (Q88/Q96: 1 khách hàng có nhiều Sale tạo đơn → nhiều dòng): mã KH, tên KH, người liên hệ + SĐT, người bán (mã + tên), số đơn, doanh thu, lợi nhuận.
    - Cột "Lợi nhuận" hiện "—" (không phải "0 ₫") khi `profit = null` (thiếu giá vốn snapshot ở ≥1 đơn trong nhóm), kèm tooltip "Một số dòng hàng chưa có giá vốn tại thời điểm tạo đơn."
    - Click 1 dòng → mở drilldown cấp 1 (sheet/dialog): danh sách đơn **đúng cặp khách hàng × người bán đã bấm** (gọi API kèm cả `customer_id` và `seller_id` của dòng đó — không chỉ `customer_id`, để số đơn khớp đúng `order_count` hiển thị ở bảng chính), cùng khoảng ngày/trạng thái đang lọc. Tiêu đề drilldown: "`<tên KH>` — Người bán: `<tên NV>`".
    - Click 1 đơn trong drilldown cấp 1 → mở drilldown cấp 2: bảng dòng hàng chi tiết của đơn đó, đọc từ `GET /api/v1/orders/{order_id}` (`OrderDetail.lines` — **không có** route `GET /orders/{id}/lines` riêng; xem yêu cầu đổi schema ở §4). Bảng chỉ đọc (không có nút sửa/xoá dòng) — viết component mới, không tái dùng `OrderLinesSection` (component đó gắn liền hook ghi dữ liệu `useUpdateLine`/`useRemoveLine`, không hợp để nhúng vào màn báo cáo chỉ đọc).
    - Nút "Xuất Excel" (tải CSV theo M15-09a, giữ nhãn "Xuất Excel" vì file có BOM mở đúng bằng Excel) — điều hướng trình duyệt tới URL export kèm tham số lọc hiện tại, cùng cơ chế session cookie đã dùng ở M8-01b (`kpiExportUrl`), không qua `fetch`+`Blob`.
    - Trống (0 dòng khớp bộ lọc — vd lọc trúng khách hàng ngoài scope `own` của Sale/CSKH, hoặc khoảng ngày không có đơn): `EmptyState` chung, không coi là lỗi.
    - Tải: skeleton bảng/card khi đang gọi API.
    - Lỗi API (mạng/5xx, hoặc 422 "Từ ngày" > "Đến ngày"): `StatusPage` lỗi chung + nút "Tải lại" cho lỗi mạng/5xx; banner lỗi validation cho 422 (không tự chặn ở client, để server trả 422 — cùng cách AC-KPI-020).
    - **Không có khác biệt UI theo vai trò** cho scope `own` (SALE/CUSTOMER_CARE) so với scope `all` (MANAGER/TECH_LEAD) — cùng 1 bảng/bộ lọc, chỉ dữ liệu trả về khác do backend đã lọc theo scope (M15-09a).
- **Ngoài phạm vi (không làm ở item này):**
  - Menu điều hướng tới trang này (M15-11).
  - Lọc theo người bán ở màn chính (bảng đã tách dòng theo người bán, không cần ô lọc riêng).
  - Sắp xếp theo cột khác thứ tự API trả (mã KH, tên người bán).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-RPT-010 | An (MANAGER) mở `/reports/revenue-by-customer` lần đầu, chưa đổi bộ lọc | render | Gọi `GET /api/v1/reports/revenue-by-customer?from=<đầu_tháng>&to=<hôm_nay>&status=COMPLETED` (giờ VN); ô "Từ ngày"/"Đến ngày" hiện đúng 2 giá trị mặc định, ô khách hàng rỗng = "Tất cả", toggle = "Đã hoàn tất" | component |
| AC-RPT-011 | Bảng có dòng `KH00001` / người bán Hoa (`seller.id`), `order_count=3` | Bấm vào dòng đó | Gọi `GET /api/v1/reports/revenue-by-customer/{KH00001.id}/orders?from=...&to=...&status=...&seller_id=Hoa.id`; mở drilldown tiêu đề "`KH00001` — Người bán: Hoa", hiện đúng 3 đơn | component |
| AC-RPT-012 | Drilldown cấp 1 đang mở, có đơn `DH2609-0010` (id biết trước) | Bấm vào đơn đó | Gọi `GET /api/v1/orders/{DH2609-0010.id}` (không gọi route `/lines` vì không tồn tại); mở drilldown cấp 2 hiện đúng `OrderDetail.lines` (tên sản phẩm/dịch vụ, số lượng, đơn giá, giảm giá, VAT, thành tiền), chỉ đọc — không có nút sửa/xoá | component |
| AC-RPT-013 | Dòng khách hàng có `profit = null` | render bảng | Cột "Lợi nhuận" hiện "—" + tooltip "Một số dòng hàng chưa có giá vốn tại thời điểm tạo đơn.", không hiện "0 ₫" | component |
| AC-RPT-014 | Bộ lọc hiện tại: `from=2026-10-01`, `to=2026-10-23`, `status=COMPLETED`, khách hàng = "Tất cả" | Bấm "Xuất Excel" | Trình duyệt điều hướng tới `GET /api/v1/reports/revenue-by-customer/export?from=2026-10-01&to=2026-10-23&status=COMPLETED` (đúng tham số đang lọc, không phải toàn bộ dữ liệu); không rời khỏi trang (giống `kpiExportUrl`, không `fetch`+`Blob`) | e2e |
| AC-RPT-015 | Màn này trên mobile (390px), API trả 2 dòng | render | Bộ lọc xếp dọc full-width; bảng chuyển dạng thẻ (1 thẻ/dòng khách hàng×người bán, các cột còn lại thu gọn thành danh sách nhãn-giá trị) | component |
| AC-RPT-016 | Hoa (SALE, scope `own`) lọc khách hàng = `KH00009` (khách hàng có tồn tại nhưng không có đơn nào do Hoa tạo trong khoảng lọc) | render | API trả `items=[]`; `EmptyState` chung ("Không có dữ liệu phù hợp"), không hiện lỗi | component |
| AC-RPT-017 | Đức (TECHNICIAN, không có `report.revenue.read`) | thử mở `/reports/revenue-by-customer` trực tiếp bằng URL | Trang 403 chung (route guard theo capability, giống `AC-KPI-025`) | component |
| AC-RPT-018 | Bất kỳ vai trò hợp lệ; API lỗi mạng/5xx | render | `StatusPage` lỗi chung, nút "Tải lại" | component |
| AC-RPT-019 | An đổi "Từ ngày" thành ngày sau "Đến ngày" rồi rời focus | gọi lại API | Server trả 422 (`VALIDATION_ERROR`, field `from`); UI hiện banner lỗi chung (không tự validate ở client trước khi gọi API) | component |

## 4. API
Không có route mới — dùng `GET /reports/revenue-by-customer`, `.../{customer_id}/orders` (thêm `seller_id` — param đã có sẵn ở M15-09a, chưa được item nào dùng tới nay), `.../export` (M15-09a), và `GET /orders/{id}` đã có (M3-01) để lấy `OrderDetail.lines` cho drilldown cấp 2.

**Yêu cầu đổi nhỏ ở `M15-09a` (phát hiện khi viết spec này):** `RevenueOrderOut` (`backend/app/modules/revenue_report/schemas.py`) hiện chỉ có `code`, `created_at`, `completed_at`, `total`, `profit` — **thiếu `id`**, nên UI không có cách gọi `GET /orders/{order_id}` cho drilldown cấp 2. Thêm trường `id: uuid.UUID` vào `RevenueOrderOut` (chỉ thêm field, không đổi route/behaviour — không cần migration, chạy lại `make contract` để sinh lại OpenAPI + TS types). Làm trong `/implement M15-09b` cùng lúc với UI, không cần spec riêng vì không đổi quy tắc nghiệp vụ.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Theo mẫu bộ lọc/route-guard/export-URL của `/reports/kpi` (M8-01b) để nhất quán.
- Ô tìm khách hàng: autocomplete gọi `useCustomers` (đã có ở `features/customers/api.ts`, dùng lại logic tìm kiếm debounce như `CustomerPicker`, không tái dùng chính component đó).
- Bảng desktop dùng style bảng chung của dự án (như trang Nhân sự `M1-04b`); cột số căn phải.
- Drilldown: `Dialog`/`Sheet` component sẵn có của dự án (kiểm `components/ui` lúc implement), không điều hướng sang URL riêng.
- Copy: nút "Xuất Excel", tooltip lợi nhuận như §3, toggle "Đã hoàn tất"/"Chưa xong", tiêu đề drilldown "`<tên KH>` — Người bán: `<tên NV>`".
- Icon `lucide-react`: `Download` (xuất Excel), `Search` (ô tìm khách hàng).

## 7. Kịch bản UAT thủ công
1. Mở trang, xem mặc định đúng, đổi khoảng ngày → bảng cập nhật.
2. Bấm vào 1 dòng khách hàng × người bán → thấy đúng số đơn khớp cột "Số đơn" → bấm vào 1 đơn → thấy dòng hàng chi tiết, không có nút sửa.
3. Bấm "Xuất Excel" → mở file bằng Excel, dấu tiếng Việt đúng, đúng tham số lọc đang chọn.
4. Đăng nhập Sale → chỉ thấy đơn/khách hàng do chính mình tạo.

## 8. Giả định & câu hỏi
- Đổi nhỏ ở `M15-09a` nêu ở §4 (thêm `id` vào `RevenueOrderOut`) không coi là đổi quy tắc nghiệp vụ, không cần hỏi qua `OPEN_QUESTIONS.md` — chỉ là field còn thiếu để UI gọi được API đã có sẵn (`GET /orders/{id}`).
- Không có giả định nghiệp vụ mới ngoài M15-09a (Q88/Q96 đã chốt).
