# Open Questions — cần chủ dự án trả lời

AI đang dùng **giả định mặc định** ở cột phải để không bị chặn. Khi chủ dự án trả lời: sửa cột "Quyết định", cập nhật `spec/*.yaml` / `DOMAIN_MODEL.md` nếu cần, đổi trạng thái thành ✅. AI **không** được tự đổi giả định; câu hỏi mới phát sinh thì thêm dòng mới.

| # | Câu hỏi | Giả định mặc định đang dùng | Quyết định | TT |
|---|---|---|---|---|
| Q01 | Giá trong danh mục lưu **đã** hay **chưa** VAT? (báo giá máy tính ghi "đã gồm VAT", báo giá camera cộng VAT 8% riêng) | Lưu **chưa VAT**; VAT áp ở cấp đơn (`vat_rate` 0/8/10), mặc định 0 | Tách **giá (chưa VAT)** và **% VAT** trên từng sản phẩm/dịch vụ; mỗi dòng đơn snapshot % VAT; VAT đơn = Σ VAT dòng. Thêm cờ **Giá cố định Y/N**: Y ⇒ không sửa đơn giá khi tạo đơn | ✅ |
| Q02 | Sale có thấy/sửa đơn của Sale khác không? | Thấy tất cả; chỉ sửa/gửi/huỷ đơn **của mình**; Manager sửa được mọi đơn | | ❓ |
| Q03 | Kỹ thuật viên có được xem giá tiền trên đơn không? | **Không** | **Có** — KTV xem được giá của đơn mình được giao | ✅ |
| Q04 | Ai được **hoàn tất đơn**? Ai được tải ảnh phiếu? | KTV được giao tải ảnh; chỉ QLKT bấm hoàn tất | | ❓ |
| Q05 | Manager có được làm thay mọi thao tác của QLKT không? | Không — nếu cần, gán thêm vai trò TECH_LEAD cho người đó | | ❓ |
| Q06 | QLKT có được thao tác thay KTV (nhận/xong hộ) khi KTV không có điện thoại? | Không (giữ dữ liệu KPI trung thực) | | ❓ |
| Q07 | Định dạng mã đơn? | `DH{yyMM}-{seq4}`, seq reset mỗi tháng | | ❓ |
| Q08 | Có cần trường "Phòng phụ trách" (Thiết bị văn phòng / An ninh / Kỹ thuật) trên đơn? | Có, enum `division`, không bắt buộc | | ❓ |
| Q09 | Sau khi gửi đơn, ai được sửa dòng hàng/giá? | Chỉ Manager (có audit). Sale chỉ sửa liên hệ/địa chỉ/ghi chú | | ❓ |
| Q10 | Công thức KPI cụ thể (trọng số đúng hạn, từ chối, bị mở lại)? | v1 chỉ thu thập sự kiện + báo cáo số liệu thô; chưa chấm điểm | | ❓ |
| Q11 | Thông báo ngoài app (Zalo OA / email / web push)? | v1 chỉ in-app; kiến trúc chừa chỗ cho kênh khác | | ❓ |
| Q12 | Server AlmaLinux kiến trúc CPU gì (x86_64 hay aarch64)? Có domain + HTTPS? Có registry riêng? | x86_64; có domain; chuyển image qua `docker save`/`ssh` | | ❓ |
| Q13 | Có cần in phiếu yêu cầu / hoá đơn từ hệ thống (mẫu như giấy hiện tại)? | Chưa trong v1 | | ❓ |
| Q14 | Giờ làm việc để tính trễ hạn (có trừ Chủ nhật/lễ)? | v1 so sánh `done_at` với `due_at` theo giờ đồng hồ | | ❓ |
| Q15 | Có cần nhập dữ liệu danh mục ban đầu từ Excel? | Có — import CSV/XLSX sản phẩm & dịch vụ (backlog M2) | | ❓ |
| Q16 | Dòng có giá cố định có được giảm giá không? | Không | **Có** — giảm giá (`line_discount`) áp dụng cho mọi dòng; giá cố định chỉ khoá đơn giá | ✅ |
| Q17 | Có được đánh dấu "tặng kèm" (giá 0) cho mọi sản phẩm, kể cả giá cố định? | Có | **Có** | ✅ |
| Q18 | Các mức VAT được phép? | 0, 5, 8, 10 | Chọn nhanh **0 / 8 / 10%** hoặc **nhập giá trị khác** (0–100, tối đa 2 số thập phân) | ✅ |
