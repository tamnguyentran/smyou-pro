# Open Questions — cần chủ dự án trả lời

AI đang dùng **giả định mặc định** ở cột phải để không bị chặn. Khi chủ dự án trả lời: sửa cột "Quyết định", cập nhật `spec/*.yaml` / `DOMAIN_MODEL.md` nếu cần, đổi trạng thái thành ✅. AI **không** được tự đổi giả định; câu hỏi mới phát sinh thì thêm dòng mới.

| # | Câu hỏi | Giả định mặc định ban đầu | Quyết định | TT |
|---|---|---|---|---|
| Q01 | Giá trong danh mục lưu **đã** hay **chưa** VAT? | Lưu chưa VAT; VAT cấp đơn | Tách **giá (chưa VAT)** và **% VAT** trên từng sản phẩm/dịch vụ; mỗi dòng đơn snapshot % VAT; VAT đơn = Σ VAT dòng. Cờ **Giá cố định Y/N**: Y ⇒ không sửa đơn giá khi tạo đơn | ✅ |
| Q02 | Sale có thấy/sửa đơn của Sale khác không? | Thấy tất cả; chỉ sửa/gửi/huỷ đơn **của mình**; Manager sửa được mọi đơn | Giữ như mặc định | ✅ |
| Q03 | Kỹ thuật viên có được xem giá tiền trên đơn không? | Không | **Có** — KTV xem được giá của đơn mình được giao | ✅ |
| Q04 | Ai được **hoàn tất đơn**? Ai được tải ảnh phiếu? | KTV tải ảnh; chỉ QLKT hoàn tất | KTV được giao **tải ảnh phiếu và được bấm hoàn tất** đơn (QLKT vẫn được) | ✅ |
| Q05 | Manager có được làm thay mọi thao tác của QLKT không? | Không — gán thêm vai trò TECH_LEAD nếu cần | Giữ như mặc định | ✅ |
| Q06 | QLKT có được thao tác thay KTV (nhận/xong hộ)? | Không (giữ dữ liệu KPI trung thực) | Giữ như mặc định | ✅ |
| Q07 | Định dạng mã đơn? | `DH{yyMM}-{seq4}`, seq reset mỗi tháng | Giữ như mặc định | ✅ |
| Q08 | Có cần trường "Phòng phụ trách" trên đơn? | Có, enum `division`, không bắt buộc | Giữ như mặc định | ✅ |
| Q09 | Sau khi gửi đơn, ai được sửa dòng hàng/giá? | Chỉ Manager | **Manager (mọi đơn) và Sale (đơn của mình)**, có audit; được sửa tới trước khi đơn Hoàn tất/Huỷ | ✅ |
| Q10 | Công thức KPI cụ thể? | v1 chỉ thu thập sự kiện + báo cáo số liệu thô; chưa chấm điểm | Giữ như mặc định | ✅ |
| Q11 | Thông báo ngoài app (Zalo OA / email / web push)? | v1 chỉ in-app; kiến trúc chừa chỗ kênh khác | Giữ như mặc định | ✅ |
| Q12 | Server: CPU, domain/HTTPS, registry? | x86_64; có domain; `docker save`/`ssh` | **x86_64**; chạy dưới **subpath `https://ilabsviet.com/smyoutask/`** sau nginx có sẵn trên host (HTTPS do host nginx đảm nhiệm — cấu hình mẫu trong DEPLOYMENT §5); chuyển image bằng `docker save`/`ssh` | ✅ |
| Q13 | Có cần in phiếu yêu cầu / hoá đơn từ hệ thống? | Chưa trong v1 | Giữ như mặc định | ✅ |
| Q14 | Giờ làm việc để tính trễ hạn (trừ Chủ nhật/lễ)? | v1 so `done_at` với `due_at` theo giờ đồng hồ | Giữ như mặc định | ✅ |
| Q15 | Có cần nhập danh mục ban đầu từ Excel? | Có — import CSV/XLSX (backlog M2) | Giữ như mặc định | ✅ |
| Q16 | Dòng có giá cố định có được giảm giá không? | Không | **Có** — giảm giá áp dụng cho mọi dòng; giá cố định chỉ khoá đơn giá | ✅ |
| Q17 | Được đánh dấu "tặng kèm" (giá 0) cho mọi sản phẩm, kể cả giá cố định? | Có | **Có** | ✅ |
| Q18 | Các mức VAT được phép? | 0, 5, 8, 10 | Chọn nhanh **0 / 8 / 10%** hoặc **nhập giá trị khác** (0–100, tối đa 2 số thập phân) | ✅ |
| Q19 | Khi tài khoản bị khoá tạm (5 lần sai), có báo rõ "tạm khoá 15 phút"? | Có — chỉ hiện sau khi đã sai 5 lần | Giữ như đề xuất (2026-09-26) | ✅ |
| Q20 | Tài khoản bị vô hiệu hoá nhập **đúng** mật khẩu: báo "đã bị vô hiệu hoá, liên hệ quản lý"? | Có; nhập sai vẫn chỉ báo "Email hoặc mật khẩu không đúng" | Giữ như đề xuất (2026-09-26) | ✅ |
| Q21 | Quy tắc mật khẩu? | ≥ 8 ký tự, ≤ 128, khác mật khẩu hiện tại, không chứa phần tên của email; không bắt buộc chữ hoa/ký tự đặc biệt | Giữ như đề xuất (2026-09-26) | ✅ |
| Q22 | Manager đầu tiên tạo bằng lệnh CLI có phải đổi mật khẩu lần đầu? | Không | Giữ như đề xuất (2026-09-26) | ✅ |
| Q23 | Đăng nhập / sai mật khẩu / bị khoá có ghi vào Nhật ký hệ thống? | Ghi log ứng dụng ngay; ghi `audit_events` từ M1-05 | Giữ như đề xuất (2026-09-26) | ✅ |
| Q24 | Tách M1-01 thành M1-01a (backend) + M1-01b (giao diện, E2E)? | Có | Giữ như đề xuất (2026-09-26) | ✅ |
| Q25 | Đoán sai mật khẩu hiện tại ở màn Đổi mật khẩu (từ phiên bị lấy cắp) có bị giới hạn? | Chung bộ đếm với đăng nhập; 5 lần → khoá 15', đăng xuất mọi thiết bị, 423; đổi thành công → bộ đếm về 0; khoá do đăng nhập sai không đăng xuất phiên đang dùng | Giữ như đề xuất (2026-09-26, sau review bảo mật M1-01a) | ✅ |
| Q26 | Tách M1-03 thành M1-03a (menu, sidebar, menu trượt, 403/404) và M1-03b (thanh điều hướng dưới đáy, trang Cá nhân)? | Có (~600 dòng giao diện, quá mức ~400/PR) | | ❓ |
| Q27 | Mục menu mà tính năng chưa làm có hiện không? | Hiện; mở ra trang "Tính năng đang được phát triển." | | ❓ |
| Q28 | Ô thứ 2 của thanh dưới đáy cho người nhiều vai trò chọn theo thứ tự nào? | Như nút +: TECH_LEAD > SALE > MANAGER > TECHNICIAN | | ❓ |
| Q29 | Người nhiều vai trò: đầu menu hiện vai trò nào? | Tất cả nhãn vai trò nối bằng " · " (không có "chuyển vai trò") | | ❓ |
| Q30 | Trang Cá nhân gồm gì? | Thông tin (tên, mã, email, vai trò) + Đổi mật khẩu (tự nguyện) + Đăng xuất; sửa thông tin do Manager làm ở M1-04 | | ❓ |
