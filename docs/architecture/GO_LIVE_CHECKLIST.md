# Go-live checklist (M9-03)

Không có Acceptance Criteria riêng — tài liệu tổng hợp cho chủ dự án, dùng một lần khi go-live thật.
Script tự động liên quan: `scripts/golive_check.sh` (spec `docs/specs/M9-03-golive-checklist.md`).

## 1. Đã xong từ trước (không lặp lại ở đây)
- M9-01: deploy nginx hệ thống, HTTPS tại `https://ilabsviet.com/smyoutask/`.
- M9-02: `scripts/deploy.sh`, `scripts/backup.sh`, `scripts/restore_check.sh` + cron backup/restore-check đã cấu hình trên server.
- Tài khoản Quản lý chung đầu tiên: `python -m app.cli create-manager` (có sẵn từ trước M9-03).

## 2. Chạy kiểm tra an toàn trên server thật
```
scripts/golive_check.sh --env-file /opt/smyou/.env.prod
```
Phải in `✅ Sẵn sàng go-live`. Nếu lỗi, sửa theo thông báo (biến `CHANGE-ME`, `COOKIE_SECURE`/`WEB_BIND` sai, chưa có Quản lý chung, hoặc còn dữ liệu test mã `E2E*`) rồi chạy lại.

Tự kiểm tra trước ở máy dev (không thay thế bước trên server): `make golive-check`.

## 3. Nhập dữ liệu thật
Dùng UI quản lý đã có (không có route/màn hình mới ở M9-03):
- Danh mục Sản phẩm/Dịch vụ: đăng nhập Quản lý chung → "Danh mục" (M2-01, M2-02) — giá, bảo hành theo `Tài liệu tham khảo/`.
- Tài khoản nhân viên thật: "Nhân sự & phân quyền" (M1-04) — tạo cho từng vai trò SALE/TECH_LEAD/TECHNICIAN, giao mật khẩu tạm, yêu cầu đổi khi đăng nhập lần đầu.

## 4. UAT tổng hợp (tick từng dòng, chạy trên dữ liệu thật vừa nhập)
Mỗi dòng tham chiếu §7 (kịch bản UAT thủ công) của spec milestone đó — không viết lại nội dung, chỉ chạy lại và tick.

| ☐ | Spec | Vai trò chính | Bước đầu (§7) |
|---|---|---|---|
| ☐ | M1-01a/b auth | Quản lý chung | `create-manager`, đăng nhập |
| ☐ | M1-02 authz scope/me | Quản lý chung | đăng nhập, kiểm tra menu theo quyền |
| ☐ | M1-03a app shell | Quản lý chung | kiểm tra menu desktop theo vai trò |
| ☐ | M1-04a/b nhân sự | Quản lý chung | tạo nhân viên, nhận mật khẩu tạm |
| ☐ | M1-05 audit | Quản lý chung | khoá tài khoản, xem audit log |
| ☐ | M2-01a/b sản phẩm | Quản lý chung | tạo sản phẩm qua UI |
| ☐ | M2-02 dịch vụ | Quản lý chung | tạo dịch vụ qua UI |
| ☐ | M2-03a/b/c nhập CSV | Quản lý chung | nhập CSV danh mục (preview lỗi) |
| ☐ | M3-01 khách hàng | SALE | tạo khách hàng, kiểm tra trùng SĐT |
| ☐ | M3-02a/b tạo đơn nháp | SALE | tạo đơn nháp |
| ☐ | M3-03a/b gửi đơn | SALE | gửi đơn → "Chờ điều phối" |
| ☐ | M3-04a/b sửa đơn sau gửi | SALE | sửa liên hệ đơn đã gửi |
| ☐ | M3-05 click dòng danh sách | SALE | bấm vào dòng đơn → chi tiết |
| ☐ | M3-06 lọc theo trạng thái | SALE | lọc danh sách đơn theo chip trạng thái |
| ☐ | M4-01a-e tạo đầu việc | TECH_LEAD | tạo đầu việc từ đơn chờ điều phối |
| ☐ | M4-02a/b sửa/hủy đầu việc | TECH_LEAD | sửa, hủy đầu việc đã giao |
| ☐ | M4-03a/b bảng đầu việc | TECH_LEAD | xem bảng đầu việc toàn bộ |
| ☐ | M4-04 lịch & tải việc | TECH_LEAD | xem tải việc theo KTV |
| ☐ | M5-01 việc của tôi | TECHNICIAN | xem đầu việc được giao |
| ☐ | M5-02 nhận/từ chối | TECHNICIAN | nhận hoặc từ chối đầu việc |
| ☐ | M5-03 bắt đầu/hoàn thành | TECHNICIAN | bắt đầu, hoàn thành đầu việc |
| ☐ | M6-01 ảnh xác nhận | TECHNICIAN | tải ảnh phiếu, đơn → "Chờ khách xác nhận" |
| ☐ | M6-02 hoàn tất đơn | TECHNICIAN | hoàn tất đơn sau khi khách ký |
| ☐ | M6-03a/b chỉnh sửa/mở lại | TECH_LEAD | chuyển đơn sang "Chỉnh sửa", ghi lý do |
| ☐ | M6-04 golden path | mọi vai trò | `make e2e` golden-path pass (đã chạy ở dev, không chạy lại trên server) |
| ☐ | M7-01a/b thông báo | mọi vai trò | chuông thông báo khớp số liệu |
| ☐ | M7-02 tổng quan theo vai trò | SALE | thẻ trạng thái khớp số đơn |
| ☐ | M8-01a/b báo cáo KPI | Quản lý chung | xem báo cáo KPI theo khoảng ngày |
| ☐ | M8-04 export CSV an toàn | Quản lý chung | đổi tên nhân viên thành công thức, kiểm tra export không bị injection |

Các spec sau là sửa lỗi/kỹ thuật, không có kịch bản UAT riêng (đã kiểm chứng bằng test tự động, không cần tick thủ công): M1-03b, M3-07, M3-08, M6-03a, M7-01a, M8-03.

## 5. Ký xác nhận go-live
- Ngày go-live: ______________________
- Người xác nhận (chủ dự án): ______________________
- Ký tên: ______________________

Chỉ thông báo khách hàng/nhân viên dùng hệ thống **sau khi** mục 2–4 đã xong và đã ký ở mục 5.
