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
| Q26 | Tách M1-03 thành M1-03a (menu, sidebar, menu trượt, 403/404) và M1-03b (thanh điều hướng dưới đáy, trang Cá nhân)? | Có (~600 dòng giao diện, quá mức ~400/PR) | Giữ như đề xuất (2026-09-26) | ✅ |
| Q27 | Mục menu mà tính năng chưa làm có hiện không? | Hiện; mở ra trang "Tính năng đang được phát triển." | Giữ như đề xuất (2026-09-26) | ✅ |
| Q28 | Ô thứ 2 của thanh dưới đáy cho người nhiều vai trò chọn theo thứ tự nào? | Như nút +: TECH_LEAD > SALE > MANAGER > TECHNICIAN | Giữ như đề xuất (2026-09-26) | ✅ |
| Q29 | Người nhiều vai trò: đầu menu hiện vai trò nào? | Tất cả nhãn vai trò nối bằng " · " (không có "chuyển vai trò") | Giữ như đề xuất (2026-09-26) | ✅ |
| Q30 | Trang Cá nhân gồm gì? | Thông tin (tên, mã, email, vai trò) + Đổi mật khẩu (tự nguyện) + Đăng xuất; sửa thông tin do Manager làm ở M1-04 | Giữ như đề xuất (2026-09-26) | ✅ |
| Q31 | Tách M1-04 thành M1-04a (API) và M1-04b (giao diện)? | Có (như M1-01) | Giữ như đề xuất (2026-09-26) | ✅ |
| Q32 | Mã nhân viên tự sinh hay Manager nhập? | Tự sinh `NV` + số tiếp theo, không sửa được | Giữ như đề xuất (2026-09-26) | ✅ |
| Q33 | Mật khẩu ban đầu / khi cấp lại do ai đặt? | Hệ thống tạo mật khẩu tạm (10 ký tự dễ đọc), hiện một lần cho Manager; nhân viên buộc đổi lần đầu | Giữ như đề xuất (2026-09-26) | ✅ |
| Q34 | Khoá tài khoản có đăng xuất ngay trên mọi thiết bị? | Có; đầu việc đang giao xử lý ở M4-02 | Giữ như đề xuất (2026-09-26) | ✅ |
| Q35 | Manager có được tự khoá chính mình? | Không; được bỏ vai trò Manager của mình nếu còn Manager khác đang hoạt động | Giữ như đề xuất (2026-09-26) | ✅ |
| Q36 | Quản lý kỹ thuật (`employee.read`) xem được gì? | Danh sách + chi tiết, chỉ đọc, qua `/employees` (menu vẫn chỉ cho Manager) | Giữ như đề xuất (2026-09-26) | ✅ |
| Q37 | Mở tạm khoá do sai mật khẩu 5 lần thế nào? | "Cấp lại mật khẩu" xoá luôn tạm khoá; không nút riêng | Giữ như đề xuất (2026-09-26) | ✅ |
| Q38 | Ghi nhật ký thao tác nhân viên? | Log ứng dụng ngay; `audit_events` từ M1-05 (như Q23) | Giữ như đề xuất (2026-09-26) | ✅ |
| Q39 | `audit_events.data.changed_fields` khi sửa nhân viên lưu theo thứ tự nào? | Thứ tự trường trong request | Lưu theo alphabet (đã code + test sẵn); sửa lại chữ ví dụ ở AC-SYS-058 cho khớp | Giữ theo alphabet (2026-09-27) | ✅ |
| Q40 | `PATCH /employees/{id}` không đổi giá trị nào (chỉ gửi `version`) có nên vẫn tăng `version` và ghi audit `action="update", changed_fields=[]`? | Có (hành vi kế thừa từ M1-04a) | Giữ như hiện tại — không thuộc phạm vi M1-05 | Giữ như đề xuất (2026-09-27) | ✅ |
| Q41 | Spec M1-05 đã Approved bị sửa sau khi duyệt (thêm cột `seq`/`clock_timestamp()` để chống trùng giờ event, mở rộng tra tên nhân viên ra mọi trang thay vì 100 dòng đầu) — không đổi AC nào. Chủ dự án xác nhận các sửa này chưa? | — | Xác nhận, chấp nhận thay đổi (2026-09-27) | ✅ |
| Q42 | Tách M2-01 thành M2-01a (API) và M2-01b (giao diện)? | Có (như M1-04) | Giữ như đề xuất (2026-09-27) | ✅ |
| Q43 | Ảnh sản phẩm cần bảng `attachments` chung (dự kiến M6-01, chưa làm) — xây ngay cho M2-01 hay bỏ ảnh khỏi item này? | Xây tối thiểu bảng `attachments` ngay, chỉ `kind=PRODUCT_IMAGE`; M6-01 mở rộng sau | Giữ như đề xuất (2026-09-27) | ✅ |
| Q44 | Mã hàng (`sku`) do Manager tự gõ hay hệ thống tự sinh (khác mã nhân viên Q32)? | Manager tự gõ, hệ thống chỉ kiểm trùng | Giữ như đề xuất (duyệt cùng spec M2-01a, 2026-09-27) | ✅ |
| Q45 | Copy hiển thị khi giá dịch vụ = 0 (DOMAIN_MODEL §3: "tính thực tế khi thi công") trong danh sách/chi tiết dịch vụ là gì? | Hiện "Liên hệ báo giá" | Giữ như đề xuất (2026-09-28) | ✅ |
| Q46 | Import CSV (M2-03a) áp dụng cho Sản phẩm, Dịch vụ, hay cả hai? | Cả hai, 2 endpoint riêng theo entity | Giữ như đề xuất (duyệt cùng spec M2-03a, 2026-09-28) | ✅ |
| Q47 | Backlog M2-03 ghi "CSV/XLSX" nhưng XLSX cần thêm thư viện (`openpyxl`, chưa có trong ARCHITECTURE §2, cần ADR nếu thêm) — làm cả 2 định dạng hay chỉ CSV trước? | M2-03a chỉ làm CSV (module chuẩn, không thêm dependency); XLSX để sau nếu cần | Giữ như đề xuất (duyệt cùng spec M2-03a, 2026-09-28) | ✅ |
| Q48 | Import gặp mã (sku/code) đã tồn tại trong DB: báo lỗi hay tự cập nhật (upsert)? | Báo lỗi (`taken`), không tự sửa | Giữ như đề xuất (duyệt cùng spec M2-03a, 2026-09-28) | ✅ |
| Q49 | Giới hạn file import (số dòng, dung lượng, mã hoá)? | ≤500 dòng dữ liệu, ≤2MB, UTF-8, phân tách bằng dấu phẩy | Giữ như đề xuất (duyệt cùng spec M2-03a, 2026-09-28) | ✅ |
| Q50 | Cảnh báo trùng SĐT khách hàng (M3-01) hiện trước khi lưu (chặn tạm, cần xác nhận thêm bước) hay sau khi lưu (chỉ thông báo)? | Sau khi lưu — server luôn tạo/sửa thành công, trả kèm `duplicate_phone_matches` để FE hiện banner; không có bước xác nhận thứ hai | Giữ như đề xuất (duyệt cùng spec M3-01, 2026-09-29) | ✅ |
| Q51 | Định dạng chuẩn hoá SĐT khách hàng (DOMAIN_MODEL §4 chỉ ghi "chuẩn hoá", không nói rõ)? | Dùng lại quy tắc SĐT nhân viên (DOMAIN_MODEL §1): chỉ chữ số, đúng 10 số bắt đầu `0` | Giữ như đề xuất (duyệt cùng spec M3-01, 2026-09-29) | ✅ |
| Q52 | Đơn nháp (M3-02a) sửa/thêm/xoá dòng khi đơn không còn `DRAFT` (vd đã gửi) có phải guard/transition chính thức trong `spec/state_machines.yaml` không? | Không — coi là guard nghiệp vụ cấp domain, trả `409 ORDER_NOT_DRAFT`, không sửa `spec/state_machines.yaml` | | |
| Q53 | Khi đơn đã chọn khách hàng có sẵn (`customer_id`), có cho phép client tự sửa `customer_name/phone/email/tax_code` lệch khỏi bản ghi khách hàng đó không? | Không — muốn khác thì dùng "Khách lẻ" (`customer_id=null`, tự gõ); đã chọn khách có sẵn thì snapshot luôn đồng bộ theo khách đó | | |
| Q54 | Lệnh `submit` (M3-03) khai `effects: [notify_tech_leads, audit]` nhưng bảng `notifications`/module Thông báo (M7-01) chưa xây — có bỏ qua `notify_tech_leads` ở M3-03 (chỉ ghi `audit`) hay xây tối thiểu bảng `notifications` ngay? | Bỏ qua `notify_tech_leads` ở M3-03; để M7-01 xây trọn module Thông báo (chuông, badge, đánh dấu đã đọc, polling) rồi mới bắn thông báo thật | | |
| Q55 | Tab "Lịch sử" của trang chi tiết đơn (M3-03) cần hiện cho mọi vai trò xem được đơn, nhưng `audit.read` trong `spec/permissions.yaml` chỉ cấp cho MANAGER (trang Nhật ký hệ thống) — dùng route riêng hay mở rộng `audit.read`? | Thêm route riêng `GET /orders/{id}/history` dùng capability `order.read` (đã có), đọc cùng bảng `audit_events` lọc theo đơn — không sửa `audit.read` trong `permissions.yaml` | | |
| Q56 | Mục menu "Danh sách đơn" (`/orders`, M3-03) hiện kế thừa capability `order.create` (chỉ MANAGER/SALE thấy), dù `order.read` cũng cấp cho TECH_LEAD `all` — có thêm TECH_LEAD vào menu này không? | Giữ nguyên (chỉ MANAGER/SALE trong menu); TECH_LEAD sẽ có "Đơn chờ điều phối" riêng ở M4-01; route `/orders` vẫn cho TECH_LEAD xem qua URL trực tiếp (kiểm `order.read` ở tầng dữ liệu) | | |
