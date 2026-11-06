# M21-07 — Dọn nhân viên do test e2e tạo trong DB dev

- **Status:** Approved
- **Backlog:** M21-07 · **Milestone:** M21
- **Liên quan:** `backend/scripts/seed_e2e.py`, `frontend/e2e/kpi-targets.spec.ts` (`ensureFortyFive`), `frontend/e2e/employees.spec.ts`; review `reports/review-M21-01c.md`

## 1. Mục tiêu
Là chủ sản phẩm dùng DB dev để UAT, tôi muốn số nhân viên không tăng thêm mỗi lần chạy `make e2e` (hiện ~830 NV "rác"), để danh sách Nhân sự / Thiết lập doanh thu KPI trên máy dev còn đọc được và test phân trang chạy trên số liệu ổn định.

**Nguyên nhân hiện tại (đã kiểm tra code):** `seed_e2e.py` (chạy đầu `make e2e`) chỉ dọn đơn hàng không phải fixture, **không dọn nhân viên**. Mỗi lần chạy, Manager e2e `an.e2e@smyou.vn` (E2E01) tạo NV mới qua API/UI:
- `employees.spec.ts`: ~8 NV/project, tên/email gắn `Date.now()` (`qa.mobile.1730…@smyou.vn`, "Phạm Văn Khoa desktop 1730…", "Kim Yến mobile 1730…") → không bao giờ trùng, tích luỹ mãi.
- `kpi-targets.spec.ts` `ensureFortyFive`: bù đủ 45 NV đang hoạt động ("Nhân viên KPI mobile 17"…) — tự giới hạn, nhưng cộng thêm vào số trên.

## 2. Phạm vi
- Trong phạm vi:
  - `seed_e2e.py` thêm bước **dọn NV do test tạo** trước khi upsert fixture, tách thành hàm `purge_test_employees(session) -> PurgeResult` để test được.
  - Quy tắc nhận diện "NV do test tạo": có audit event `entity_type="EMPLOYEE"`, `action="create"` mà `actor_id` là một tài khoản fixture e2e (email nằm trong `ACCOUNTS` của `seed_e2e.py`), và bản thân NV đó **không** phải fixture.
  - Xoá kèm: vai trò, phiên, token/đề nghị đặt lại mật khẩu, thông báo (đều `ON DELETE CASCADE` sẵn), dòng chỉ tiêu KPI (`employee_kpi_targets` — `RESTRICT`, phải xoá trước), và audit event có `entity_type="EMPLOYEE"` + `entity_id` thuộc NV bị xoá.
  - NV do test tạo nhưng còn bị dữ liệu khác tham chiếu (đơn/đầu việc/phân công/khách hàng/quà/tệp/ghi chú tiềm năng — FK không cascade) → **giữ lại**, không lỗi.
  - In 1 dòng tóm tắt: `seed_e2e: purged <N> test employees (kept <M> still referenced)`.
- Ngoài phạm vi:
  - Không đổi `ensureFortyFive` / `employees.spec.ts` (sau khi dọn, mỗi lần chạy chỉ tạo lại tối đa 1 lượt — số NV có trần).
  - Không đổi API, quyền, migration, UI sản phẩm.
  - Không dọn NV do người dùng thật tạo (VD tài khoản Manager của chủ SP tạo `kythuat1@smyou.vn`), NV không có audit "create" (bootstrap/migration), và không động tới `make reset-test-data`.
  - Không chạy trên production (giữ chặn `APP_ENV=production` sẵn có).

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-SYS-148 | DB có fixture E2E01 (`an.e2e@smyou.vn`, Manager); E2E01 đã tạo qua service nhân sự 3 NV: "Nhân viên KPI mobile 17" (SALE), "Phạm Văn Khoa desktop 1730000000000" (TECHNICIAN, có SĐT 0912345678), `qa.mobile.1730000000000@smyou.vn` (có 1 phiên đăng nhập + 1 thông báo); "Nhân viên KPI mobile 17" có chỉ tiêu KPI tháng hiện tại 50.000.000 ₫ | gọi `purge_test_employees(session)` | Cả 3 NV không còn trong `employees`; vai trò, phiên, thông báo, dòng `employee_kpi_targets` của họ bị xoá; không còn audit event `entity_type=EMPLOYEE` nào trỏ tới 3 NV; kết quả `purged=3, kept=0` | integration |
| AC-SYS-149 | Như AC-SYS-148, thêm: fixture E2E01–E2E16 (kể cả E2E06 "Lê Thị Hoa" có audit "create"/"update" do E2E01 thực hiện khi test sửa NV) | purge | Mọi NV có email trong `ACCOUNTS` vẫn còn nguyên (không đổi `id`, vai trò, chỉ tiêu KPI) | integration |
| AC-SYS-150 | NV "Nguyễn Văn Hùng" (`kythuat1@smyou.vn`) do Manager thật `tam.manager@smyou.vn` (không phải fixture) tạo; NV "Trần Thị Bé" không có audit "create" nào | purge | Cả 2 NV vẫn còn, không đổi gì; audit event của họ còn nguyên | integration |
| AC-SYS-151 | NV "Kim Yến desktop 1730000000001" do E2E01 tạo, là người được phân công 1 đầu việc của đơn fixture `E2E-DH-M501` (assignment còn tồn tại) | purge | NV đó **được giữ lại**, phân công còn nguyên; hàm không ném lỗi, các NV test khác vẫn bị xoá trong cùng giao dịch; kết quả `kept=1` | integration |
| AC-SYS-152 | Đã purge một lần (AC-SYS-148) | gọi purge lần 2 | `purged=0, kept=0`; số dòng `employees` không đổi | integration |
| AC-SYS-153 | DB dev sau một lượt `make e2e`; ghi số NV = X | chạy `python -m scripts.seed_e2e` 2 lần liên tiếp | Lần 1 in `seed_e2e: purged <N> test employees (kept <M> still referenced)` với N ≥ 1; lần 2 in `purged 0`; exit code 0 cả 2 lần; tổng NV sau lần 1 < X | integration (gọi `main()` qua subprocess/hàm trên DB test) |
| AC-SYS-154 | Stack dev sau khi purge (số NV hoạt động có thể < 45) | chạy `make e2e` | AC-KPI-068 (phân trang 20/trang) và các test `employees.spec.ts` vẫn xanh trên mobile + desktop; chạy `make e2e` lần 2 không làm tổng NV tăng quá 1 lượt tạo (tổng sau lần 2 ≤ tổng sau lần 1 + số NV một lượt tạo) | e2e (hồi quy, đo tay ghi vào `reports/verification.md`) |

## 4. API
Không có thay đổi.

## 5. Dữ liệu / Migration
Không có. Chỉ xoá dữ liệu trong DB dev/test qua script.

## 6. UI
Không có.

## 7. Kịch bản UAT thủ công (cho chủ dự án)
1. Mở trang "Nhân sự & phân quyền" trên máy dev, ghi lại tổng số NV (VD 830).
2. Chạy `make e2e`.
3. Mở lại trang: tổng số NV giảm mạnh (còn NV thật của anh/chị + 16 tài khoản E2E + 1 lượt NV test mới nhất); các NV anh/chị tự tạo vẫn còn.
4. Chạy `make e2e` thêm lần nữa → tổng số NV gần như không đổi so với bước 3.

## 8. Giả định & câu hỏi
- Giả định (dựa vào code, không phải luật nghiệp vụ mới):
  - Nhận diện NV test bằng **audit "create" do tài khoản fixture e2e thực hiện** thay vì theo mẫu tên/email — bền hơn khi thêm test mới, và không bao giờ đụng NV chủ SP tự tạo bằng tài khoản thật. Hệ quả: nếu chủ SP từng đăng nhập bằng `an.e2e@smyou.vn` để tạo NV thử tay, NV đó cũng bị dọn ở lần `make e2e` sau.
  - Xoá cả audit event về các NV bị xoá (`entity_type=EMPLOYEE`). Luật "audit append-only" (CLAUDE.md #8) áp dụng cho hệ thống chạy thật; `seed_e2e` đã từ chối chạy ở production và vốn đã xoá đơn hàng test. Audit event khác có `actor_id` là NV bị xoá (VD lượt đăng nhập của `qa.mobile…`) được DB tự đặt `actor_id = NULL` (FK `SET NULL` sẵn có).
  - Dữ liệu dọn mỗi lần **đầu** `make e2e`, nên sau khi chạy xong DB dev vẫn còn NV của lượt vừa chạy (có trần, không tích luỹ).
- Câu hỏi mới: Q164 — Có muốn xoá luôn audit event về NV test bị dọn (đề xuất: **có**, để Nhật ký hệ thống trên máy dev không đầy dòng "Tạo nhân viên" trỏ tới NV không còn tồn tại)?
