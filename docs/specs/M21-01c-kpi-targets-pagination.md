# M21-01c — Phân trang "Thiết lập doanh thu KPI"

- **Status:** Approved (2026-11-02, chủ sản phẩm)
- **Backlog:** M21-01c · **Milestone:** M21
- **Phụ thuộc:** M21-01a, M21-01b
- **Liên quan:** spec/permissions.yaml#kpi_target.manage (không đổi), `frontend/src/components/ui/Pagination.tsx`, mẫu phân trang của `GET /departments` (`DepartmentPage { items, total, limit, offset }`)

## 1. Mục tiêu
Là Manager, tôi muốn danh sách "Thiết lập doanh thu KPI" chia trang 20 nhân viên/trang với nút "Trang trước/Trang sau" giống các danh sách khác, để trang không quá dài khi công ty có nhiều nhân viên (chủ sản phẩm chốt 2026-11-02, từ review M21-01b).

## 2. Phạm vi
- Trong phạm vi:
  - `GET /kpi-targets` thêm `limit` (1–100, mặc định 20) và `offset` (≥ 0, mặc định 0); response đổi từ `list[KpiTargetRowOut]` sang `KpiTargetPage { items, total, limit, offset }` (cùng dạng `DepartmentPage`). `total` = số dòng khớp `month` + `department_id` + `q` (trước khi cắt trang). Thứ tự giữ nguyên: mã NV tăng.
  - UI: trang `/settings/kpi-targets` gọi với `limit=20`, hiển thị `Pagination` ("1–20 / 45", "Trang trước", "Trang sau") dưới danh sách, cả dạng thẻ (390px) lẫn bảng (1440px).
  - Đổi tháng / phòng ban / ô tìm → quay về trang 1 (giống Phòng ban, Khách hàng).
  - Lưu / xoá / lỗi `STALE_VERSION` tải lại → **ở nguyên trang hiện tại**.
  - `make contract` sinh lại OpenAPI + TS types.
- Ngoài phạm vi: chọn số dòng/trang; nhảy tới số trang cụ thể; thay đổi phạm vi của "Copy sang tháng sau" (vẫn copy **toàn bộ** tháng nguồn — Q148, không theo trang đang xem).

## 3. Acceptance Criteria

| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-KPI-056 | 45 nhân viên đang hoạt động NV001…NV045; tháng 2026-11 | An (MANAGER) `GET /kpi-targets?month=2026-11` (không truyền `limit/offset`) | 200 `{ total: 45, limit: 20, offset: 0, items: [20 dòng NV001…NV020] }` | integration |
| AC-KPI-057 | Như AC-056 | `GET ?month=2026-11&limit=20&offset=40` | 200; `total=45`, `items` = 5 dòng NV041…NV045 | integration |
| AC-KPI-058 | Như AC-056 | `offset=60` (vượt quá tổng) | 200; `total=45`, `items=[]` | integration |
| AC-KPI-059 | 45 NV, trong đó 12 người thuộc "Phát Triển Kinh Tế"; Hoa SĐT 0903123456 | `GET ?month=2026-11&department_id=<PTKT>&limit=5`; và `?q=0903123&limit=5` | Lần 1: `total=12`, 5 dòng đầu theo mã NV; lần 2: `total=1`, 1 dòng Hoa — `total` tính sau lọc | integration |
| AC-KPI-060 | NV009 Phạm Minh đã nghỉ, có chỉ tiêu 2026-10 | `GET ?month=2026-10` | `total` có tính Minh (cùng quy tắc AC-KPI-043); `GET ?month=2026-11` thì không | integration |
| AC-KPI-061 | — | `limit=0`, `limit=101`, `offset=-1`, `limit=abc` | 422 | integration |
| AC-KPI-062 | Đăng nhập SALE / CUSTOMER_CARE / TECH_LEAD / TECHNICIAN | `GET /kpi-targets?month=2026-11&limit=20&offset=0` | 403 (giữ AC-KPI-044 với tham số mới) | integration |
| AC-KPI-063 | API trả `total=45` cho tháng 11/2026 | An mở `/settings/kpi-targets` | Gọi GET với `limit=20&offset=0`; hiện 20 nhân viên đầu và dòng "1–20 / 45"; "Trang trước" bị vô hiệu, "Trang sau" bấm được | component |
| AC-KPI-064 | Như AC-063 | An bấm "Trang sau" 2 lần | Lần lượt gọi `offset=20`, `offset=40`; trang cuối hiện "41–45 / 45", "Trang sau" bị vô hiệu; bấm "Trang trước" → `offset=20` | component |
| AC-KPI-065 | An đang ở trang 2 (`offset=20`) | Đổi tháng sang 12/2026; hoặc chọn phòng ban "Phát Triển Kinh Tế"; hoặc gõ "hoa" vào ô tìm | Lần gọi GET kế tiếp có `offset=0`, dòng đếm bắt đầu "1–…" | component |
| AC-KPI-066 | An ở trang 2, nhân viên NV025 chưa đặt | An nhập "30.000.000" cho NV025, bấm "Lưu"; rồi xoá chỉ tiêu một người khác trên trang | Sau mỗi thao tác, danh sách tải lại vẫn với `offset=20` (không nhảy về trang 1) | component |
| AC-KPI-067 | `total=0` (tìm "zzz") | — | Hiện "Không có nhân viên phù hợp"; không hiện thanh phân trang | component |
| AC-KPI-068 | 45 NV, 390px và 1440px | Mở trang | 390px: 20 thẻ + thanh phân trang ở cuối, nút ≥ 44px, không cuộn ngang; 1440px: bảng 20 dòng + thanh phân trang dưới bảng. Screenshot vào `reports/screenshots/` | e2e |

## 4. API
| Method | Path | Capability | Request | Response | Lỗi |
|---|---|---|---|---|---|
| GET | /api/v1/kpi-targets | kpi_target.manage | `month` (bắt buộc), `department_id?`, `q?`, `limit` (1–100, mặc định 20), `offset` (≥ 0, mặc định 0) | `KpiTargetPage { items: KpiTargetRowOut[], total, limit, offset }` | 403, 422 |

PUT / DELETE / copy: không đổi.

> Thay đổi phá vỡ dạng response (list → page). Chỉ UI M21-01b đang dùng endpoint này (cùng đợt, chưa merge) → sửa luôn trong item này, không cần giữ tương thích.

## 5. Dữ liệu / Migration
Không có. (Truy vấn đếm `count()` trên cùng điều kiện lọc, như `departments.service.list_departments`.)

## 6. UI
- Dùng nguyên `components/ui/Pagination` và hằng `PAGE_SIZE = 20` như `DepartmentsPage`.
- Vị trí: ngay dưới danh sách (thẻ ở mobile / bảng ở desktop), chỉ hiện khi `total > 0`.
- Copy: "Trang trước", "Trang sau", "{từ}–{đến} / {tổng}" (sẵn có trong component).
- Không đổi gì khác của M21-01b.

## 7. Kịch bản UAT thủ công
1. Đăng nhập Manager → Thông tin Công ty → Thiết lập doanh thu KPI.
2. Thấy tối đa 20 nhân viên và dòng "1–20 / N" dưới danh sách (cần > 20 nhân viên; ít hơn thì "Trang sau" bị mờ).
3. Bấm "Trang sau", đặt chỉ tiêu cho 1 người → vẫn ở trang 2.
4. Đổi phòng ban → quay về trang 1.
5. Thu nhỏ cửa sổ / mở trên điện thoại → thanh phân trang ở cuối danh sách thẻ.

## 8. Giả định & câu hỏi
- Chốt 2026-11-02 (chủ sản phẩm): 20 dòng/trang, `Pagination` Trang trước/sau như các danh sách hiện có, cả desktop lẫn mobile.
- Giả định (theo quy ước sẵn có, không phải luật nghiệp vụ mới): đổi bộ lọc → về trang 1; lưu/xoá → ở nguyên trang; `limit` tối đa 100 như `GET /departments`. Nếu danh sách co lại khiến trang hiện tại trống (vd. người khác vừa cho NV nghỉ) → tự lùi về trang cuối còn dữ liệu (thêm sau `/review`, chủ sản phẩm đồng ý 2026-11-02; kiểm bằng test AC-KPI-066 bổ sung).
- Không đổi `spec/*.yaml`. Không có câu hỏi mới.
