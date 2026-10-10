# M9-01 — Deploy lên `https://ilabsviet.com/smyoutask/` qua nginx hệ thống

- **Status:** Done (AC-SYS-024..026 tự động xanh; AC-SYS-027/028 chờ UAT thủ công trên server thật, xem §7)
- **Backlog:** M9-01 · **Milestone:** M9
- **Liên quan:** DEPLOYMENT.md §5.1 (Q12, đã chốt — xem OPEN_QUESTIONS_ARCHIVE.md), `compose.prod.yml` (`web.ports`), `backend/tests/docker/test_prod_stack.py` (AC-SYS-019..023, đã xanh từ M0-03)

## 1. Mục tiêu
Là người vận hành (DevOps/chủ dự án), tôi muốn khối cấu hình nginx hệ thống cho subpath `/smyoutask/` được viết đúng, kiểm chứng được tự động trước khi dán vào server, và có bước UAT xác nhận app chạy thật trên `https://ilabsviet.com/smyoutask/` với HTTPS sẵn có của host — để lần dán cấu hình vào nginx hệ thống (cạnh TicketSeq, ChatBOT…) không phá site khác và không để lộ cổng container ra ngoài.

## 2. Phạm vi
- Trong phạm vi:
  - Thêm file `deploy/nginx/ilabsviet-smyoutask.conf` chứa đúng khối nginx ở DEPLOYMENT.md §5.1 (nguồn sự thật duy nhất — DEPLOYMENT.md trỏ vào file này, không chép lại nội dung hai nơi).
  - Test tự động kiểm cú pháp nginx của khối này (chạy `nginx -t` trong container `nginx:alpine`) và kiểm các directive bắt buộc (an toàn IP thật, không mở cổng ra ngoài, giới hạn upload, rate-limit).
  - Test khớp cổng giữa `deploy/nginx/ilabsviet-smyoutask.conf` và `compose.prod.yml` (`web.ports`) để tránh lệch khi đổi `WEB_PORT`.
  - Cập nhật DEPLOYMENT.md §5.1 trỏ vào file thay vì nhúng lại khối.
  - Kịch bản UAT thủ công: dán khối vào nginx hệ thống thật trên AlmaLinux, `nginx -t && systemctl reload nginx`, xác nhận `https://ilabsviet.com/smyoutask/` chạy được bằng chứng chỉ sẵn có của host.
- Ngoài phạm vi (không làm ở item này):
  - `scripts/deploy.sh`, backup/restore (M9-02).
  - Nhập dữ liệu thật, UAT nghiệp vụ toàn bộ, go-live checklist (M9-03).
  - Hành vi container `web`/`backend` dưới subpath (đã xong & đã test ở M0-03: AC-SYS-019..023).
  - Mua/cài chứng chỉ TLS mới — dùng chứng chỉ wildcard/`ilabsviet.com` đã có sẵn trên host.

## 3. Acceptance Criteria
> CI/`make verify` chỉ chạy được AC-SYS-024..026 (file trong repo). AC-SYS-027..028 là thao tác trên server thật, đánh dấu lớp test "manual" — chủ dự án tự xác nhận và tick ở §7.

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-SYS-024 | File `deploy/nginx/ilabsviet-smyoutask.conf` tồn tại, chứa khối `location /smyoutask/ { ... }` + `upstream smyoutask_ilabsviet` bọc trong `http{}`/`server{}` tối giản để kiểm cú pháp | chạy `docker run --rm -v <file>:/etc/nginx/conf.d/test.conf:ro nginx:alpine nginx -t` (test harness tự dựng wrapper) | exit code 0, không có dòng `[emerg]`/`[error]` | docker |
| AC-SYS-025 | File cấu hình trên | đọc nội dung file | có đủ: `proxy_set_header X-Real-IP $remote_addr;`; `proxy_set_header X-Forwarded-Proto $scheme;`; `limit_req zone=perip`; `client_max_body_size 12M`; `proxy_pass http://smyoutask_ilabsviet;` (không có `/` cuối); `location = /smyoutask { return 301 .../; }` dẫn tới path có `/` cuối | unit |
| AC-SYS-026 | `deploy/nginx/ilabsviet-smyoutask.conf` khai báo `upstream smyoutask_ilabsviet { server 127.0.0.1:<port>; }`; `compose.prod.yml` có `web.ports == ["${WEB_BIND:-127.0.0.1}:${WEB_PORT:-6890}:80"]` | so khớp `<port>` giữa hai file (mặc định `WEB_PORT` nếu không set) | `<port>` trong nginx snippet == cổng mặc định `WEB_PORT` trong `compose.prod.yml` (6890) | unit |
| AC-SYS-027 | Server AlmaLinux đã có nginx hệ thống phục vụ `ilabsviet.com` với HTTPS; đã dán khối từ `deploy/nginx/ilabsviet-smyoutask.conf` vào cấu hình, `nginx -t` pass, đã `systemctl reload nginx`; stack `compose.prod.yml` đang chạy, container `web` publish `127.0.0.1:6890` | Người dùng ngoài server truy cập `https://ilabsviet.com/smyoutask/` | 200, trình duyệt không cảnh báo chứng chỉ (dùng cert sẵn có của host), giao diện SMYou Pro tải được; `https://ilabsviet.com/smyoutask` (không `/`) → 301 tới URL có `/` cuối | manual (UAT) |
| AC-SYS-028 | Cùng bối cảnh AC-SYS-027 | từ máy ngoài gọi `curl -m5 http://<IP-server>:6890` hoặc `http://ilabsviet.com:6890` | Connection refused/timeout (không phải 200) — xác nhận cổng container không lộ ra ngoài, chỉ nginx hệ thống (443) truy cập được | manual (UAT) |

## 4. API
Không có API mới — item này không đổi backend/frontend, chỉ đổi cấu hình hạ tầng.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Không đổi UI.

## 7. Kịch bản UAT thủ công (cho chủ dự án, ≤ 5 bước)
1. Trên AlmaLinux, dán nội dung `deploy/nginx/ilabsviet-smyoutask.conf` vào file cấu hình `ilabsviet.com` hiện có (cạnh khối TicketSeq/ChatBOT).
2. Chạy `nginx -t` → phải pass, không warning liên quan khối mới.
3. `systemctl reload nginx`.
4. Đảm bảo `compose.prod.yml` đang chạy (`docker compose -f compose.prod.yml --env-file .env.prod ps` → `web` healthy, publish `127.0.0.1:6890`).
5. Mở `https://ilabsviet.com/smyoutask/` trên trình duyệt ngoài server → app tải được, không cảnh báo chứng chỉ; thử `curl http://<IP>:6890` từ máy ngoài → bị từ chối.

## 8. Giả định & câu hỏi
- Giả định: chứng chỉ TLS cho `ilabsviet.com` trên host đã là wildcard hoặc đã bao gồm domain này (không cần xin cert mới) — đúng theo Q12 đã chốt.
- Giả định: không có xung đột tên `upstream` (`smyoutask_ilabsviet`) hay route `/smyoutask` với app khác đang chạy trên cùng host nginx — cần người vận hành kiểm tay khi dán (bước 1 ở §7), không kiểm được từ CI vì không có quyền đọc cấu hình nginx hệ thống thật.
- Không có câu hỏi nghiệp vụ mới — toàn bộ quyết định (cổng, subpath, X-Forwarded-*) đã chốt ở Q12/DEPLOYMENT.md §5.1.
