# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `KPI`.

## M0 — Nền móng (không có spec nghiệp vụ; AC kỹ thuật ghi trong item)
> Hợp đồng với tooling đã có sẵn (`Makefile`, `.github/workflows/`, `.claude/`) — M0 phải tạo đủ:
> - `backend/pyproject.toml`: marker pytest `ac`; `[tool.mutmut]` paths `app/modules/*/domain.py`; import-linter contracts (domain không import fastapi/sqlalchemy; router không import models); Hypothesis profiles `ci` và `nightly`; mypy strict; ruff rules gồm `S` (bandit), `B`, `UP`, `I`.
> - `scripts/export_openapi.py` (ghi OpenAPI ra file JSON, sắp xếp key ổn định); `backend/scripts/seed_e2e.py` (M1-01 trở đi).
> - `backend/Dockerfile` và `frontend/Dockerfile` có target `dev` và `prod`; `compose.yml` có healthcheck cho mọi service (`--wait` dựa vào đó); `compose.prod.yml` publish `web` ở `${WEB_PORT:-8080}`.
> - Playwright projects `mobile` (iPhone 13) và `desktop` (1440×900); tag `@a11y`, `@screenshot`; screenshot lưu `reports/screenshots/{project}/`.
> - Vitest coverage threshold 75% cho `src/features`, `src/lib`.
- [~] **M0-01 Scaffold backend**: uv project, FastAPI `create_app`, config, DB session, `/api/v1/health` (kiểm DB), problem+json handler, ruff/mypy/import-linter/pytest config, Alembic init. AC-SYS-001 health 200 khi DB sống, 503 khi DB chết.
- [ ] **M0-02 Scaffold frontend**: Vite React TS strict, Tailwind v4 + tokens (UI_GUIDELINES §2), font tự host, ESLint/Prettier/Vitest/Playwright config, trang placeholder dùng token. AC-SYS-002 build ok; AC-SYS-003 không cuộn ngang 360px.
- [ ] **M0-03 Docker & Makefile**: `compose.yml` + override dev (hot reload), Dockerfile BE/FE, mọi target Makefile chạy được, pre-commit cài được. AC-SYS-004 `make up` → web + api healthy trên Mac M2.
- [ ] **M0-04 Spec loader & sinh test**: `core/spec_loader.py` đọc 2 YAML (validate bằng Pydantic), test `test_guards_implemented` (skeleton guard trả NotImplemented được phép ở M0 bằng danh sách chờ), `test_routes_declare_capability`. AC-SYS-005 YAML sai cú pháp/thiếu trường → app không khởi động.
- [ ] **M0-05 CI xanh**: `.github/workflows/ci.yml` chạy đủ job trên PR; job `image` build amd64 + smoke.

## M1 — Danh tính & phân quyền
- [ ] **M1-01 Đăng nhập/đăng xuất/refresh** (cookie httpOnly, argon2, khoá 15' sau 5 lần sai, đổi mật khẩu lần đầu). Seed Manager đầu tiên qua lệnh CLI `python -m app.cli create-manager`.
- [ ] **M1-02 `require(capability)` + scope + `/me`** (roles, capabilities, counters); ma trận RBAC sinh tự động.
- [ ] **M1-03 AppShell theo vai trò**: sidebar 2 cấp, drawer mobile, bottom nav, menu từ `/me`, trang 403/404, route guard.
- [ ] **M1-04 Quản lý nhân viên**: danh sách/tìm/lọc, tạo, sửa, gán nhiều vai trò, khoá/mở, reset mật khẩu; không gỡ Manager cuối cùng.
- [ ] **M1-05 Audit framework**: ghi `audit_events` qua service chung; trang Nhật ký (Manager) lọc theo thực thể/người/ngày.

## M2 — Danh mục
- [ ] **M2-01 Sản phẩm**: CRUD, tìm theo mã/tên, lọc danh mục, ngừng kinh doanh, ảnh sản phẩm.
- [ ] **M2-02 Dịch vụ**: CRUD, `default_estimated_hours`.
- [ ] **M2-03 Import danh mục** từ CSV/XLSX (xem trước, báo lỗi từng dòng, không import nửa chừng) — Q15.

## M3 — Khách hàng & Đơn hàng
- [ ] **M3-01 Khách hàng**: CRUD, tìm theo tên/SĐT/MST, chống trùng SĐT (cảnh báo).
- [ ] **M3-02 Đơn nháp + dòng hàng + tính tiền** (snapshot, gift, giảm giá, VAT, property test).
- [ ] **M3-03 Gửi/thu hồi/huỷ đơn** + danh sách & chi tiết đơn (tab Thông tin/Dòng hàng/Lịch sử), `allowed_commands`.
- [ ] **M3-04 Sửa liên hệ sau khi gửi; Manager sửa dòng sau khi gửi** (audit diff).

## M4 — Điều phối (QLKT)
- [ ] **M4-01 Hàng đợi đơn chờ điều phối + tạo task + giao nhiều KTV** (đơn → IN_PROGRESS).
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
- [ ] **M7-02 Dashboard theo vai trò** (Sale: đơn của tôi theo trạng thái; QLKT: chờ điều phối, cần giao lại, quá hạn; KTV: việc hôm nay; Manager: tổng hợp).

## M8 — KPI
- [ ] **M8-01 Báo cáo KPI thô** theo KTV & khoảng ngày: số task xong, % đúng hạn, số lần từ chối theo lý do, số lỗi (defect) trừ `excluded_from_kpi`, giờ ước tính vs thực tế; xuất CSV. (Công thức điểm: Q10.)

## M9 — Production
- [ ] **M9-01 Image prod + compose.prod + nginx + HTTPS**.
- [ ] **M9-02 deploy.sh, backup/restore scripts + thử khôi phục**.
- [ ] **M9-03 Nhập dữ liệu thật, UAT toàn bộ, go-live checklist**.
