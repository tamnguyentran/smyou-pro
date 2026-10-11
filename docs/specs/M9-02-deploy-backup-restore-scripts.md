# M9-02 — `deploy.sh`, backup/restore scripts + thử khôi phục

- **Status:** Done (AC-SYS-105..114 tự động xanh — unit + `make smoke-prod`; §7 là kịch bản UAT thủ công trên server thật, chưa thực hiện ở phiên này)
- **Backlog:** M9-02 · **Milestone:** M9
- **Liên quan:** `docs/architecture/DEPLOYMENT.md` §3–8 (Q12 đã chốt), `M9-01` (khối nginx hệ thống — không lặp lại ở đây)

## 1. Mục tiêu
Là người vận hành (chủ dự án hoặc người có quyền SSH vào AlmaLinux), tôi muốn `scripts/deploy.sh` để đưa image đã build/smoke-test trên Mac M2 lên server một lệnh (có dump DB trước khi deploy), và `scripts/backup.sh` + `scripts/restore_check.sh` chạy bằng cron trên server để sao lưu hằng ngày và tự kiểm tra hằng tháng là bản sao lưu **khôi phục được thật**, để khi sự cố xảy ra có thể rollback/khôi phục mà không phải đoán.

## 2. Phạm vi
- **Trong phạm vi:**
  - `scripts/deploy.sh` (chạy trên Mac M2): dump DB server trước khi deploy, chuyển 2 image + `compose.prod.yml` qua SSH (không registry, theo DEPLOYMENT.md §4), cập nhật `IMAGE_TAG`, `up -d --wait`, kiểm tra health sau deploy.
  - `scripts/backup.sh` (chạy bằng cron **trên server**, không qua SSH): `pg_dump -Fc` + tar volume `uploads`, giữ 14 bản mới nhất mỗi loại, copy ra ngoài server qua rclone nếu đã cấu hình (env `RCLONE_REMOTE`, bỏ qua có log nếu chưa cấu hình).
  - `scripts/restore_check.sh` (chạy bằng cron **trên server**, hằng tháng): phục hồi bản dump mới nhất vào một container Postgres tạm (không đụng DB thật đang chạy), kiểm tra dữ liệu đọc được, dọn container tạm, báo kết quả.
  - `deploy.env.example` (file mẫu commit vào repo, tương tự `.env.prod.example`) chứa `SERVER_HOST`/`SERVER_USER`/`SERVER_PATH` để `deploy.sh` đọc; file thật `deploy.env` không commit (thêm vào `.gitignore`).
  - Test tự động cho những gì kiểm chứng được **không cần SSH vào AlmaLinux thật** (giống cách M9-01 đã làm với khối nginx): nội dung/an toàn của `deploy.sh` bằng static check, và **toàn bộ** hành vi của `backup.sh`/`restore_check.sh` bằng docker test cục bộ (2 script này tự thân chạy cục bộ trên server, không SSH, nên test được đầy đủ bằng stack `smoke-prod`).
- **Ngoài phạm vi (làm ở item khác):**
  - Cấu hình cron thật trên AlmaLinux (`crontab -e`) — là bước UAT thủ công ở §7, cùng giới hạn như M9-01 (không có quyền SSH server thật trong phiên làm việc).
  - Cấu hình đích rclone/NAS thật (tài khoản, remote) — xem câu hỏi Q79 ở §8.
  - Nhập dữ liệu thật, go-live checklist (`M9-03`).
  - Khối nginx hệ thống, build image (`M9-01`, `M0-03`) — không lặp lại.

## 3. Acceptance Criteria

| ID | Given (bối cảnh, dữ liệu, vai trò) | When (hành động) | Then (kết quả quan sát được) | Lớp test |
|---|---|---|---|---|
| AC-SYS-105 | `scripts/deploy.sh` có trong repo | chạy `scripts/deploy.sh` không truyền `TAG` | Exit code ≠ 0; in thông báo lỗi tiếng Việt kiểu "Thiếu TAG…"; không chạy bất kỳ lệnh `ssh`/`docker save` nào | unit (chạy script trực tiếp, không cần docker/ssh) |
| AC-SYS-106 | `scripts/deploy.sh TAG` với `TAG` chưa có image `smyou-backend:TAG`/`smyou-web:TAG` ở local | chạy script | `docker image inspect` thất bại → script dừng, exit ≠ 0, thông báo tiếng Việt gợi ý chạy `make build-prod TAG=...` trước; không SSH ra server | docker (chạy cục bộ, không cần server thật) |
| AC-SYS-107 | Đọc nội dung `scripts/deploy.sh` | grep/static check | Có `set -euo pipefail`; bước `ssh … pg_dump` xuất hiện **trước** bước `docker load`/`docker compose … up -d` trong file (dump trước khi deploy — DEPLOYMENT.md §8); không có lệnh `docker build`/`buildx build` nào trong script (chỉ build trên Mac, không bao giờ build trên server — DEPLOYMENT.md §1/§4) | unit |
| AC-SYS-108 | Stack `smoke-prod` đang chạy cục bộ, DB có ≥1 dòng dữ liệu nghiệp vụ (user seed có sẵn), volume `uploads` có ≥1 file | chạy `scripts/backup.sh` với `BACKUP_DIR` trỏ vào thư mục tạm của test | Tạo đúng 1 file `db-<timestamp>.dump` mà `pg_restore --list` đọc được không lỗi, và 1 file `uploads-<timestamp>.tar.gz` chứa đúng (các) file đang có trong volume; exit 0 | docker |
| AC-SYS-109 | Thư mục backup đã có sẵn 14 bản `db-*.dump` giả lập (mốc giờ khác nhau) | chạy `scripts/backup.sh` thêm 1 lần (tạo bản thứ 15) | Sau khi chạy, đúng 14 file `db-*.dump` còn lại = 13 bản cũ nhất còn giữ + bản mới nhất vừa tạo (không xoá nhầm bản vừa tạo); tương tự cho `uploads-*.tar.gz` | docker |
| AC-SYS-110 | Container `db` của stack `smoke-prod` đang dừng (giả lập lỗi) | chạy `scripts/backup.sh` | `pg_dump` thất bại → script phát hiện, **không** tạo file `.dump` rỗng/hỏng ở `BACKUP_DIR`, exit ≠ 0, thông báo lỗi tiếng Việt | docker |
| AC-SYS-111 | Bản dump hợp lệ từ AC-SYS-108 (DB gốc có N dòng bảng `users`) | chạy `scripts/restore_check.sh` trỏ `BACKUP_DIR` tới bản dump đó | Script tạo container Postgres **tạm** riêng (không đụng DB thật của stack), `pg_restore` vào đó, đếm dòng bảng `users` = N (khớp DB gốc lúc backup), tự dọn container + volume tạm sau khi xong, in "✅ khôi phục thử thành công", exit 0 | docker (đây là bằng chứng "thử khôi phục" của backlog) |
| AC-SYS-112 | `BACKUP_DIR` không có file `db-*.dump` nào | chạy `scripts/restore_check.sh` | Exit ≠ 0; thông báo tiếng Việt rõ ràng "Không tìm thấy bản sao lưu…"; không tạo container tạm | docker |
| AC-SYS-113 | 1 file `db-*.dump` trong `BACKUP_DIR` bị hỏng (ví dụ ghi đè bằng vài byte ngẫu nhiên) | chạy `scripts/restore_check.sh` | `pg_restore` báo lỗi → script phát hiện (không coi là thành công), exit ≠ 0, thông báo lỗi tiếng Việt, **vẫn dọn** container/volume tạm đã tạo (không để rác) | docker |
| AC-SYS-114 | 3 file `scripts/deploy.sh`, `scripts/backup.sh`, `scripts/restore_check.sh` | `bash -n <file>` trên cả 3; kiểm tra bit thực thi (`git ls-files -s` → mode `100755`) | Cả 3 cú pháp hợp lệ (exit 0) và có quyền thực thi trong repo | unit |

## 4. API
Không có — item này không thêm/sửa endpoint backend, không đổi `spec/permissions.yaml` hay `spec/state_machines.yaml`.

## 5. Dữ liệu / Migration
Không có bảng/cột mới. `scripts/backup.sh`/`restore_check.sh` chỉ đọc dữ liệu runtime (volume Postgres/uploads) qua `pg_dump`/`pg_restore`, không qua ORM/migration.

## 6. UI
Không có (thuần script vận hành dòng lệnh, không có màn hình).

## 7. Kịch bản UAT thủ công (cho chủ dự án / người có quyền SSH AlmaLinux, ≤ 5 bước)
> Giống M9-01, phiên làm việc hiện tại **không có quyền SSH vào AlmaLinux thật** nên không tự động hoá được 2 bước sau — người vận hành tự thực hiện khi deploy thật:
1. Trên Mac: `cp deploy.env.example deploy.env`, điền `SERVER_HOST`/`SERVER_USER`/`SERVER_PATH` thật; `make build-prod TAG=X && make smoke-prod TAG=X` xanh; chạy `scripts/deploy.sh X` → xác nhận script dump DB server, chuyển image, `up -d --wait`, health check qua `https://ilabsviet.com/smyoutask/api/v1/health` trả `200`.
2. Trên server: thêm vào `crontab` của user `deploy`: `01:00` hằng ngày chạy `scripts/backup.sh`, hằng tháng (ví dụ ngày 1, 02:00) chạy `scripts/restore_check.sh`; chạy thử tay cả hai một lần, xác nhận file xuất hiện ở `/opt/smyou/backups/` và log "✅ khôi phục thử thành công".
3. (Tuỳ chọn, nếu đã có đích rclone/NAS — xem Q79) đặt `RCLONE_REMOTE` trong `.env.prod`/cron env, chạy `scripts/backup.sh` 1 lần, xác nhận file xuất hiện ở đích ngoài server.

## 8. Giả định & câu hỏi
- Giả định: `backup.sh`/`restore_check.sh` chạy **cục bộ trên server** bằng cron (không SSH), nên test tự động bằng stack `smoke-prod` cục bộ là bằng chứng thật cho hành vi trên server, không phải mô phỏng — khác với `deploy.sh` (chạy từ Mac, cần SSH ra server thật, phần đó vẫn giới hạn như M9-01).
- Giả định: "giữ 14 bản" (DEPLOYMENT.md §7) = giữ 14 file mới nhất theo tên/thời gian tạo cho **mỗi loại** (`db-*.dump` và `uploads-*.tar.gz` đếm riêng), không phải tổng 14 file gộp hai loại.
- Giả định: thông báo log của 2 script cron (`backup.sh`, `restore_check.sh`) và `deploy.sh` dùng tiếng Việt có dấu (người vận hành đọc trực tiếp output/log), theo quy tắc CLAUDE.md #10 về thông báo cho người dùng.
- **Câu hỏi mới (Q79, đã thêm vào `OPEN_QUESTIONS.md`):** Đích sao lưu ngoài server (rclone remote hoặc NAS cụ thể) đã có chưa? Nếu chưa, item này implement `RCLONE_REMOTE` như một bước tuỳ chọn (bỏ qua có log nếu chưa cấu hình, không chặn backup cục bộ) — chủ dự án xác nhận hoặc cung cấp remote thật khi sẵn sàng.
