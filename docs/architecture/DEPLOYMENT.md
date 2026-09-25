# Build & Deployment — MacBook Pro M2 → AlmaLinux

## 1. Môi trường
| | Dev / test thử | Production |
|---|---|---|
| Máy | MacBook Pro M2 (arm64) | AlmaLinux 9 (giả định x86_64 — Q12) |
| Container | Docker Desktop (bật "Use Rosetta for x86_64/amd64 emulation") hoặc OrbStack | Docker CE (repo docker-ce cho RHEL) + compose plugin |
| Compose file | `compose.dev.yml` (hot reload, mount source, DB port 5442) | `compose.prod.yml` (chỉ dùng image, không source) |
| File môi trường | `.env.dev` (copy từ `.env.dev.example`, `make setup` tự tạo) | `/opt/smyou/.env.prod` (copy từ `.env.prod.example`, chmod 600) |
| Build image | — (dev build native arm64 khi `make up`) | **build trên Mac M2** bằng `make build-prod` (`linux/amd64`), không build trên server |

## 2. Các file (tạo ở backlog M0/M9)
- `backend/Dockerfile` — multi-stage: `uv` sync → image `python:3.12-slim`, user không phải root, `HEALTHCHECK` gọi `/api/v1/health`.
- `frontend/Dockerfile` — stage build `node:22-alpine` → stage `nginx:alpine` chứa `dist/` + `nginx/default.conf.template` (SPA fallback, gzip, cache asset hash 1 năm, `index.html` no-cache, `<BASE_PATH>/api/` proxy tới backend `/api/`, `client_max_body_size 12m`, `server_tokens off`, header bảo mật). `BASE_PATH` là **build-arg** (mặc định `/smyoutask`, Makefile `PROD_BASE_PATH`): cùng giá trị được nướng vào bundle và cấu hình nginx — đổi subpath phải build lại image web.
Hai bộ file **tách riêng hoàn toàn** (không merge/override lẫn nhau) để không bao giờ lẫn cấu hình dev vào production:
- `compose.dev.yml` + `.env.dev` — Mac M2: `db` (postgres:17, port host 5442, volume `pgdata`, tạo sẵn DB `smyou_test`), `backend` (build target `dev`, mount source, uvicorn `--reload`, port 8010), `web` (Vite dev server, port 5183).
- `compose.prod.yml` + `.env.prod` — AlmaLinux: `db` (không publish port), `backend` (`image: smyou-backend:${IMAGE_TAG}`, chạy `alembic upgrade head` rồi uvicorn), `web` (`image: smyou-web:${IMAGE_TAG}`, nginx, port `${WEB_PORT}`); **không có `build:`**; `restart: unless-stopped`; log `json-file` max-size 10m; volume `pgdata`, `uploads`.
- `.env.prod.example` được dùng kèm `make smoke-prod` để chạy thử image production ngay trên Mac trước khi gửi lên server.

## 3. Build image production trên Mac M2
```bash
make build-prod TAG=2026.10.01-1          # = docker buildx build --platform linux/amd64 ... --load
make smoke-prod TAG=2026.10.01-1          # chạy image amd64 qua emulation + tests/docker/test_prod_stack.py, rồi dọn stack
```
Lưu ý: emulation amd64 trên M2 chậm (build lần đầu vài phút) — bình thường. CI (runner amd64) cũng build + smoke test cùng Dockerfile nên lỗi kiến trúc bị bắt trước khi deploy.

## 4. Chuyển image sang server (không cần registry)
```bash
docker save smyou-backend:$TAG smyou-web:$TAG | gzip | ssh deploy@server 'gunzip | docker load'
scp compose.prod.yml deploy@server:/opt/smyou/
ssh deploy@server 'cd /opt/smyou && sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" .env.prod && docker compose -f compose.prod.yml --env-file .env.prod up -d --wait'
```
Có registry (GHCR / registry nội bộ) thì dùng `--push` thay vì save/load. Script hoá thành `scripts/deploy.sh` (M9).

## 5. Chuẩn bị AlmaLinux (một lần)
- `dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo && dnf install docker-ce docker-ce-cli containerd.io docker-compose-plugin`; `systemctl enable --now docker`.
- User `deploy` thuộc nhóm `docker`; SSH key, tắt đăng nhập mật khẩu.
- **firewalld**: chỉ mở 80/443 (và SSH). Postgres không publish port ra ngoài.
- **SELinux** để `enforcing`: dùng named volume; nếu bind-mount thư mục host thì thêm hậu tố `:Z`. Host nginx proxy tới cổng localhost cần `setsebool -P httpd_can_network_connect 1` (thường đã bật vì server đang chạy các app khác).
- Đồng hồ: `chronyd` bật; container dùng UTC, app hiển thị giờ VN.

### 5.1 Chạy dưới subpath `https://ilabsviet.com/smyoutask/` (Q12)
Server đã có **nginx hệ thống** giữ HTTPS cho `ilabsviet.com` và proxy nhiều app theo subpath (TicketSeq, ChatBOT…). SMYou dùng đúng mô hình của TicketSeq:
- Container `web` (nginx + SPA) publish **`127.0.0.1:6890`** (cổng 8080/8000/3000/3012/3100/3111/3222/3500/5000/6868/8100/8200/8500 đã bị app khác dùng — kiểm tra lại bằng `ss -ltnp` trước khi deploy).
- Nginx hệ thống **forward nguyên path, KHÔNG strip `/smyoutask`**. Bên trong container `web`: `/smyoutask/api/` → backend `/api/` (strip prefix ở đây), còn lại → SPA.
- Ứng dụng biết subpath qua `BASE_PATH=/smyoutask` (.env.prod): Vite build với `base: '/smyoutask/'`, React Router `basename`, cookie `Path=/smyoutask`, API client gọi `/smyoutask/api/v1`. Dev trên Mac: `BASE_PATH` rỗng.
- HTTPS, chứng chỉ, rate-limit (`limit_req zone=perip`) do nginx hệ thống lo; container không cần TLS. Backend tin header `X-Forwarded-Proto` (uvicorn `--proxy-headers --forwarded-allow-ips=*` vì chỉ nhận kết nối từ container `web`) để cookie `Secure` đúng. IP khách: nginx hệ thống **ghi đè** `X-Real-IP $remote_addr`; container `web` lấy giá trị đó và **thay thế** (không nối thêm) `X-Forwarded-For` trước khi chuyển cho backend — nếu nối thêm, khách có thể tự gửi `X-Forwarded-For` để giả IP (review M0-03). Vì vậy khối nginx hệ thống bắt buộc có `proxy_set_header X-Real-IP $remote_addr;`.

Thêm vào file cấu hình nginx của `ilabsviet.com` (cạnh khối TicketSeq), rồi `nginx -t && systemctl reload nginx`:
```nginx
# (khai báo cùng nhóm upstream ở đầu file)
upstream smyoutask_ilabsviet {
    server 127.0.0.1:6890;
}

# (trong server { listen 443 ssl http2; server_name ilabsviet.com; ... })
# START: SMYou Pro — Quản lý đơn hàng & đầu việc (Docker, container web :6890)
location = /smyoutask {
    return 301 /smyoutask/;
}
location /smyoutask/ {
    limit_req zone=perip burst=20 nodelay;

    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    # KHÔNG có "/" cuối ở proxy_pass: giữ nguyên prefix /smyoutask/ cho container web tự định tuyến
    proxy_pass http://smyoutask_ilabsviet;

    proxy_connect_timeout 59s;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_hide_header X-Powered-By;
    proxy_redirect off;

    client_max_body_size 12M;   # ảnh phiếu xác nhận ≤ 10MB
}
# END: SMYou Pro
```

## 6. Migration khi deploy
Container backend chạy `alembic upgrade head` khi khởi động. Migration phải **tương thích ngược 1 phiên bản** (expand → migrate → contract) để rollback image không phá DB.

## 7. Backup & khôi phục
- Cron hằng ngày 01:00: `pg_dump -Fc` → `/opt/smyou/backups/db-YYYYMMDD.dump`; `tar` volume uploads; giữ 14 bản; copy ra ngoài server (rclone/NAS).
- Mỗi tháng thử khôi phục vào DB tạm (`scripts/restore_check.sh`) — backup chưa thử khôi phục = chưa có backup.

## 8. Rollback
đổi `IMAGE_TAG=<tag cũ>` trong `.env.prod` rồi `docker compose -f compose.prod.yml --env-file .env.prod up -d`. Nếu migration mới không tương thích → khôi phục từ dump trước deploy (script deploy luôn dump trước khi `up`).

## 9. Checklist mỗi lần deploy
- [ ] CI xanh trên commit cần deploy (gồm job `image` amd64 smoke)
- [ ] `pg_dump` trước deploy thành công
- [ ] `up -d` → healthcheck OK → đăng nhập thử 1 tài khoản mỗi vai trò (script `scripts/smoke_prod.sh`)
