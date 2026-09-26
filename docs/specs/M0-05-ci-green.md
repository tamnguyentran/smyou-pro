# M0-05 — CI xanh

- **Status:** Approved
- **Backlog:** M0-05 · **Milestone:** M0
- **Approval:** kỹ thuật thuần; chủ dự án uỷ quyền triển khai tuần tự M0 (2026-09-25)
- **Liên quan:** QUALITY_GATES §1, §2, §6; `.github/workflows/ci.yml`, `nightly.yml`

## 1. Mục tiêu
Là chủ dự án, tôi muốn mọi PR và mọi đêm đều có CI chạy đủ các lớp kiểm tra và **xanh thật**, để "CI xanh" là bằng chứng tin được, và bị cảnh báo sớm khi thư viện có bản vá bảo mật.

## 2. Phạm vi
- Trong:
  - Test tĩnh `backend/tests/unit/test_ci_workflows.py` giữ hợp đồng CI: đủ job bắt buộc, không job nào được phép "fail mà vẫn xanh", `image` build amd64 + smoke + quét CVE, `e2e` chạy `make e2e`.
  - `nightly.yml`: mutation testing và stateful test **bỏ qua kèm thông báo** khi chưa có `app/modules/*/domain.py` / `tests/stateful` (giống cách Makefile bỏ qua phần chưa scaffold), chạy thật khi đã có.
  - `.github/dependabot.yml`: uv (backend — cập nhật `uv.lock`), npm (frontend), github-actions, docker (backend, frontend) — hằng tuần.
  - Bằng chứng: CI trên PR xanh; nightly chạy tay (`workflow_dispatch`) trên nhánh này xanh; branch protection `main` đòi đủ check.
- Ngoài: schemathesis (L8) — thêm ở M1-01 khi có endpoint có body; Lighthouse CI — khi có trang đăng nhập (M1-01) và Việc của tôi (M5-01); cài Claude GitHub App (chủ dự án làm).

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-031 | `.github/workflows/ci.yml` | đọc workflow | chạy trên `pull_request` và `push` vào `main`; có đủ job `backend`, `frontend`, `contract`, `traceability`, `e2e`, `security`, `image`; không job/bước nào có `continue-on-error: true`; không lệnh nào nuốt lỗi bằng `\|\| true` (trừ bước thu log khi đã fail); `image` chạy `make build-prod ... PLATFORM=linux/amd64`, `make smoke-prod` và quét trivy với `exit-code: "1"`; `e2e` chạy `make e2e`; `backend` chạy pytest có `--cov-fail-under=85` | unit |
| AC-SYS-032 | `.github/workflows/nightly.yml`, repo chưa có `domain.py` và `tests/stateful` | chạy nightly | cả hai job xanh và in thông báo "skipped" (`::notice::`); khi có `domain.py`/`tests/stateful` thì bước chạy thật và fail theo ngưỡng (mutation < 80% → exit 1) | unit (đọc workflow) + CI (chạy tay) |
| AC-SYS-033 | `.github/dependabot.yml` | đọc cấu hình | có cập nhật `uv` tại `/backend` (chủ dự án duyệt đổi từ `pip`, 2026-09-26), `npm` tại `/frontend`, `github-actions` tại `/`, `docker` tại `/backend` và `/frontend`; lịch `weekly` | unit |

## 4. API
Không có.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Không có.

## 7. Kịch bản UAT thủ công
1. Mở tab Actions trên GitHub: PR M0-05 có 8 check xanh; lần chạy tay "Nightly quality" trên nhánh M0-05 xanh với 2 thông báo "skipped".
2. Settings → Branches: `main` đòi các check trên.

## 8. Giả định & câu hỏi
- Cảnh báo "Node.js 20 is deprecated" của các action v4: để Dependabot đề xuất nâng cấp (PR riêng), không đổi ở item này.
