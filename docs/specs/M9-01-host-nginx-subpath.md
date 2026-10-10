# M9-01 — Khối nginx hệ thống cho subpath `/smyoutask/`

- **Status:** Approved
- **Backlog:** M9-01 · **Milestone:** M9
- **Liên quan:** `docs/architecture/DEPLOYMENT.md` §5.1 (Q12, đã chốt), `M0-03` (container `web`/`backend` đã làm xong phần `BASE_PATH`/nginx trong container — không lặp lại ở đây)

## 1. Mục tiêu
Là người vận hành (chủ dự án hoặc người có quyền SSH vào AlmaLinux), tôi muốn một khối cấu hình nginx hệ thống đã kiểm chứng sẵn để thêm vào `ilabsviet.com`, để SMYou Pro chạy được tại `https://ilabsviet.com/smyoutask/` dùng đúng HTTPS/chứng chỉ nginx hệ thống đang có, không ảnh hưởng các app khác (TicketSeq, ChatBOT…) đang chạy trên cùng host.

## 2. Phạm vi
- **Trong phạm vi:**
  - File snippet nginx (`upstream` + `location`) lưu trong repo, nội dung khớp `DEPLOYMENT.md` §5.1, có thể kiểm tra cú pháp (`nginx -t`) và các directive bắt buộc bằng test tự động chạy trên máy dev (không cần server thật).
  - Checklist/kịch bản thủ công để người có quyền SSH chèn khối này vào file cấu hình `ilabsviet.com` trên AlmaLinux thật, reload nginx, và xác nhận app chạy qua HTTPS.
- **Ngoài phạm vi (làm ở item khác):**
  - `scripts/deploy.sh`, backup/restore (`M9-02`).
  - Build/chuyển image, `compose.prod.yml`, nginx **trong container** `web`, `BASE_PATH` build-arg (đã xong ở `M0-03`).
  - Nhập dữ liệu thật, UAT toàn diện, go-live (`M9-03`).
  - Xin cấp mới chứng chỉ TLS — item này **dùng lại** chứng chỉ nginx hệ thống đã có sẵn cho `ilabsviet.com`, không cấp mới.

Việc chèn khối vào nginx hệ thống thật và chạy `nginx -t && systemctl reload nginx` trên server **không tự động hoá được** từ phiên làm việc này (không có quyền SSH vào AlmaLinux thật) — đây là bước UAT thủ công ở §7, người vận hành tự thực hiện khi deploy thật.

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-SYS-101 | File `ops/nginx/smyoutask.conf` trong repo chứa khối `upstream smyoutask_ilabsviet` + `location /smyoutask/` (nội dung khớp `DEPLOYMENT.md` §5.1) | Test dựng container `nginx:alpine` nhúng khối này vào một `server{}`/`http{}` tối giản rồi chạy `nginx -t` | Thoát mã 0, không lỗi cú pháp | docker (chạy trong `make check`/CI, không cần server thật) |
| AC-SYS-102 | Cùng file trên | Test đọc nội dung file bằng regex/grep | Có đủ: `location = /smyoutask { return 301 .../; }`; `location /smyoutask/`; `proxy_set_header X-Real-IP $remote_addr;` (ghi đè, không nối thêm — chặn giả IP, xem `DEPLOYMENT.md` §5.1); `proxy_pass http://smyoutask_ilabsviet;` **không có `/` ở cuối** (giữ nguyên prefix cho container tự định tuyến); `client_max_body_size 12M;`; `limit_req zone=perip burst=20 nodelay;`; `proxy_set_header Connection 'upgrade';` | unit |
| AC-SYS-103 | File trên | Test đọc nội dung | Nội dung khối (sau khi chuẩn hoá khoảng trắng) **giống hệt** khối mẫu hiện có ở `DEPLOYMENT.md` §5.1 — tránh hai nguồn lệch nhau khi một bên sửa mà quên bên kia | unit |
| AC-SYS-104 | Chưa áp dụng item này | Đọc `DEPLOYMENT.md` §5.1 | Có đoạn ghi rõ: cổng `6890` phải kiểm tra trống bằng `ss -ltnp` trước khi deploy thật (không đoán); nếu `6890` đã bị chiếm, người vận hành đổi cổng trong `.env.prod` (`WEB_PORT`) + khối nginx cho khớp | doc (không có test tự động — không có server thật để kiểm cổng) |

## 4. API
Không có — item này không thêm/sửa endpoint backend, không đổi `spec/permissions.yaml` hay `spec/state_machines.yaml`.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
Không có (thuần hạ tầng, không có màn hình).

## 7. Kịch bản UAT thủ công (cho chủ dự án / người có quyền SSH AlmaLinux, ≤ 5 bước)
1. `ss -ltnp | grep 6890` trên server — xác nhận cổng trống (danh sách cổng đã dùng bởi app khác: xem `DEPLOYMENT.md` §5.1).
2. Copy nội dung `ops/nginx/smyoutask.conf` vào file cấu hình `ilabsviet.com` hiện có trên server (cạnh khối TicketSeq, theo đúng vị trí `upstream { ... }` ở đầu file và `location` trong `server { listen 443 ssl ... }`).
3. `nginx -t` trên server → phải báo `syntax is ok` / `test is successful`.
4. `systemctl reload nginx`.
5. Khi stack `compose.prod.yml` đã chạy ở cổng `127.0.0.1:6890` (có từ `M9-02`/`M9-03`, chưa có ở item này): mở `https://ilabsviet.com/smyoutask/` trên trình duyệt → trang đăng nhập SMYou Pro hiện ra qua HTTPS, không có cảnh báo chứng chỉ.

> Bước 5 cần stack prod đã chạy thật trên server (phần của `M9-02`/`M9-03`) — ở `M9-01` chỉ xác nhận khối nginx hợp lệ và đúng vị trí chèn; nếu muốn xác nhận bước 5 ngay, cần làm trước phần "chạy stack trên server" của `M9-02`.

## 8. Giả định & câu hỏi
- Giả định: cổng container `web` cố định `6890` như `DEPLOYMENT.md` đã ghi (Q12 đã chốt); nếu khi deploy thật phát hiện `6890` đã bị chiếm, người vận hành tự đổi cổng theo AC-SYS-104, không cần sửa spec này.
- Giả định: "thêm khối nginx hệ thống" trong backlog nghĩa là tạo + kiểm chứng file snippet trong repo, không có nghĩa agent tự SSH vào server thật để chỉnh — vì phiên làm việc hiện tại không có quyền truy cập AlmaLinux production. Việc chèn thật vào server nằm ở kịch bản UAT thủ công (§7), người vận hành tự thực hiện.
- Không có câu hỏi mới cần ghi vào `OPEN_QUESTIONS.md` — Q12 đã chốt đủ chi tiết (subpath, cổng, HTTPS do host nginx đảm nhiệm) để viết AC ở trên.
