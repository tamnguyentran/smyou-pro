# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `DASH` (dashboard), `KPI`, `UI` (style thuần, xuyên module, không đổi API/quyền).

## M28 — Giao việc: giá trị mặc định khi tạo đầu việc (2026-11-08)
- `[~]` M28-01 — "Tiêu đề đầu việc" điền sẵn 100 ký tự đầu, "Mô tả" chép đầy đủ "Mô tả công việc" của đơn, mọi lần tạo đầu việc. `docs/specs/M28-01-task-title-from-work-description.md` (4 AC; Q193).
- `[~]` M28-02 — "Hạn hoàn thành" mặc định = bây giờ + giờ ước tính, trong giờ làm 8–12/13–17, Thứ 2–Thứ 7, làm tròn lên 15 phút. `docs/specs/M28-02-task-due-default-working-hours.md` (8 AC; Q194).

## M27 — Chăm sóc khách hàng: ghi nhận cuộc gọi (2026-11-08)
- `[~]` M27-01a — API cuộc gọi CSKH (`customer_care_calls`), yêu cầu của khách → tiềm năng dùng chung; 2 capability mới. `docs/specs/M27-01a-customer-care-calls-api.md` (10 AC; Q189–Q192).
- `[~]` M27-01b — UI trang "Chăm sóc KH" (menu Đơn hàng, sau Khách hàng), sheet ghi cuộc gọi + thêm khách mới, danh sách + lọc. `docs/specs/M27-01b-customer-care-calls-ui.md` (10 AC). Phụ thuộc M27-01a.

## M26 — Hướng dẫn sử dụng theo vai trò (2026-11-06)
- `[x]` M26-01a — Nút ? trên đầu trang, trang `/huong-dan` (tab theo vai trò; Quản lý chung xem cả 5 bản), phần chung + bản Nhân viên kỹ thuật + Nhân viên kinh doanh. `docs/specs/M26-01-role-user-guide.md` (Approved).
- `[x]` M26-01b — Bản Chăm sóc khách hàng, Quản lý kỹ thuật, Quản lý chung. Phụ thuộc M26-01a.

## UAT — Sửa lỗi từ lượt AI tự test (2026-11-06)
- `[~]` UAT-01 — BUG-01: thêm người cho đầu việc "Cần giao lại" phải đưa đơn về lại "Đang thực hiện" (Q90); BUG-02: API chi tiết đơn không trả giá vốn cho KTV (Q125); BUG-03: nút "Huỷ đơn" cho đơn đang thực hiện (`cancel_active`, UI chưa từng làm). `docs/specs/UAT-01-ai-uat-bugfixes.md` (7 AC). KB-01…07 sửa ở `scripts/build_uat_workbook.py`; lượt AI test 2: 136/136 Đạt (`docs/uat/AI_tu_test.xlsx`, ảnh `reports/uat-ai-2/`). Workbook khách hàng bổ sung case thiếu (mục 13 CS7, NS/DM/PQ/BC) → 170 bước; Q183–Q185 đã chốt → UAT-02.
- `[~]` UAT-02 — Q183: huỷ được đơn có mọi đầu việc đã huỷ (guard `order_has_no_live_tasks`), CSKH huỷ đơn mình tạo; Q184: CSKH đọc thông báo; Q185: migration bổ sung Sale/CSKH/QLKT cho mọi Manager. `docs/specs/UAT-02-cancel-notify-manager-roles.md` (9 AC). Workbook khách hàng 175 bước.
- `[~]` UAT-03 — Q186: danh sách đơn + ô thống kê sao lọc ngày theo ngày tạo đơn (thay Q92); Q187: lịch ô ngày giờ chọn được cả giờ/phút (mặc định 17:00); Q188: dòng giải thích ở tab "Tệp đính kèm" khi đơn chưa "Chờ KH xác nhận". `docs/specs/UAT-03-order-list-created-date-due-time.md` (7 AC).
- `[~]` UAT-04 — Hoá đơn bán hàng dài hơn 1 trang A5 ngang tự in khổ A4 dọc (đo chiều cao bản in trước khi in); thu gọn mẫu A5 để đơn ≤ ~6 dòng vừa 1 trang. `docs/specs/UAT-04-invoice-auto-a4.md` (4 AC).

## M25 — Biểu đồ kinh doanh: thời gian tra cứu theo từng card (2026-11-04)
- `[~]` M25-01 — Bỏ bộ lọc tháng chung; mỗi card biểu đồ có bộ chọn riêng (Từ–Đến tháng hoặc 1 tháng) với mặc định riêng; chỉ frontend. `docs/specs/M25-01-business-charts-per-card-period.md` (10 AC; Q180–Q182).

## M24 — Báo cáo doanh thu theo nhóm SP/DV & theo sản phẩm (2026-11-04)
- `[~]` M24-01a — API báo cáo doanh thu theo nhóm SP/DV hoặc từng SP/DV (`mode=group|item`), drilldown dòng hàng, CSV; dùng lại `report.revenue.read`. `docs/specs/M24-01a-revenue-by-product-report-api.md` (13 AC; Q176–Q178).
- `[~]` M24-01b — UI trang "Doanh thu theo SP/DV" ngay dưới "Doanh thu theo nhân viên", radio chuyển 2 kiểu xem. `docs/specs/M24-01b-revenue-by-product-report-ui.md` (9 AC; Q179). Phụ thuộc M24-01a.

## M23 — Báo cáo kinh doanh dạng biểu đồ, chỉ Manager (2026-11-03, Q157–Q160)
- M23 (gốc) — 3 nhóm biểu đồ: (1) Kết quả KD: combo Doanh thu + Lợi nhuận theo tháng; tròn cơ cấu doanh thu/lợi nhuận (radio) theo nhóm DV, SP, loại KH Cá nhân/Tổ chức; cột KH mới vs quay lại. (2) Bán hàng & SP: Pareto 80/20 doanh thu/lợi nhuận theo SP/DV; cột ngang Top bán chạy & bán chậm. (3) Nhân sự & KPI: cột giờ được phân công theo KTV; cột/bảng tỷ lệ hoàn thành KPI theo NV. Giá vốn trống → 70% giá bán (làm tròn). Chưa có spec — tách lát ở `/spec`.
- `[x]` M23a — API 3 nhóm số liệu biểu đồ (`/reports/business-charts/results|sales|staff`), capability `report.business_charts.read` (Manager), menu. `docs/specs/M23a-business-charts-api.md` (23 AC; Q165–Q172 theo mặc định) — `make verify` xanh 2026-11-04; /review PASS 2026-11-04 (reports/review-M23a.md); chưa commit, theo đợt.
- `[x]` M23b — UI màn "Biểu đồ kinh doanh" 3 tab, 8 biểu đồ, Recharts + ADR. `docs/specs/M23b-business-charts-ui.md` (16 AC; Q173–Q174). Phụ thuộc M23a. `make verify` xanh 2026-11-04; /review PASS 2026-11-04 (reports/review-M23b.md); chưa commit, theo đợt.

## M22 — Giao diện trang xác thực (2026-11-03)
- `[x]` M22-01 — Hình nền `login-bg-deepmind.webp` cho Đăng nhập / Quên mật khẩu / Đặt lại mật khẩu, chỉ tablet + desktop (≥ 768px), không lớp phủ. `docs/specs/M22-01-login-background.md` — review PASS (`reports/review-M22-01.md`), `make verify` xanh 2026-11-04; chưa commit, theo đợt.

## M21 — KPI doanh số, tiềm năng khách hàng, nhật ký nghiệp vụ (2026-11-01)
- `[x]` M21-01a — API: chỉ tiêu "Thu nhập thuần" theo nhân viên × tháng (lịch sử theo tháng, copy sang tháng sau có tuỳ chọn ghi đè), `kpi_target.manage` (Manager). `docs/specs/M21-01a-kpi-targets-api.md` — review PASS (`reports/review-M21-01a.md`), `make verify` xanh 2026-11-04; chưa commit, theo đợt.
- `[x]` M21-01b — UI: màn "Thiết lập doanh thu KPI" ngay dưới "Nhân sự & phân quyền" (lọc phòng ban, tìm tên/SĐT/email). `docs/specs/M21-01b-kpi-targets-ui.md` — review xong, finding đã sửa (`reports/review-M21-01b.md`; phân trang → M21-01c), `make verify` xanh 2026-11-04; chưa commit, theo đợt.
- `[x]` M21-02a — API: "Báo cáo KPI" theo tháng (Tổng doanh số, Doanh thu thuần, Mục tiêu, Tỷ lệ đạt; lọc phòng ban/nhóm dịch vụ/NV; xuất CSV) + `/me/kpi-sales`. `docs/specs/M21-02a-kpi-sales-report-api.md` — review + `make verify` xanh 2026-11-03 (chưa commit, theo đợt).
- `[x]` M21-02b — UI: đổi tên báo cáo KPI cũ → "Công việc theo nhân viên"; màn "Báo cáo KPI"; thẻ "KPI doanh số của tôi" ở Thông tin tài khoản. `docs/specs/M21-02b-kpi-sales-report-ui.md` — review + `make verify` xanh 2026-11-03 (chưa commit, theo đợt).
- `[x]` M21-03 — Tổng quan CSKH: thẻ "Đơn ghi doanh số" tháng này (+ popup/xuất Excel). `docs/specs/M21-03-dashboard-cskh-credited-orders.md` — review + `make verify` xanh 2026-11-03 (chưa commit, theo đợt). Treo: Q162, Q163.
- `[x]` M21-04 — Nhật ký hệ thống: cột/bộ lọc "Nghiệp vụ" (Đơn hàng, Quản lý đầu việc…), đối tượng đọc được, nhãn cho mọi thao tác. `docs/specs/M21-04-audit-business-area.md` — review PASS (`reports/review-M21-04.md`, còn vài Low mở), `make verify` xanh 2026-11-04; chưa commit, theo đợt.
- `[x]` M21-05a — API: KTV ghi "Tiềm năng sử dụng dịch vụ" của KH chủ đơn; báo cáo Doanh thu theo KH thêm tiềm năng + ngày mua hàng cuối. `docs/specs/M21-05a-customer-potential-api.md`
- `[x]` M21-05b — UI: ghi tiềm năng ở đầu việc/chi tiết đơn; 2 cột mới ở báo cáo Doanh thu theo KH. `docs/specs/M21-05b-customer-potential-ui.md` — review xong, Medium đã sửa (`reports/review-M21-05b.md`), `make verify` xanh 2026-11-04; chưa commit, theo đợt.
- `[x]` M21-01c — Phân trang "Thiết lập doanh thu KPI": API `limit/offset/total`, UI 20 dòng/trang + `Pagination` (Trang trước/sau) như các danh sách hiện có, cả desktop lẫn mobile (chủ sản phẩm chốt 2026-11-02, từ review M21-01b). `docs/specs/M21-01c-kpi-targets-pagination.md` — review xong (`reports/review-M21-01c.md`), `make verify` xanh 2026-11-04; chưa commit, theo đợt.
- `[x]` M21-06a — Ô chọn ngày/tháng tiếng Việt dùng chung (`DateField`), cấu hình kiểu hiển thị: tháng `MM/yyyy`, ngày `dd/MM/yyyy`, ngày-giờ `dd/MM/yyyy HH:mm(:ss)`; dùng cho trang KPI (thay `type="month"`) (chủ sản phẩm chốt 2026-11-02). `docs/specs/M21-06a-vietnamese-date-field.md` — `make verify` xanh 2026-11-04 sau /review (17 AC; `reports/review-M21-06a.md`); chưa commit, theo đợt.
- `[x]` M21-06b — Thay mọi ô `type="date"`/`datetime-local` hiện có (báo cáo doanh thu, quà KH, nhật ký, bảng việc, khách hàng, nhân viên, đơn nháp, tạo/sửa task) bằng `DateField` + `min`/`max`. `docs/specs/M21-06b-datefield-rollout.md` — `make verify` xanh 2026-11-04 sau /review (14 AC; `reports/review-M21-06b.md`); chưa commit, theo đợt.
- `[x]` M21-07 — Test e2e: dọn/giới hạn nhân viên "E2E" do `ensureFortyFive` (`frontend/e2e/kpi-targets.spec.ts`) seed vào DB dev — hiện tích luỹ mỗi lần chạy (~830 NV) (chủ sản phẩm chốt 2026-11-02, từ review M21-01c). `docs/specs/M21-07-e2e-employee-cleanup.md` — `make verify` xanh 2026-11-04 (7 AC; NV DB dev 1173 → 53, ổn định qua 2 lượt); /review xong 2026-11-04 (1 Medium + 1 Low đã sửa, `reports/review-M21-07.md`); chưa commit, theo đợt.
- `[x]` M21-08 — Bắt buộc có giá vốn: chặn bán SP/DV thiếu giá vốn, không cho xoá giá vốn, migration điền 70% giá bán cho SP/DV + dòng đơn cũ (Q161 chốt 2026-11-04). `docs/specs/M21-08-mandatory-cost-price.md` — `make verify` xanh 2026-11-04 (16 AC); chưa /review, chưa commit, theo đợt.

## M20 — Góp ý vận hành đợt 2026-10-31
- `[x]` M20-01 — UI: Tổng quan QLKT — mục "Điều phối" và "Nhân sự kỹ thuật": 4 thẻ/hàng trên tablet+desktop, 2 thẻ/hàng trên điện thoại. `docs/specs/M20-01-dashboard-dispatch-staff-grid.md` (chưa commit — theo đợt)
- `[x]` M20-02 — Bug: Danh sách đơn (CSKH) — bấm thẻ "Chưa đánh giá" không lọc danh sách bên dưới. `docs/specs/M20-02-csat-unrated-filter.md` — review + `make verify` xanh 2026-10-31 (chưa commit, theo đợt).
- `[x]` M20-03 — Danh sách đơn: CSKH và Sale mặc định bật "Chỉ đơn của tôi". `docs/specs/M20-03-orders-mine-default.md` — review + `make verify` xanh 2026-10-31 (chưa commit, theo đợt). Treo: chú thích "Theo đơn của tôi" dưới thẻ CSAT — chờ chủ SP quyết.
- `[x]` M20-04 — Modal: chỉ đóng khi lưu thành công, lỗi thì giữ modal + hiện lỗi (áp dụng mọi modal); tạo đơn — thêm khách (cá nhân/công ty) xong tự chọn khách đó vào ô tìm kiếm. `docs/specs/M20-04-modal-stay-open-on-error.md` — review + `make verify` xanh 2026-11-01 (chưa commit, theo đợt; AC-UI-063 thu hẹp về modal có nút Lưu, `reports/review-M20-04.md`); sửa thêm lỗi thật: modal lồng trong form đơn bị trình duyệt submit gốc (Q130). Treo Q131 (SĐT máy bàn).
- `[x]` M20-05 — Khách hàng: xuất Excel đầy đủ thông tin khách. `docs/specs/M20-05-customers-excel-export.md` — `make verify` xanh 2026-11-01 (chưa commit, theo đợt); `/review` xong 2026-11-01 — 0 finding ≥ Medium, `reports/review-M20-05.md`. Q132, Q133 theo mặc định.
- `[x]` M20-06 — Dữ liệu: nhóm SP/DV chỉ còn "Kỹ thuật chung", "Thiết bị an ninh", "Thiết bị văn phòng" — chốt 2026-10-31: migration gộp mọi SP/DV đang có vào "Kỹ thuật chung", nhóm cũ ngừng/xoá; người dùng tự phân lại trên UI. `docs/specs/M20-06-product-service-groups-consolidate.md` (Approved 2026-11-01; Q134, Q135 theo mặc định; Q136 chốt: chỉ đơn Nháp sửa được nhóm) — `make verify` xanh 2026-11-01; `/review` xong 2026-11-01 (`reports/review-M20-06.md`, 0 finding Medium+ mở) (chưa commit, theo đợt).
- `[x]` M20-07 — Dữ liệu: phòng ban chỉ còn "Phát Triển Kinh Tế" (gộp QLKT/Kỹ thuật/Sale/CSKH/cũ), "Nhân sự/Marketing", "Kế Toán - Tài chính"; — chốt 2026-10-31: vẫn cho Thêm; migration chuyển nhân viên các phòng ban cũ sang "Phát Triển Kinh Tế"; chỉ ngừng hoạt động khi không còn nhân viên trực thuộc. `docs/specs/M20-07-departments-consolidate.md` (Approved 2026-11-01; Q137, Q138 theo mặc định; phòng cũ xoá hẳn sau khi chuyển nhân viên). — `/review` xong 2026-11-01 (sửa race ngừng phòng ↔ chuyển nhân viên; Q139 chờ chủ dự án), `make verify` xanh; chưa commit, theo đợt.
- `[x]` M20-08 — Nhân sự: cột "Tài khoản đăng nhập" riêng, hiện SĐT + ngày sinh, xuất Excel đầy đủ. `docs/specs/M20-08-employees-login-column-excel-export.md` (Approved 2026-11-01; Q140, Q141 theo mặc định). — implement xong, `make verify` xanh 2026-11-01; `/review` PASS 2026-11-01 (chỉ Low, `reports/review-M20-08.md`) (chưa commit, theo đợt).
- `[x]` M20-09 — Nhân sự: Manager reset mật khẩu → hiện mật khẩu tạm để copy; lần đăng nhập đầu bắt buộc đổi mật khẩu (dùng lại `must_change_password`) — chốt 2026-10-31: mật khẩu tạm hết hạn sau 24 giờ. `docs/specs/M20-09-temporary-password-expiry.md` (Approved 2026-11-01; Q142–Q145 theo mặc định). — implement xong, `make verify` xanh 2026-11-01; `/review` PASS 2026-11-01 (chỉ Low, `reports/review-M20-09.md`) (chưa commit, theo đợt).
- `[x]` M20-10 — UI: Tổng quan — mục "Chăm sóc khách hàng": thẻ cao đều nhau, không để thẻ lẻ một hàng trên điện thoại (phát hiện khi review M20-01). `docs/specs/M20-10-dashboard-care-section-grid.md` (Approved 2026-11-01; đổi nhãn "Khách hàng đã chăm sóc" → "KH đã gọi"). — implement xong, `make verify` xanh 2026-11-01; `/review` xong 2026-11-01 (`reports/review-M20-10.md`, không còn High/Medium) (chưa commit, theo đợt).

## M19 — Kỹ thuật viên thêm dòng hàng tại hiện trường (2026-10-31)
- `[x]` M19-01a — API: KTV (phân công ACCEPTED/IN_PROGRESS, đơn IN_PROGRESS/REVISION) thêm/sửa/xoá dòng mình thêm qua `lines-on-site`, ghi doanh số cho chính KTV, báo Sale chủ đơn + QLKT; KTV được đọc danh mục (ẩn giá vốn). `docs/specs/M19-01a-technician-on-site-lines-api.md`
- `[x]` M19-01b — UI: nút "Thêm dòng hàng" + sửa/xoá dòng của mình ở tab Dòng hàng, huy hiệu "KTV thêm". Phụ thuộc M19-01a. `docs/specs/M19-01b-technician-on-site-lines-ui.md` — review + `make verify` xanh 2026-10-31 (chưa commit, theo đợt).

## M18 — Tổng quan: bấm thẻ mở popup danh sách chi tiết + xuất Excel (2026-10-30)
- `[x]` M18-01a — Khung popup + endpoint `/dashboard/cards/{card}/items|export` (CSV BOM, nút Excel chỉ desktop), áp cho khối "Đơn theo trạng thái" + "Điều phối"; bấm thẻ chỉ mở popup, bỏ chuyển trang. `docs/specs/M18-01a-dashboard-card-detail-popup.md`
- `[x]` M18-01b — Như trên cho khối "Đầu việc theo trạng thái", "Nhân sự kỹ thuật", "Việc của tôi" (KTV). `docs/specs/M18-01b-dashboard-card-popup-tasks-staff-mine.md`
- `[x]` M18-01c — Như trên cho khối "Chăm sóc khách hàng", "Phản hồi – đánh giá", "Top 10 khách hàng". `docs/specs/M18-01c-dashboard-card-popup-care-feedback-top.md`

## M17 — Thông tin công ty & phòng ban (2026-10-28)
- `[x]` M17-01 — Thông tin công ty: 1 bản ghi (tên, MST, địa chỉ, ĐT, fax, email, website, logo), seed từ hoá đơn, màn cài đặt chỉ Manager. `docs/specs/M17-01-company-profile.md`
- `[x]` M17-02a — Phòng ban: danh sách quản lý được (thêm/sửa/ngừng hoạt động), seed 3 phòng mới + 3 phòng cũ (Q102). `docs/specs/M17-02a-departments.md`
- `[x]` M17-02b — Nhân viên chọn phòng ban từ danh sách thay enum cố định (migrate dữ liệu cũ). `docs/specs/M17-02b-employee-department-link.md`
- `[x]` M17-03a — Hồ sơ nhân viên: ngày sinh, nơi sinh, giới tính, địa chỉ, CMND/CCCD (ngày/nơi cấp), tình trạng hôn nhân; email tuỳ chọn (spec Approved). `docs/specs/M17-03a-employee-profile-fields.md`
- `[x]` M17-03b — Tên đăng nhập tự sinh (`tam.nt`, trùng → `tam.nt2`), đăng nhập bằng tên đăng nhập thay email (spec Approved). `docs/specs/M17-03b-employee-username-login.md`
- `[x]` M17-04 — In "Hoá đơn bán hàng" khổ A5 theo mẫu giấy, nút "In" chỉ hiện trên desktop (≥1024px) ở chi tiết đơn + màn sửa đơn nháp. `docs/specs/M17-04-order-invoice-print-a5.md`
- `[x]` M17-05 — Trang Nhân sự & phân quyền: khối "Cách phân quyền hoạt động" (nguyên tắc, luồng, màn hình + thao tác theo vai trò sinh từ `permissions.yaml`/`menu.json`). `docs/specs/M17-05-permission-guide.md`

## M15 — Giai đoạn 2: CSKH, vai trò kết hợp, giá vốn, báo cáo doanh thu (spec Draft, 2026-10-21)
- `[x]` M15-01 — Vai trò CSKH (`CUSTOMER_CARE`) + ràng buộc gán vai trò: Manager ⇒ tự có Sale/CSKH/QLKT (không bao giờ cùng Kỹ thuật viên); nhân viên khác gán tự do. `docs/specs/M15-01-customer-care-role.md` (PR #126)
- `[x]` M15-02a — API: CSKH tra cứu đơn + ghi phản hồi (sao 1–5 + nội dung, tách riêng `customer_feedback`/`result_note`). `docs/specs/M15-02a-customer-feedback-api.md` (PR #127)
- `[x]` M15-02b — UI: màn tra cứu CSKH + tô màu theo sao + ô thống kê. `docs/specs/M15-02b-customer-feedback-ui.md` (gộp chung PR #127 với M15-02a theo quyết định chủ dự án 2026-10-22)
- `[x]` M15-03 — CSKH tạo yêu cầu chỉnh sửa gửi QLKT (chỉ thông báo, QLKT tự quyết revise). `docs/specs/M15-03-csk-revision-request.md` (PR #129)
- `[x]` M15-04 — Dashboard: Top 10 KH doanh thu cao nhất + tổng hợp đánh giá KH (Manager/QLKT/Sale/CSKH). `docs/specs/M15-04-dashboard-top-customers-feedback.md` (PR #130)
- `[x]` M15-05 — Khách hàng: thêm trường tổ chức (người liên hệ + SĐT, ngày thành lập, giám đốc + SĐT, phụ trách IT + SĐT) / cá nhân (ngày sinh, giới tính, nghề nghiệp); `type` bất biến sau khi tạo. Addendum 2026-10-24: `contact_person`/`contact_person_phone` chuyển COMPANY-only, thêm `director_phone`, bỏ `it_contact_email`, form 2 cột từ `md:`. `docs/specs/M15-05-customer-extended-fields.md`
- `[x]` M15-06 — Bỏ dòng hàng "Tự do" khi tạo đơn (chỉ chọn danh mục). `docs/specs/M15-06-remove-custom-order-line.md`
- `[x]` M15-07 — Giá vốn bắt buộc trên Sản phẩm/Dịch vụ. `docs/specs/M15-07-catalog-cost-price.md`
- `[x]` M15-08 — Lịch sử giá bán/giá vốn + `cost_price_snapshot` trên dòng hàng đơn. `docs/specs/M15-08-catalog-price-history.md`
- `[x]` M15-09a — API: Báo cáo "Doanh thu theo khách hàng" (list, drilldown, xuất CSV). `docs/specs/M15-09a-revenue-by-customer-report-api.md`
- `[x]` M15-09b — UI: Báo cáo "Doanh thu theo khách hàng". `docs/specs/M15-09b-revenue-by-customer-report-ui.md`
- `[x]` M15-10a — API: Báo cáo "Doanh thu theo nhân viên" (list, drilldown, xuất CSV; áp lại scope Q88/Q96). `docs/specs/M15-10a-revenue-by-employee-report-api.md`
- `[x]` M15-10b — UI: Báo cáo "Doanh thu theo nhân viên". `docs/specs/M15-10b-revenue-by-employee-report-ui.md`
- `[x]` M15-11 — Gộp menu "Báo cáo" (KPI + 2 báo cáo doanh thu mới), làm sau cùng. `docs/specs/M15-11-reports-menu-group.md`

Mỗi spec đang **Draft**, có mục "8. Giả định & câu hỏi" ghi rõ giả định mặc định — vài điểm ảnh hưởng lớn (phạm vi xem báo cáo doanh thu của Sale/CSKH, cấu trúc "Phụ trách IT") đã đẩy sang `docs/product/OPEN_QUESTIONS.md` (Q86–Q89), cần chủ dự án chốt trước khi duyệt Approved.

## M16 — Tặng quà khách hàng (spec Approved, 2026-10-24)
- `[x]` M16-01a — API: ghi nhận tặng quà KH (`customer_gifts`, CRUD trừ xoá, ảnh, lịch sử sửa qua `audit_events`). `docs/specs/M16-01a-customer-gift-tracking-api.md`
- `[x]` M16-01b — UI: màn hình riêng "Ghi nhận quà tặng KH" trong menu Đơn hàng. `docs/specs/M16-01b-customer-gift-tracking-ui.md`
- `[x]` M16-02a — API: báo cáo "Chi phí quà tặng KH" (list theo khách hàng, drilldown, xuất CSV). `docs/specs/M16-02a-customer-gift-report-api.md`
- `[x]` M16-02b — UI: báo cáo "Chi phí quà tặng KH" + menu Báo cáo. `docs/specs/M16-02b-customer-gift-report-ui.md`
- `[x]` M16-03 — Dashboard: 3 thẻ thống kê CSKH (KH đã chăm sóc, NV gọi điện CSKH, đơn phải sửa) trước khối Phản hồi KH. `docs/specs/M16-03-dashboard-cskh-stats.md`
- `[x]` M16-04 — Dòng hàng: trường "Ghi doanh số" (NV ghi nhận doanh số/dòng, có thể để trống). `docs/specs/M16-04-order-line-credited-employee.md`
- `[x]` M16-05 — Báo cáo "Doanh thu theo nhân viên": đổi tính theo dòng hàng (Ghi doanh số), thay Q88/Q96 cho báo cáo này. Phụ thuộc M16-04. `docs/specs/M16-05-revenue-by-employee-line-based.md`
- `[x]` M16-06 — Báo cáo "Doanh thu theo khách hàng": cột "người bán" đổi tính theo dòng hàng. Phụ thuộc M16-04. `docs/specs/M16-06-revenue-by-customer-line-based.md`
- `[x]` M16-07 — Danh mục: "Nhóm sản phẩm/dịch vụ" (CRUD độc lập, seed 3 nhóm mẫu). `docs/specs/M16-07-product-service-groups.md`
- `[x]` M16-08 — Đơn hàng: "Phòng phụ trách" đổi từ enum cố định sang chọn từ "Nhóm sản phẩm/dịch vụ". Phụ thuộc M16-07, thay Q08. `docs/specs/M16-08-order-division-group.md`
- `[x]` M16-09 — UI: Danh sách đơn, bố cục dòng bộ lọc (tìm kiếm/từ ngày/đến ngày) theo breakpoint. `docs/specs/M16-09-order-list-filter-row-layout.md`
- `[x]` M16-10 — UI: Màn tạo/sửa đơn nháp theo lưới chuẩn (mobile 1 cột, tablet 2 cột, desktop 3 cột; thẻ dòng hàng 2/6/12 cột); VAT dòng hàng thành ô nhập số. `docs/specs/M16-10-draft-order-form-grid.md` Thêm khách hàng (cá nhân/công ty) ngay trong màn tạo đơn bằng modal của Quản lý khách hàng.
- `[x]` M16-11 — API `GET /employees/lookup` (capability `employee.lookup`: Manager/Sale/CSKH/QLKT) cho ô "Người nhận doanh số"/"Người thực hiện"; thay đổi vẫn ghi `audit_events`. `docs/specs/M16-11-employee-lookup.md`
- `[x]` M16-12 — UI: bỏ nút "+ Khách lẻ" ở màn tạo đơn (khách mới tạo qua "Thêm khách hàng"); đơn nháp cũ là khách lẻ vẫn sửa được. `docs/specs/M16-12-remove-walkin-button.md`

## M14 — Vận hành / sửa đổi nhỏ (chưa bắt đầu)
- `[x]` M14-01 — Giảm số bản backup giữ lại từ 14 xuống **2 bản gần nhất** cho `db-*.dump`/`uploads-*.tar.gz` (`scripts/backup.sh`, `KEEP`); image tag trên Mac/server giữ 2 bản đã là hướng dẫn thủ công có sẵn ở `docs/architecture/DEPLOYMENT.md` §7.1. Quyết định của chủ dự án (2026-10-21). Spec `M9-02` đã cập nhật. (PR #132)
- `[x]` M14-02 — Mở rộng 3 điểm `notify_*` còn thiếu (quyết định chủ dự án 2026-10-21, `AC-NTF-003` sửa + `AC-NTF-049/050` mới): `order.start_dispatch` và `order.undispatch` (hệ thống) giờ báo cho **người tạo đơn + mọi TECH_LEAD active** (trước đó không báo ai); `order.complete` báo thêm **TECH_LEAD** (trước đó chỉ người tạo đơn). Sửa `spec/state_machines.yaml`, `backend/app/modules/notifications/service.py`, `backend/app/modules/orders/service.py#reevaluate_dispatch_state`; cập nhật `docs/specs/M7-01a-notifications-api.md` + `docs/product/WORKFLOWS.md` §5.1.

## Đã xong (tự động lưu trữ)
- M13 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M12 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M10 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M11 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M9 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M8 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M7 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M6 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M5 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M4 — xem `BACKLOG_ARCHIVE.md`.

## M0–M3 — đã xong
M0 (nền móng) · M1 (danh tính & phân quyền) · M2 (danh mục) · M3 (khách hàng & đơn hàng) — toàn bộ `[x]`.
Chi tiết từng item (ID, mô tả, spec, PR): `docs/backlog/BACKLOG_ARCHIVE.md`.
