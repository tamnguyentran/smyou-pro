# M9-03 — Kiểm tra an toàn trước go-live + checklist nhập dữ liệu thật/UAT

- **Status:** Done
- **Backlog:** M9-03 · **Milestone:** M9
- **Liên quan:** `docs/architecture/DEPLOYMENT.md` §7–9 (M9-01, M9-02 — không lặp lại), `backend/app/cli.py` (`create-manager`, đã có sẵn từ trước — M9-03 không làm lại), `backend/scripts/seed_e2e.py` (quy ước mã `E2E` cho dữ liệu test)

## 1. Mục tiêu
Là người vận hành (chủ dự án), tôi muốn một lệnh kiểm tra tự động (`scripts/golive_check.sh`) xác nhận server production đã sẵn sàng (không còn `CHANGE-ME`, không còn dữ liệu test, đã có ít nhất 1 tài khoản Quản lý chung) **trước khi** tôi tự nhập danh mục/nhân viên thật và cho người dùng thật truy cập, để tránh go-live với cấu hình/dữ liệu sai mà không nhận ra.

## 2. Phạm vi
- **Trong phạm vi (tự động hoá, kiểm chứng được không cần SSH server thật — giống cách M9-02 test `backup.sh`/`restore_check.sh` bằng stack `smoke-prod` cục bộ):**
  - `scripts/golive_check.sh --env-file <path>`: đọc file env production (dạng `.env.prod`) + kiểm tra DB (qua container `db` của compose project, giống cách `backup.sh` tìm container — không cần `psql`/SSH riêng), lần lượt:
    1. Không còn giá trị `CHANGE-ME` nào trong file env.
    2. `COOKIE_SECURE=true` và `WEB_BIND=127.0.0.1` (bất biến an toàn đã ghi trong `.env.prod.example`).
    3. Có ít nhất 1 nhân viên trong DB (đã bootstrap Quản lý chung đầu tiên qua `python -m app.cli create-manager`).
    4. Không còn bản ghi nào có mã bắt đầu `E2E` ở bảng `employees`, hoặc mã/SKU bắt đầu `E2E-` ở `products`/`services` (quy ước đặt mã của `seed_e2e.py` — dữ liệu test không được lẫn vào production).
  - In tiếng Việt: dừng ở lỗi **đầu tiên** gặp phải (không chạy tiếp các bước sau), liệt kê rõ nguyên nhân; nếu cả 4 bước qua → in `✅ Sẵn sàng go-live` và exit 0.
  - Test docker tái dùng stack `smoke-prod` (seed dữ liệu `E2E*`/để trống bảng nhân viên/sửa file env mẫu để dựng từng tình huống), đặt ở `backend/tests/docker/test_golive_check.py` (mẫu giống `test_backup_restore.py`).
  - `make golive-check` (Makefile): chạy `scripts/golive_check.sh` nhắm vào stack `smoke-prod` cục bộ với `.env.prod.example` — dùng để CI/người vận hành tự kiểm tra trước khi chạy thật trên server (không thay thế bước chạy tay trên server ở §7).
  - `docs/architecture/GO_LIVE_CHECKLIST.md` (tài liệu mới, không có AC — liệt kê các bước cho chủ dự án): tổng hợp (a) các bước đã xong M9-01/M9-02, (b) chạy `golive_check.sh` thật trên server, (c) nhập danh mục sản phẩm/dịch vụ + tài khoản nhân viên thật (qua UI, dùng quyền đã có từ M1-04/M2-xx — không xây lại), (d) kịch bản UAT tổng hợp: 1 dòng tham chiếu §7 của từng spec theo milestone, tick theo từng vai trò, (e) ô ký xác nhận ngày go-live.
- **Ngoài phạm vi (việc của chủ dự án, không tự động hoá được, không làm ở item này):**
  - Tự nhập dữ liệu thật (danh mục, nhân viên, khách hàng) — chỉ chủ dự án có dữ liệu kinh doanh thật; AI không bịa.
  - Tự chạy UAT thật trên server production với tài khoản thật — là bước thủ công ở §7, giống giới hạn của M9-01/M9-02 (phiên làm việc này không có quyền SSH/DB production thật).
  - Bootstrap Quản lý chung đầu tiên (`python -m app.cli create-manager`) — **đã có sẵn** từ trước M9-03, không làm lại.
  - Cấu hình cron/rclone thật — đã thuộc phạm vi M9-02.

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-SYS-115 | File env hợp lệ (không `CHANGE-ME`, `COOKIE_SECURE=true`, `WEB_BIND=127.0.0.1`); DB stack `smoke-prod` có 1 nhân viên (không mã `E2E*`), không có sản phẩm/dịch vụ mã `E2E-*` | chạy `scripts/golive_check.sh --env-file <path>` | Exit 0; in `✅ Sẵn sàng go-live`; không có lỗi nào được in | docker |
| AC-SYS-116 | Gọi script không truyền `--env-file`, hoặc truyền đường dẫn không tồn tại | chạy `scripts/golive_check.sh` | Exit ≠ 0; thông báo tiếng Việt kiểu "Thiếu --env-file hoặc file không tồn tại…"; không có lệnh `docker exec` nào được gọi | unit |
| AC-SYS-117 | File env có `JWT_SECRET=CHANGE-ME` (còn lại hợp lệ) | chạy script | Exit ≠ 0; thông báo tiếng Việt nêu đúng tên biến còn `CHANGE-ME` (`JWT_SECRET`); dừng trước khi gọi `docker exec` kiểm tra DB (lỗi cấu hình phát hiện trước, không cần DB) | unit |
| AC-SYS-118 | File env có `COOKIE_SECURE=false` (hoặc `WEB_BIND=0.0.0.0`) | chạy script | Exit ≠ 0; thông báo tiếng Việt nêu đúng biến + giá trị bắt buộc | unit |
| AC-SYS-119 | File env hợp lệ; DB stack `smoke-prod` **chưa có nhân viên nào** (bảng `employees` rỗng) | chạy script | Exit ≠ 0; thông báo tiếng Việt "Chưa có tài khoản Quản lý chung — chạy `python -m app.cli create-manager` trước"; không kiểm tra bước mã `E2E` (chưa cần, DB rỗng) | docker |
| AC-SYS-120 | File env hợp lệ; DB stack `smoke-prod` đã seed bằng `seed_e2e.py` (có nhân viên mã `E2E01`, sản phẩm mã `E2E-MON-001`) | chạy script | Exit ≠ 0; thông báo tiếng Việt liệt kê đúng bảng + số dòng dữ liệu test còn sót (`employees`, `products`, `services`) | docker |
| AC-SYS-121 | File `scripts/golive_check.sh` | `bash -n`; kiểm tra quyền thực thi (`git ls-files -s` → mode `100755`) | Cú pháp hợp lệ (exit 0); có quyền thực thi trong repo | unit |

## 4. API
Không có — item này không thêm/sửa endpoint backend, không đổi `spec/permissions.yaml` hay `spec/state_machines.yaml`. Script gọi DB trực tiếp qua `docker exec … psql` (đọc, không ghi), không qua API.

## 5. Dữ liệu / Migration
Không có bảng/cột mới. Script chỉ `SELECT count(*)` trên `employees`/`products`/`services` đã có sẵn.

## 6. UI
Không có (script dòng lệnh + tài liệu checklist, không có màn hình).

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
> Phiên làm việc hiện tại không có quyền SSH/DB production thật, nên các bước dưới chủ dự án tự thực hiện khi go-live thật — giống M9-01/M9-02.
1. Trên server: điền `.env.prod` thật (không còn `CHANGE-ME`), chạy `python -m app.cli create-manager` tạo tài khoản Quản lý chung đầu tiên, đăng nhập đổi mật khẩu.
2. Chạy `scripts/golive_check.sh --env-file /opt/smyou/.env.prod` trên server → xác nhận in `✅ Sẵn sàng go-live`.
3. Đăng nhập bằng tài khoản Quản lý chung: nhập danh mục Sản phẩm/Dịch vụ thật (giá, bảo hành theo `Tài liệu tham khảo/`), tạo tài khoản nhân viên thật cho từng vai trò (SALE/TECH_LEAD/TECHNICIAN).
4. Chạy kịch bản UAT tổng hợp ở `docs/architecture/GO_LIVE_CHECKLIST.md` (mỗi vai trò tạo 1 đơn/1 task thật trên dữ liệu vừa nhập, đi hết luồng tới khách ký xác nhận) — tick từng dòng.
5. Ký xác nhận ngày go-live vào `GO_LIVE_CHECKLIST.md`, sau đó mới thông báo khách hàng/nhân viên dùng hệ thống.

## 8. Giả định & câu hỏi
- Giả định: quy ước mã `E2E*`/`E2E-*` của `backend/scripts/seed_e2e.py` (đã có từ trước, docstring "Never run against production") là dấu hiệu đủ tin cậy để coi là "dữ liệu test" — không cần thêm cột `is_test_data` mới.
- Giả định: "UAT toàn bộ" = chạy lại kịch bản §7 đã có sẵn trong **từng** spec milestone trước đó (M1–M8), tổng hợp thành 1 bảng tick trong `GO_LIVE_CHECKLIST.md`, không viết lại kịch bản mới — tránh trùng lặp nội dung đã duyệt.
- Giả định: nhập danh mục/nhân viên/khách hàng thật không cần route/script mới — dùng đúng UI quản lý đã có (M1-04, M2-01, M2-02), vì MANAGER đã có đủ quyền `employee.manage`/`catalog.manage` theo `spec/permissions.yaml`.
- Không có câu hỏi mới cần hỏi chủ dự án — toàn bộ giả định trên suy ra trực tiếp từ code/docs hiện có, không phải quy tắc nghiệp vụ mới.
