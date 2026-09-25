# M0-03 — Docker & Makefile

- **Status:** Approved
- **Backlog:** M0-03 · **Milestone:** M0
- **Approval:** kỹ thuật thuần; chủ dự án uỷ quyền triển khai tuần tự M0 (2026-09-25)
- **Liên quan:** DEPLOYMENT §1–§6; DECISIONS ADR-014 (subpath); review M0-01 (APP_ENV production cứng); BACKLOG M0 (hợp đồng tooling)

## 1. Mục tiêu
Là nhà phát triển, tôi chạy toàn bộ ứng dụng trên Mac M2 bằng một lệnh (`make up`) có hot reload, và build được image production amd64 chạy thử y như trên AlmaLinux (`make build-prod` + `make smoke-prod`) dưới đúng subpath `/smyoutask/`.

## 2. Phạm vi
- Trong:
  - `backend/Dockerfile` (target `dev`, `prod`): uv, `python:3.12-slim`, prod không có deps dev, user không phải root, `HEALTHCHECK` gọi `/api/v1/health`, khởi động = `alembic upgrade head` rồi uvicorn `--proxy-headers`.
  - `frontend/Dockerfile` (target `dev`, `prod`): `node:22-alpine` → `nginx:alpine`; `BASE_PATH` là build-arg (mặc định `/smyoutask`), nginx: SPA fallback, `/<base>/api/` → backend `/api/`, gzip, cache asset hash 1 năm, `index.html` không cache, `client_max_body_size 12m`, header bảo mật cơ bản, `server_tokens off`.
  - `.dockerignore` cho cả hai.
  - `compose.dev.yml`: thêm `backend` (mount source, `--reload`, `127.0.0.1:8010`) và `web` (Vite dev, `127.0.0.1:5183`, proxy `/api` → backend); mọi service có healthcheck.
  - `compose.prod.yml`: `db` (không publish port), `backend` (`APP_ENV=production` đặt cứng), `web` publish `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-6890}`; chỉ `image:`, không `build:`; `restart: unless-stopped`; log `json-file` giới hạn; volume `pgdata`, `uploads`.
  - Makefile: `build-prod` truyền `BASE_PATH`; `smoke-prod` chạy test smoke rồi luôn dọn stack; `make e2e` kiểm tra stack dev; mọi target phân tích được.
  - CI: job `e2e` cài uv (test stack dev); job `image` chạy khi có đủ Dockerfile (điều kiện từ M0-02).
- Ngoài: deploy thật lên server, `scripts/deploy.sh`, backup (M9); Lighthouse CI.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-SYS-004 | Mac M2, Docker chạy, `.env.dev` từ `.env.dev.example` | `make up` | `db`, `backend`, `web` đều `healthy`; `GET http://127.0.0.1:8010/api/v1/health` → 200 `database="ok"`; `GET http://127.0.0.1:5183/` → 200, HTML có `<title>SMYou Pro</title>`; `GET http://127.0.0.1:5183/api/v1/health` (qua proxy Vite) → 200 | docker (`make e2e`) |
| AC-SYS-019 | — | đọc `compose.dev.yml` và `compose.prod.yml` | prod: không service nào có `build:`; `backend.environment.APP_ENV == "production"` (chuỗi cứng, không nội suy); `db` không có `ports`; `web.ports == ["${WEB_BIND:-127.0.0.1}:${WEB_PORT:-6890}:80"]`; mọi service có `restart: unless-stopped` và `logging` giới hạn `max-size`; dev: mọi port publish đều bind `127.0.0.1`; cả hai file: mọi service có `healthcheck` (trong compose hoặc `HEALTHCHECK` của Dockerfile đối với image tự build) | unit |
| AC-SYS-020 | Image prod đã build (`make build-prod TAG=<t>`) | kiểm tra image `smyou-backend:<t>` và `smyou-web:<t>` | kiến trúc `amd64`; backend chạy với user khác `root`; backend không có `pytest` (không cài deps dev); backend có `HEALTHCHECK` | docker (`make smoke-prod`) |
| AC-SYS-021 | Stack prod chạy từ `compose.prod.yml` + `.env.prod.example` (thử trên Mac) | gọi `http://127.0.0.1:6890` | `/smyoutask/api/v1/health` → 200 `{"status":"ok","database":"ok"}`; `/smyoutask/` → 200 HTML tham chiếu `/smyoutask/assets/`; `/smyoutask/don-hang/123` (deep link) → 200 cùng `index.html`; `/smyoutask` → 301 `Location` kết thúc bằng `/smyoutask/`; một file `/smyoutask/assets/*.js` có `Cache-Control` chứa `immutable`; `/smyoutask/api/v1/openapi.json` → 404 (production); response có `X-Content-Type-Options: nosniff`; header `Server` không lộ phiên bản nginx | docker (`make smoke-prod`) |
| AC-SYS-022 | Image prod đã build; stack prod đang chạy | xem lệnh khởi động image backend và cấu hình nginx đang chạy trong `web` (`nginx -T`) | lệnh backend có `--proxy-headers` và `--forwarded-allow-ips`; nginx đặt `proxy_set_header X-Forwarded-Proto` (giữ giá trị từ nginx hệ thống, mặc định `$scheme`) và `X-Forwarded-For` cho `/smyoutask/api/` | docker (`make smoke-prod`) |
| AC-SYS-023 | Repo sạch | `make -n <target>` cho mọi target có `## ` trong Makefile; `uvx pre-commit validate-config` | tất cả thoát mã 0 (Makefile không lỗi cú pháp/biến, pre-commit cài được) | unit |

## 4. API
Không có endpoint mới.

## 5. Dữ liệu / Migration
Không có. Backend prod tự chạy `alembic upgrade head` khi khởi động (DEPLOYMENT §6).

## 6. UI
Không có thay đổi giao diện.

## 7. Kịch bản UAT thủ công
1. `make up` → mở `http://localhost:5183/` thấy trang SMYou Pro; sửa chữ trong `HomePage.tsx` → trình duyệt tự cập nhật.
2. `curl http://localhost:8010/api/v1/health` → `status: ok`.
3. `make build-prod TAG=test && make smoke-prod TAG=test` → in "✅ smoke ok".

## 8. Giả định & câu hỏi
- Web container phục vụ SPA đã build với `BASE_PATH` cố định lúc build (build-arg, mặc định `/smyoutask`); đổi subpath = build lại image web. `BASE_PATH` trong `.env.prod` chỉ dùng cho backend (cookie `Path`, M1-01).
- E2E Playwright tiếp tục chạy trên `vite preview` của bản build `/smyoutask` (M0-02 §8); image prod được kiểm bằng `make smoke-prod` (CI job `image`). Điều chỉnh giả định M0-02 §8 ("E2E chuyển sang stack Docker").
- Test đọc YAML dùng PyYAML hiện có sẵn qua `uvicorn[standard]`; M0-04 (spec loader) sẽ khai báo PyYAML trực tiếp.
- Test docker (marker `docker`) không chạy trong `pytest` mặc định (bỏ chọn bằng `-m "not docker"`), chỉ chạy trong `make e2e` / `make smoke-prod`, nơi stack đã được dựng.
- AC-SYS-022 kiểm cấu hình thay vì hành vi vì chưa có endpoint phụ thuộc scheme; hành vi cookie `Secure` sau proxy được kiểm ở M1-01.
