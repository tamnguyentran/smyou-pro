# M26-01 — Hướng dẫn sử dụng theo vai trò (nút ? trên đầu trang)

- **Status:** Approved
- **Backlog:** M26-01a, M26-01b · **Milestone:** M26
- **Liên quan:** spec/permissions.yaml (chỉ đọc vai trò/quyền để chọn nội dung), frontend/src/app/menu.json, `docs/design/UI_GUIDELINES.md`
- **Quyết định chủ dự án (2026-11-06):** mở bằng nút **?** trên đầu trang; mỗi người thấy hướng dẫn của **các vai trò mình có**, riêng **Quản lý chung xem được cả 5 bản** (để đào tạo); nội dung **viết sẵn trong app** (đội phát triển cập nhật cùng tính năng, không có màn hình soạn thảo).

## 1. Mục tiêu
Là nhân viên SMYou, tôi bấm nút ? để đọc hướng dẫn đúng với công việc của vai trò mình (Quản lý chung, Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật, Nhân viên kỹ thuật), không phải đọc phần không liên quan.

## 2. Phạm vi
- Trong phạm vi:
  - Nút ? (`aria-label="Hướng dẫn sử dụng"`, icon `CircleHelp`) cạnh chuông thông báo trên đầu trang — desktop và điện thoại, mọi người đã đăng nhập.
  - Trang `/huong-dan` (chỉ cần đăng nhập, không thêm capability, không có API): tab theo vai trò, mục lục, các mục có bước đánh số.
  - Nội dung 5 bản + phần chung (đăng nhập, đổi mật khẩu, Tổng quan, thông báo, Cá nhân, trạng thái đơn), viết dạng dữ liệu TS trong `frontend/src/features/guide/content/`.
  - Kiểm tra máy: mỗi mục khai báo các màn hình (path) nó hướng dẫn; test chặn việc hướng dẫn nhắc tới màn hình mà vai trò đó không vào được (theo `menu.json` + ma trận quyền).
- Ngoài phạm vi: soạn nội dung trong app; tìm kiếm toàn văn; PDF; ảnh chụp màn hình trong nội dung (có thể thêm sau); hướng dẫn theo ngữ cảnh từng màn hình.
- Tách nhỏ (CLAUDE.md quy tắc 12): **M26-01a** = nút ?, trang, chọn tab, phần chung + bản Nhân viên kỹ thuật + Nhân viên kinh doanh; **M26-01b** = bản Chăm sóc khách hàng, Quản lý kỹ thuật, Quản lý chung.

## 3. Acceptance Criteria
| ID | Given | When | Then | Lớp test |
|---|---|---|---|---|
| AC-HELP-001 | Bất kỳ ai đã đăng nhập (desktop ≥1024px và điện thoại 390px) | xem đầu trang | Có nút "Hướng dẫn sử dụng" (icon ?) cạnh chuông, vùng chạm ≥ 44px; trang đăng nhập không có nút này | component + e2e |
| AC-HELP-002 | Sale Hồng (chỉ SALE) | bấm nút ? | Mở `/huong-dan`; tiêu đề "Hướng dẫn sử dụng"; nội dung bản "Nhân viên kinh doanh" + phần chung; KHÔNG có thanh tab (chỉ 1 vai trò) | component |
| AC-HELP-003 | Hà (SALE + TECHNICIAN) | mở `/huong-dan` | Đúng 2 tab "Nhân viên kinh doanh", "Nhân viên kỹ thuật" (theo thứ tự vai trò); tab đầu được chọn; chọn tab lưu vào URL `?vai-tro=` | component |
| AC-HELP-004 | Quản lý chung Nam | mở `/huong-dan` | Đủ 5 tab: Quản lý chung, Nhân viên kinh doanh, Chăm sóc khách hàng, Quản lý kỹ thuật, Nhân viên kỹ thuật; mặc định "Quản lý chung" | component |
| AC-HELP-005 | Sale Hồng | mở `/huong-dan?vai-tro=TECHNICIAN` | Không hiện bản Nhân viên kỹ thuật; hiện bản của Hồng (bỏ qua tham số không hợp lệ) | component |
| AC-HELP-006 | Mỗi bản | mở | Có mục lục (liên kết tới từng mục); mỗi mục có tiêu đề + các bước đánh số; mỗi bản có mục "Trạng thái đơn hàng" giải thích nhãn trạng thái đúng `spec/state_machines.yaml` | component |
| AC-HELP-007 | Nội dung 5 bản | chạy test | Mọi màn hình (path) mà một mục khai báo đều nằm trong menu nhìn thấy được của vai trò đó (tính từ `menu.json` + ma trận quyền); nhãn trạng thái dùng trong nội dung khớp `state_machines.yaml` | unit |
| AC-HELP-008 | Nội dung bản Nhân viên kỹ thuật | xem | Có các mục: Việc của tôi; Tiếp nhận / Từ chối (bắt buộc lý do); Bắt đầu; Thêm dòng hàng tại hiện trường; Ghi tiềm năng khách hàng; Báo xong (giờ thực tế); Tải ảnh phiếu & Hoàn tất đơn; Khi đầu việc bị mở lại | component |
| AC-HELP-009 | Nội dung bản Nhân viên kinh doanh | xem | Có các mục: Khách hàng; Tạo đơn & dòng hàng (giá cố định, giảm giá, tặng kèm, ghi doanh số); Lưu nháp (cần ≥1 dòng); Gửi đơn (cần địa chỉ thi công); Thu hồi / Huỷ đơn; Sửa liên hệ & dòng hàng sau khi gửi; In hoá đơn (máy tính); Ghi nhận quà tặng KH; Báo cáo doanh thu & KPI của tôi | component |
| AC-HELP-010 | Bản Chăm sóc khách hàng (M26-01b) | xem | Có các mục: Tạo đơn (không gửi được — nhờ Sale/Quản lý chung gửi); Huỷ đơn mình tạo; Phản hồi khách hàng (số sao); Tạo yêu cầu chỉnh sửa; Khách hàng; Quà tặng KH; Thông báo đơn mình tạo; Báo cáo doanh thu của mình | component |
| AC-HELP-011 | Bản Quản lý kỹ thuật (M26-01b) | xem | Có các mục: Đơn chờ điều phối; Tạo đầu việc (giờ, hạn, giao nhiều KTV); Bảng đầu việc & "Cần giao lại"; Thêm/gỡ người, sửa/huỷ đầu việc; Lịch & tải việc; Hoàn tất thay KTV; Chuyển Chỉnh sửa & mở lại đầu việc (mức lỗi, KPI); Đầu việc phát sinh; Công việc theo nhân viên | component |
| AC-HELP-012 | Bản Quản lý chung (M26-01b) | xem | Có các mục: Nhân sự & phân quyền (thêm NV, vai trò, mật khẩu tạm, khoá); Phòng ban; Thông tin công ty; Danh mục (SP/DV/nhóm, giá vốn, nhập CSV, ngừng kinh doanh); Thiết lập doanh thu KPI; Huỷ đơn đang thực hiện; Báo cáo KPI, Biểu đồ kinh doanh, các báo cáo doanh thu; Nhật ký hệ thống; và nhắc "Quản lý chung có thêm mọi quyền của Kinh doanh, CSKH, QLKT — xem các tab tương ứng" | component |
| AC-HELP-013 | Trang ở 390px và 1440px | chụp màn hình | Không cuộn ngang; tab cuộn ngang được trên điện thoại; mục lục thu gọn trên điện thoại; ảnh lưu `reports/screenshots/` | e2e (screenshot) |

## 4. API
Không có. Vai trò lấy từ `/api/v1/me` (đã có). Hiển thị theo vai trò chỉ là chọn nội dung đọc, không cấp quyền gì; mọi thao tác vẫn do server kiểm tra.

## 5. Dữ liệu / Migration
Không có.

## 6. UI
- Đầu trang: nút ghost tròn 44px, icon `CircleHelp`, tooltip/aria "Hướng dẫn sử dụng", đặt bên trái chuông.
- `/huong-dan`: tiêu đề "Hướng dẫn sử dụng"; dưới là thanh tab vai trò (chỉ khi ≥2 bản); mỗi bản: đoạn mở đầu "Bạn làm gì trong hệ thống", mục lục, các mục (tiêu đề H2, đoạn giải thích, danh sách bước đánh số, ghi chú lưu ý dạng khung nhạt), cuối bản là "Trạng thái đơn hàng" và "Câu hỏi thường gặp".
- Tab: Quản lý chung · Nhân viên kinh doanh · Chăm sóc khách hàng · Quản lý kỹ thuật · Nhân viên kỹ thuật (thứ tự cố định).
- Mobile-first 390px: mục lục gói trong `<details>` "Mục lục"; desktop: mục lục cột trái dính (sticky).

## 7. Kịch bản UAT thủ công
1. Đăng nhập quan.tm trên điện thoại → bấm ? → chỉ thấy bản Nhân viên kỹ thuật.
2. Đăng nhập ha.e2e → thấy 2 tab Kinh doanh / Kỹ thuật.
3. Đăng nhập nam.nv → thấy đủ 5 tab.
4. Đọc mục "Tạo đơn" của bản Kinh doanh, làm theo trên app — các bước khớp màn hình thật.

## 8. Giả định & câu hỏi
- Giả định: không thêm capability/menu item (nút ? không thuộc menu); route chỉ cần đăng nhập.
- Giả định: nội dung tiếng Việt viết theo phần mềm hiện tại (sau UAT-01/UAT-02); khi tính năng đổi, cập nhật nội dung trong cùng thay đổi (thêm vào checklist Definition of Done ở `docs/process/WORKFLOW.md`).
