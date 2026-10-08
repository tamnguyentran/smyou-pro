# Backlog

Trạng thái: `[ ]` chưa làm · `[S]` spec đang viết · `[A]` spec Approved · `[~]` đang code · `[R]` PR chờ merge · `[x]` xong.
Mỗi item là **lát cắt dọc** (DB → API → UI → test) giao được trong 1 phiên. Làm theo thứ tự; item sau phụ thuộc item trước.
Prefix AC theo module: `SYS`, `AUTH`, `EMP`, `CAT`, `CUS`, `ORD`, `DSP` (dispatch), `ASG`, `CMP` (completion/revision), `NTF`, `KPI`.

## Đã xong (tự động lưu trữ)
- M5 — xem `BACKLOG_ARCHIVE.md`.

## Đã xong (tự động lưu trữ)
- M4 — xem `BACKLOG_ARCHIVE.md`.

## M0–M3 — đã xong
M0 (nền móng) · M1 (danh tính & phân quyền) · M2 (danh mục) · M3 (khách hàng & đơn hàng) — toàn bộ `[x]`.
Chi tiết từng item (ID, mô tả, spec, PR): `docs/backlog/BACKLOG_ARCHIVE.md`.

## M6 — Hoàn tất & Chỉnh sửa
- [x] **M6-01 Tải ảnh phiếu xác nhận** (nén client, kiểm magic bytes, lưu an toàn, xem có kiểm quyền).
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
