# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `KPI`.

## M0 — Nền móng (không có spec nghiệp vụ; AC kỹ thuật ghi trong item)
> Hợp đồng với tooling đã có sẵn (`Makefile`, `.github/workflows/`, `.claude/`) — M0 phải tạo đủ:
> - `backend/pyproject.toml`: marker pytest `ac`; `[tool.mutmut]` paths `app/modules/*/domain.py`; import-linter contracts (domain không import fastapi/sqlalchemy; router không import models); Hypothesis profiles `ci` và `nightly`; mypy strict; ruff rules gồm `S` (bandit), `B`, `UP`, `I`.
> - `scripts/export_openapi.py` (ghi OpenAPI ra file JSON, sắp xếp key ổn định); `backend/scripts/seed_e2e.py` (M1-01 trở đi).
> - `backend/Dockerfile` và `frontend/Dockerfile` có target `dev` và `prod`. **Hai bộ file môi trường riêng** (DEPLOYMENT §2): `compose.dev.yml` + `.env.dev.example` (Mac M2) và `compose.prod.yml` + `.env.prod.example` (AlmaLinux, chỉ dùng image `${IMAGE_TAG}` build trên Mac, không có `build:`). Mọi service có healthcheck (`--wait` dựa vào đó); `compose.prod.yml` publish `web` ở `${WEB_PORT:-8080}`.
> - Playwright projects `mobile` (iPhone 13) và `desktop` (1440×900); tag `@a11y`, `@screenshot`; screenshot lưu `reports/screenshots/{project}/`.
> - Vitest coverage threshold 75% cho `src/features`, `src/lib`.
- [x] **M0-01 Scaffold backend**: uv project, FastAPI `create_app`, config, DB session, `/api/v1/health` (kiểm DB), problem+json handler, ruff/mypy/import-linter/pytest config, Alembic init. AC-SYS-001 health 200 khi DB sống, 503 khi DB chết.
- [x] **M0-02 Scaffold frontend**: Vite React TS strict, `BASE_PATH` cấu hình được (Vite `base`, Router `basename`, API base URL — ADR-014), Tailwind v4 + tokens (UI_GUIDELINES §2), font tự host, ESLint/Prettier/Vitest/Playwright config, trang placeholder dùng token. AC-SYS-002 build ok; AC-SYS-003 không cuộn ngang 360px.
- [x] **M0-03 Docker & Makefile**: `compose.dev.yml` đầy đủ (hot reload) + `compose.prod.yml`, Dockerfile BE/FE, `make build-prod`/`smoke-prod` chạy được trên Mac M2, `compose.prod.yml` đặt cứng `APP_ENV=production` cho backend (review M0-01), `web` publish `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-6890}` và định tuyến `/smyoutask/api/` → backend (ADR-014), smoke test gọi `http://localhost:6890/smyoutask/api/v1/health`, mọi target Makefile chạy được, pre-commit cài được. AC-SYS-004 `make up` → web + api healthy trên Mac M2.
- [x] **M0-04 Spec loader & sinh test**: `core/spec_loader.py` đọc 2 YAML (validate bằng Pydantic), test `test_guards_implemented` (skeleton guard trả NotImplemented được phép ở M0 bằng danh sách chờ), `test_routes_declare_capability`. AC-SYS-005 YAML sai cú pháp/thiếu trường → app không khởi động.
- [x] **M0-05 CI xanh**: `.github/workflows/ci.yml` chạy đủ job trên PR; job `image` build amd64 + smoke.

## M1 — Danh tính & phân quyền
- [x] **M1-01a Xác thực — backend**: đăng nhập/đăng xuất/refresh (cookie httpOnly, argon2, khoá 15' sau 5 lần sai, đổi mật khẩu lần đầu), CLI `python -m app.cli create-manager`. Spec `M1-01a-auth-api.md`.
- [x] **M1-01b Xác thực — giao diện**: trang Đăng nhập, Đổi mật khẩu, tự làm mới phiên, E2E + `seed_e2e.py`. Spec `M1-01b-auth-ui.md`.
- [x] **M1-02 `require(capability)` + scope + `/me`** (roles, capabilities, counters); ma trận RBAC sinh tự động. Spec `M1-02-authz-scope-me.md`.
- [x] **M1-03a AppShell — menu & khung chính**: menu sinh từ YAML, sidebar 2 cấp, drawer mobile, menu từ `/me`, trang 403/404/đang phát triển, route guard. Spec `M1-03a-app-shell.md`.
- [x] **M1-03b AppShell — bottom nav & Cá nhân**: thanh điều hướng dưới đáy, nút hành động chính, trang Cá nhân, chỗ giữ Thông báo. Spec `M1-03b-bottom-nav-profile.md`.
- [x] **M1-04a Quản lý nhân viên — API**: danh sách/tìm/lọc, tạo, sửa, gán nhiều vai trò, khoá/mở, cấp lại mật khẩu; không gỡ Manager cuối cùng. Spec `M1-04a-employees-api.md`.
- [x] **M1-04b Quản lý nhân viên — giao diện**: trang Nhân sự, form, hộp xác nhận, mật khẩu tạm một lần. Spec `M1-04b-employees-ui.md`.
- [x] **M1-05 Audit framework**: ghi `audit_events` qua service chung; trang Nhật ký (Manager) lọc theo thực thể/người/ngày.

## M2 — Danh mục
- [x] **M2-01a Sản phẩm — API**: CRUD, tìm theo mã/tên, lọc danh mục, ngừng kinh doanh, module `attachments` tối thiểu (ảnh sản phẩm). Spec `M2-01a-products-api.md`.
- [x] **M2-01b Sản phẩm — giao diện**: trang Danh mục sản phẩm, form, chọn & xem trước ảnh. Spec `M2-01b-products-ui.md`.
- [x] **M2-02 Dịch vụ**: CRUD, `default_estimated_hours`. Spec `M2-02-services.md`.
- [x] **M2-03a Import danh mục — API**: import CSV cho Sản phẩm + Dịch vụ, xem trước (dry-run) → xác nhận, báo lỗi từng dòng, không import nửa chừng. Spec `M2-03a-catalog-import-api.md`. Q15.
- [x] **M2-03b Import danh mục — giao diện**: màn tải file/xem trước/xác nhận. Spec `M2-03b-catalog-import-ui.md`. Q58.
- [x] **M2-03c Import danh mục — kiểm tra kích thước/số dòng ở client**: chặn file >2MB hoặc >500 dòng ngay ở client trước khi gọi `preview`, tránh gọi API thừa (M2-03b đã Done trước khi Q58 được chốt). Spec `M2-03c-catalog-import-client-validation.md`. Q58.

## M3 — Khách hàng & Đơn hàng
- [x] **M3-01 Khách hàng**: CRUD, tìm theo tên/SĐT/MST, chống trùng SĐT (cảnh báo). Spec `M3-01-customers.md`.
- [x] **M3-02a Đơn nháp + dòng hàng + tính tiền — API**: tạo/sửa đơn nháp, thêm/sửa/xoá dòng hàng (snapshot, gift, giảm giá, VAT), pricing engine + property test. Spec `M3-02a-draft-orders-api.md`. Q52, Q53.
- [x] **M3-02b Đơn nháp — giao diện**: trang Tạo/sửa đơn (`/orders/new`, `/orders/:id`), chọn khách/Khách lẻ, thêm dòng từ danh mục hoặc tự do, tổng tiền theo mức VAT. Spec `M3-02b-draft-orders-ui.md`. `/review` xong 3 vòng (`reports/review-M3-02b.md`), `make verify`/`make e2e` xanh (`reports/verification.md`). Merged via PR #39/#40.
  - Còn để sau (không chặn ship): `order.read_prices` chưa tách riêng khỏi `order.read` trong permissions.yaml (chưa khai thác được nhưng nên tách khi có thay đổi vai trò); ô đơn giá/giảm giá sửa tay chưa có dấu phân cách nghìn; màn lỗi tải đơn chưa có nút "Thử lại".
- [x] **M3-03a Gửi/thu hồi/huỷ đơn — API**: lệnh `submit`/`recall`/`cancel`, 5 guard cài ở `workflow/guards.py`, `GET /orders` (danh sách), `GET /orders/{id}` + `allowed_commands`, `GET /orders/{id}/history`. Spec `M3-03a-order-transitions-api.md`. Q54, Q55. Merged via PR #41.
- [x] **M3-03b Gửi/thu hồi/huỷ đơn — giao diện**: trang `/orders` (danh sách), trang chi tiết đơn có tab Thông tin/Dòng hàng/Lịch sử, nút Gửi đơn/Thu hồi/Huỷ đơn theo `allowed_commands`. Spec `M3-03b-order-list-detail-ui.md`. Q56. Merged via PR #42.
- [x] **M3-04a Sửa liên hệ & dòng hàng sau khi gửi — API**: `PATCH /orders/{id}/contact`, thêm/sửa/xoá dòng sau khi gửi (`order.edit_contact`, `order.edit_lines_after_submit`), audit ghi diff trước/sau. Spec `M3-04a-order-post-submit-edits-api.md`. Q57.
- [x] **M3-04b Sửa liên hệ & dòng hàng sau khi gửi — giao diện**: form sửa liên hệ, sửa dòng hàng trên trang chi tiết đơn (M3-03b) khi đơn không còn Nháp. Spec `M3-04b-order-post-submit-edits-ui.md`.
- [x] **M3-05 Hàng trong bảng danh sách bấm được cả dòng**: `CustomerList` (M3-01) và `OrderList` (M3-03b) hiện chỉ mã/tên bấm được, phần còn lại của hàng (desktop) không điều hướng — khác với wording AC-ORD-069 "bấm 1 dòng/thẻ → chi tiết". Sửa cả 2 bảng cho nhất quán. Phát hiện ở `/review` M3-03b (`reports/review-M3-03b.md`). Spec `M3-05-clickable-list-rows.md`.
- [x] **M3-06 Component `ChipGroup` cho bộ lọc trạng thái**: thay `<Select>` lọc trạng thái ở `OrdersListPage` bằng `ChipGroup`, đúng mô tả UI_GUIDELINES §6 / AC-ORD-069 "chip lọc trạng thái". Phát hiện ở `/review` M3-03b (`reports/review-M3-03b.md`). Spec `M3-06-order-status-chip-filter.md`. `make verify` xanh (`reports/verification.md`).

## M4 — Điều phối (QLKT)
- [x] **M4-01a Hàng đợi điều phối + tạo task + giao nhiều KTV — API**: bảng `tasks`/`assignments`, 5 guard đang treo (`order_in_dispatchable_state`/`at_least_one_assignee`/`assignees_are_active_technicians`/`estimated_hours_positive`/`due_at_not_in_past`), lệnh tạo task (đơn → IN_PROGRESS khi là task đầu tiên), `GET /orders/{id}/tasks`, `GET /orders?sort=dispatch`, badge `pending_dispatch_count`. Spec `M4-01a-dispatch-task-create-api.md`. Q59, Q60, Q61, Q62, Q63.
- [~] **M4-01b Hàng đợi điều phối + tạo task + giao nhiều KTV — giao diện**: trang `/dispatch/queue` (sắp theo ưu tiên + ngày hẹn), panel/form tạo task nhiều người giao. Spec `M4-01b-dispatch-task-create-ui.md`. Q64.
- [ ] **M4-01c Tab "Đầu việc" trên trang chi tiết đơn**: danh sách task của đơn (`GET /orders/{id}/tasks`), badge trạng thái task, nút "Tạo đầu việc" dùng lại `TaskCreateSheet` của M4-01b cho đơn `IN_PROGRESS`/`REVISION`. Tách từ M4-01b vì gộp vượt ~400 dòng non-test (Q64).
- [ ] **M4-02 Sửa task, thêm/gỡ người, huỷ task**; trạng thái task suy ra; NEEDS_ASSIGNEE.
- [ ] **M4-03 Bảng đầu việc** (Kanban desktop / danh sách mobile, lọc theo KTV/hạn/ưu tiên).
- [ ] **M4-04 Lịch & tải việc** theo nhân viên.

## M5 — Kỹ thuật viên (mobile)
- [ ] **M5-01 Việc của tôi** (tab, card, gọi/bản đồ).
- [ ] **M5-02 Tiếp nhận / Từ chối (lý do)**.
- [ ] **M5-03 Bắt đầu / Hoàn thành** (+ ghi chú, giờ thực tế, ảnh công việc) → task DONE → đơn AWAITING_CONFIRMATION; test đồng thời.

## M6 — Hoàn tất & Chỉnh sửa
- [ ] **M6-01 Tải ảnh phiếu xác nhận** (nén client, kiểm magic bytes, lưu an toàn, xem có kiểm quyền).
- [ ] **M6-02 Hoàn tất đơn**.
- [ ] **M6-03 Chuyển Chỉnh sửa + task phát sinh + mở lại task + defect records**.
- [ ] **M6-04 Stateful test toàn workflow + E2E golden path** (TESTING_STRATEGY §5).

## M7 — Thông báo & Tổng quan
- [ ] **M7-01 Thông báo in-app** (chuông, badge, đánh dấu đã đọc, polling 30s).
  - Follow-up (review M1-03b): bọc route `/thong-bao` và `/ca-nhan` bằng kiểm tra capability (`notification.read`, `profile.manage`) như các trang menu.
- [ ] **M7-02 Dashboard theo vai trò** (Sale: đơn của tôi theo trạng thái; QLKT: chờ điều phối, cần giao lại, quá hạn; KTV: việc hôm nay; Manager: tổng hợp).

## M8 — KPI
- [ ] **M8-01 Báo cáo KPI thô** theo KTV & khoảng ngày: số task xong, % đúng hạn, số lần từ chối theo lý do, số lỗi (defect) trừ `excluded_from_kpi`, giờ ước tính vs thực tế; xuất CSV. (Công thức điểm: Q10.)

## M9 — Production
- [ ] **M9-01 Deploy lên `https://ilabsviet.com/smyoutask/`**: thêm khối nginx hệ thống (DEPLOYMENT §5.1), HTTPS dùng chứng chỉ sẵn có của host.
- [ ] **M9-02 deploy.sh, backup/restore scripts + thử khôi phục**.
- [ ] **M9-03 Nhập dữ liệu thật, UAT toàn bộ, go-live checklist**.
