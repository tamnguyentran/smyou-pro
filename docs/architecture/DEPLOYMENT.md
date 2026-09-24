# Build & Deployment — MacBook Pro M2 → AlmaLinux

## 1. Môi trường
| | Dev / test thử | Production |
|---|---|---|
| Máy | MacBook Pro M2 (arm64) | AlmaLinux 9 (giả định x86_64 — Q12) |
| Container | Docker Desktop (bật "Use Rosetta for x86_64/amd64 emulation") hoặc OrbStack | Docker CE (repo docker-ce cho RHEL) + compose plugin |
| Compose file | `compose.yml` + `compose.override.yml` (hot reload, mount source) | `compose.yml` + `compose.prod.yml` |
| Image | build native arm64 | build `--platform linux/amd64` |

## 2. Các file (tạo ở backlog M0/M9)
- `backend/Dockerfile` — multi-stage: `uv` sync → image `python:3.12-slim`, user không phải root, `HEALTHCHECK` gọi `/api/v1/health`.
- `frontend/Dockerfile` — stage build `node:22-alpine` → stage `nginx:alpine` chứa `dist/` + `nginx.conf` (SPA fallback, gzip, cache asset hash 1 năm, `/api` proxy tới backend, `client_max_body_size 12m`).
- `compose.yml` — `db` (postgres:17, named volume `pgdata`, healthcheck `pg_isready`), `backend` (chạy `alembic upgrade head` rồi uvicorn), `web` (nginx).
- `compose.prod.yml` — image tag cố định, `restart: unless-stopped`, không mount source, giới hạn log (`json-file`, max-size 10m), secrets từ `/opt/smyou/.env`.

## 3. Build image production trên Mac M2
```bash
make build-prod TAG=2026.10.01-1          # = docker buildx build --platform linux/amd64 ... --load
make smoke-prod TAG=2026.10.01-1          # chạy image amd64 qua emulation, gọi /api/v1/health
```
Lưu ý: emulation amd64 trên M2 chậm (build lần đầu vài phút) — bình thường. CI (runner amd64) cũng build + smoke test cùng Dockerfile nên lỗi kiến trúc bị bắt trước khi deploy.

## 4. Chuyển image sang server (không cần registry)
```bash
docker save smyou-backend:$TAG smyou-web:$TAG | gzip | ssh deploy@server 'gunzip | docker load'
ssh deploy@server 'cd /opt/smyou && TAG=$TAG docker compose -f compose.yml -f compose.prod.yml up -d'
```
Có registry (GHCR / registry nội bộ) thì dùng `--push` thay vì save/load. Script hoá thành `scripts/deploy.sh` (M9).

## 5. Chuẩn bị AlmaLinux (một lần)
- `dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo && dnf install docker-ce docker-ce-cli containerd.io docker-compose-plugin`; `systemctl enable --now docker`.
- User `deploy` thuộc nhóm `docker`; SSH key, tắt đăng nhập mật khẩu.
- **firewalld**: chỉ mở 80/443 (và SSH). Postgres không publish port ra ngoài.
- **SELinux** để `enforcing`: dùng named volume; nếu bind-mount thư mục host thì thêm hậu tố `:Z`.
- HTTPS: Caddy hoặc nginx + certbot trước container `web` (chốt khi có domain — Q12).
- Đồng hồ: `chronyd` bật; container dùng UTC, app hiển thị giờ VN.

## 6. Migration khi deploy
Container backend chạy `alembic upgrade head` khi khởi động. Migration phải **tương thích ngược 1 phiên bản** (expand → migrate → contract) để rollback image không phá DB.

## 7. Backup & khôi phục
- Cron hằng ngày 01:00: `pg_dump -Fc` → `/opt/smyou/backups/db-YYYYMMDD.dump`; `tar` volume uploads; giữ 14 bản; copy ra ngoài server (rclone/NAS).
- Mỗi tháng thử khôi phục vào DB tạm (`scripts/restore_check.sh`) — backup chưa thử khôi phục = chưa có backup.

## 8. Rollback
`TAG=<tag cũ> docker compose ... up -d`. Nếu migration mới không tương thích → khôi phục từ dump trước deploy (script deploy luôn dump trước khi `up`).

## 9. Checklist mỗi lần deploy
- [ ] CI xanh trên commit cần deploy (gồm job `image` amd64 smoke)
- [ ] `pg_dump` trước deploy thành công
- [ ] `up -d` → healthcheck OK → đăng nhập thử 1 tài khoản mỗi vai trò (script `scripts/smoke_prod.sh`)
