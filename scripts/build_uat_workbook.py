"""Build the UAT workbook (docs/uat/SMYou-Pro-UAT.xlsx) for the dataset of `make reset-uat-data`.

Usage: python3 scripts/build_uat_workbook.py [output.xlsx]

Expected report figures are Excel formulas over the "Dòng hàng", "Phân công" and "Quà tặng" sheets,
so changing a test input there re-computes every expected value. Menu visibility per role is read
from spec/permissions.yaml. Keep the fixtures in sync with backend/scripts/reset_uat_data.py.
"""

from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path

import yaml
from openpyxl import Workbook
from openpyxl.cell.cell import Cell
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.worksheet import Worksheet

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/uat/SMYou-Pro-UAT.xlsx"
PASSWORD = "Uat@SmYou2026"
URL = "http://localhost:5183 (máy dev) — hoặc địa chỉ server UAT được thông báo"

FONT = "Arial"
HEAD_FILL = PatternFill("solid", fgColor="C2410C")
SECTION_FILL = PatternFill("solid", fgColor="FDE7D9")
INPUT_FILL = PatternFill("solid", fgColor="FFF59D")
CALC_FILL = PatternFill("solid", fgColor="EEF2F7")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")
MONEY = "#,##0;-#,##0;0"

Rows = list[list[object]]
Builder = Callable[[int], Rows]

# ---------------------------------------------------------------- people & master data
# (code, name, short, username, roles label, role keys)
STAFF = [
    ("NV01", "Nguyễn Văn Nam", "Nam", "nam.nv", "Quản lý chung (tự kèm Kinh doanh, CSKH, QLKT)", ["MANAGER", "SALE", "CUSTOMER_CARE", "TECH_LEAD"]),
    ("NV02", "Lê Thị Hồng", "Hồng", "hong.lt", "Nhân viên kinh doanh", ["SALE"]),
    ("NV03", "Phạm Quốc Toàn", "Toàn", "toan.pq", "Quản lý kỹ thuật", ["TECH_LEAD"]),
    ("NV04", "Trần Minh Quân", "Quân", "quan.tm", "Nhân viên kỹ thuật", ["TECHNICIAN"]),
    ("NV05", "Đỗ Văn Đạt", "Đạt", "dat.dv", "Nhân viên kỹ thuật", ["TECHNICIAN"]),
    ("NV06", "Nguyễn Thành Long", "Long", "long.nt", "Nhân viên kỹ thuật", ["TECHNICIAN"]),
    ("E2E06", "Lê Thị Hoa", "Hoa", "hoa.e2e", "Nhân viên kinh doanh", ["SALE"]),
    ("E2E09", "Phạm Thu Hà", "Hà", "ha.e2e", "Nhân viên kinh doanh + Nhân viên kỹ thuật", ["SALE", "TECHNICIAN"]),
    ("E2E14", "Nguyễn Thị Lan", "Lan", "lan.cskh", "Chăm sóc khách hàng", ["CUSTOMER_CARE"]),
]
KPI_TARGETS = {
    "Lê Thị Hồng": 10_000_000,
    "Lê Thị Hoa": 8_000_000,
    "Phạm Thu Hà": 6_000_000,
    "Nguyễn Thị Lan": 3_000_000,
    "Trần Minh Quân": 2_000_000,
    "Đỗ Văn Đạt": 2_000_000,
    "Nguyễn Thành Long": 2_000_000,
}
CUSTOMERS = [
    ("E2E-KH-001", "Cty Sáng Tạo Mới E2E", "Tổ chức", "0909123456"),
    ("E2E-KH-002", "Anh Ngọc E2E - Grand Hotel", "Cá nhân", "0918234567"),
    ("E2E-KH-M2105A", "Cty Tiềm Năng Di Động E2E", "Tổ chức", "0918210501"),
]
# (code, name, kind, unit, price, cost, vat, fixed, warranty / estimated hours)
ITEMS = [
    ("E2E-MON-001", "Màn hình Dell 22 inch E2E", "Sản phẩm", "Cái", 2_800_000, 2_240_000, 8, "Có", "36 tháng"),
    ("E2E-PRN-001", "Hộp mực Canon E2E", "Sản phẩm", "Hộp", 850_000, 600_000, 8, "Không", "3 tháng"),
    ("UAT-SP-002", "Camera an ninh Hikvision UAT", "Sản phẩm", "Cái", 1_900_000, 1_330_000, 8, "Có", "24 tháng"),
    ("E2E-DV-002", "Sửa chữa PC E2E", "Dịch vụ", "Lần", 300_000, 150_000, 8, "Không", "2 giờ"),
    ("DV-QAIMP1792114593137", "Vệ sinh QA import DV-QAIMP1792114593137", "Dịch vụ", "Lần", 150_000, 105_000, 8, "Có", "1 giờ"),
]
GROUPS = ["Kỹ thuật chung", "Thiết bị an ninh", "Thiết bị văn phòng"]
DEPARTMENTS = ["Phát Triển Kinh Tế", "Nhân sự/Marketing", "Kế Toán - Tài chính"]

# ---------------------------------------------------------------- order lines of the case studies
# (case, order, customer code, group, final status, item code, qty, unit price, discount, gift, credited)
O1, O2 = "CS1 – Lắp camera Cty Sáng Tạo", "CS2 – Màn hình + mực Anh Ngọc"
O3, O4 = "CS3 – Vệ sinh máy Cty Tiềm Năng", "CS4 – Giao mực (CSKH tạo)"
LINES = [
    ("CS1", O1, "E2E-KH-001", "Thiết bị an ninh", "Hoàn tất", "UAT-SP-002", 2, 1_900_000, 0, "Không", "Lê Thị Hồng"),
    ("CS1", O1, "E2E-KH-001", "Thiết bị an ninh", "Hoàn tất", "E2E-DV-002", 1, 300_000, 0, "Không", "Lê Thị Hồng"),
    ("CS2", O2, "E2E-KH-002", "Thiết bị văn phòng", "Hoàn tất", "E2E-MON-001", 1, 2_800_000, 0, "Không", "Lê Thị Hoa"),
    ("CS2", O2, "E2E-KH-002", "Thiết bị văn phòng", "Hoàn tất", "E2E-PRN-001", 2, 800_000, 50_000, "Không", "Lê Thị Hoa"),
    ("CS2", O2, "E2E-KH-002", "Thiết bị văn phòng", "Hoàn tất", "DV-QAIMP1792114593137", 2, 150_000, 0, "Không", "Đỗ Văn Đạt"),
    ("CS3", O3, "E2E-KH-M2105A", "Kỹ thuật chung", "Đang thực hiện", "DV-QAIMP1792114593137", 3, 150_000, 0, "Không", "Phạm Thu Hà"),
    ("CS4", O4, "E2E-KH-001", "Thiết bị văn phòng", "Hoàn tất", "E2E-PRN-001", 2, 850_000, 0, "Không", "Nguyễn Thị Lan"),
    ("CS4", O4, "E2E-KH-001", "Thiết bị văn phòng", "Hoàn tất", "E2E-PRN-001", 1, 0, 0, "Có", "Nguyễn Thị Lan"),
    ("CS5", "CS5A – Nháp bị huỷ", "E2E-KH-002", "Kỹ thuật chung", "Đã huỷ", "E2E-DV-002", 1, 300_000, 0, "Không", "Lê Thị Hồng"),
    ("CS5", "CS5B – Huỷ khi đang thực hiện", "E2E-KH-M2105A", "Kỹ thuật chung", "Đã huỷ", "E2E-DV-002", 2, 300_000, 0, "Không", "Lê Thị Hồng"),
]
# (case, task, cycle, technician, estimated hours, final status, reject reason, actual hours, defect)
ASSIGNMENTS = [
    ("CS1", "Lắp đặt 2 camera + kiểm tra PC", 1, "Trần Minh Quân", 3, "Xong", "", 3, 0),
    ("CS1", "Lắp đặt 2 camera + kiểm tra PC", 1, "Đỗ Văn Đạt", 3, "Xong", "", 3, 0),
    ("CS2", "Thay màn hình + mực", 1, "Nguyễn Thành Long", 2, "Từ chối", "Không đủ thời gian (đang nhiều việc)", None, 0),
    ("CS2", "Thay màn hình + mực", 1, "Đỗ Văn Đạt", 2, "Xong", "", 2.5, 1),
    ("CS2", "Thay màn hình + mực (mở lại)", 2, "Đỗ Văn Đạt", 2, "Xong", "", 1, 0),
    ("CS3", "Vệ sinh 3 máy tính", 1, "Phạm Thu Hà", 1.5, "Đang thực hiện", "", None, 0),
    ("CS3", "Vệ sinh 3 máy tính", 1, "Nguyễn Thành Long", 1.5, "Đã tiếp nhận", "", None, 0),
    ("CS4", "Giao mực máy in", 1, "Nguyễn Thành Long", 1, "Xong", "", 1, 0),
    ("CS5", "Kiểm tra PC", 1, "Trần Minh Quân", 2, "Đã gỡ", "", None, 0),
    ("CS5", "Kiểm tra PC", 1, "Nguyễn Thành Long", 2, "Đã gỡ", "", None, 0),
]
# (customer code, occasion, gift, qty, unit price, other cost, performed by, requested by)
GIFTS = [
    ("E2E-KH-001", "Quà Tết 2027", "Giỏ quà Tết", 2, 500_000, 50_000, "Nguyễn Thị Lan", "Nguyễn Văn Nam"),
    ("E2E-KH-M2105A", "Sinh nhật công ty", "Lẵng hoa chúc mừng", 1, 300_000, 0, "Lê Thị Hồng", "Nguyễn Văn Nam"),
]
PARETO_ORDER = ["UAT-SP-002", "E2E-PRN-001", "E2E-MON-001", "E2E-DV-002", "DV-QAIMP1792114593137"]

# ---------------------------------------------------------------- test steps
# Each case: (id prefix, flow, case study, [(actor, device, screen, action, input, expected)])
D, M, B = "Desktop", "Điện thoại", "Desktop / Điện thoại"
NAM, HONG, TOAN = "Nam – Quản lý chung (nam.nv)", "Hồng – Sale (hong.lt)", "Toàn – QLKT (toan.pq)"
QUAN, DAT, LONG = "Quân – KTV (quan.tm)", "Đạt – KTV (dat.dv)", "Long – KTV (long.nt)"
HOA, HA, LAN = "Hoa – Sale (hoa.e2e)", "Hà – Sale + KTV (ha.e2e)", "Lan – CSKH (lan.cskh)"
NEW = "Đơn hàng › Tạo đơn mới"
QUEUE = "Điều phối kỹ thuật › Đơn chờ điều phối"
MYWORK = "Việc của tôi"
ADD_LINE = "Chi tiết đơn nháp › Thêm dòng hàng"

CASES = [
    ("P0", "0. Chuẩn bị & dữ liệu nền", "Đưa hệ thống về dữ liệu UAT chuẩn, kiểm tra đăng nhập và dữ liệu nền", [
        ("Người điều phối UAT", "Server / máy dev", "Terminal", "Backup rồi reset dữ liệu UAT: server → 2 lệnh ở DEPLOYMENT.md §10 (có cờ --allow-production); máy dev → make reset-uat-data", "—", "Lệnh in số bản ghi đã xoá; dòng cuối 'UAT accounts password: Uat@SmYou2026'; không có lỗi."),
        ("Từng người test", B, "Trang Đăng nhập", "Đăng nhập lần lượt 9 tài khoản (sheet 'Tài khoản & dữ liệu')", f"Tên đăng nhập theo bảng; mật khẩu {PASSWORD}", "Vào được 'Tổng quan'; họ tên + vai trò hiển thị đúng; không bị ép đổi mật khẩu."),
        (HONG, B, "Trang Đăng nhập", "Nhập sai mật khẩu", "hong.lt / SaiMatKhau1", "Báo sai tên đăng nhập hoặc mật khẩu (tiếng Việt); không vào được."),
        ("Từng người test", B, "Menu trái (desktop) / thanh dưới (điện thoại)", "Đối chiếu menu với sheet 'Ma trận phân quyền'", "—", "Chỉ thấy đúng các mục ✓ của mình; không thấy mục —."),
        (NAM, D, "Thông tin Công ty › Thông tin Công ty", "Mở xem", "—", "CÔNG TY TNHH SMYOU, MST 0309390732, logo hiển thị."),
        (NAM, D, "Thông tin Công ty › Phòng ban", "Mở xem", "—", "Đúng 3 phòng ban: Phát Triển Kinh Tế, Nhân sự/Marketing, Kế Toán - Tài chính."),
        (NAM, D, "Thông tin Công ty › Nhân sự & phân quyền", "Mở xem", "—", "Đúng 9 nhân viên NV01–NV06, E2E06, E2E09, E2E14; vai trò như sheet dữ liệu."),
        (NAM, D, "Danh mục › Sản phẩm / Dịch vụ", "Mở xem 2 danh sách", "—", "3 sản phẩm + 2 dịch vụ đang kinh doanh; Giá bán / Giá vốn / VAT 8% như sheet dữ liệu."),
        (NAM, D, "Danh mục › Nhóm sản phẩm/dịch vụ", "Mở xem", "—", "Đúng 3 nhóm: Kỹ thuật chung, Thiết bị an ninh, Thiết bị văn phòng."),
        (NAM, D, "Đơn hàng › Khách hàng", "Mở xem", "—", "Đúng 3 khách: E2E-KH-001, E2E-KH-002, E2E-KH-M2105A."),
        (NAM, D, "Thông tin Công ty › Thiết lập doanh thu KPI", "Chọn tháng hiện tại", "—", "Hồng 10.000.000; Hoa 8.000.000; Hà 6.000.000; Lan 3.000.000; Quân, Đạt, Long 2.000.000; Nam, Toàn trống. 2 tháng sau giống vậy."),
        (NAM, D, "Tổng quan; Đơn hàng › Danh sách đơn", "Mở xem", "—", "Chưa có đơn hàng; các thẻ đơn / điều phối / đầu việc / CSKH = 0; thẻ 'Nhân sự kỹ thuật › Chờ giao việc' = 4 (4 KTV chưa có việc)."),
    ]),
    ("CS1", "1. Luồng chuẩn: Sale → QLKT → 2 KTV → khách ký → CSKH đánh giá", "Cty Sáng Tạo Mới đặt lắp 2 camera và sửa 1 PC; 2 kỹ thuật viên cùng làm; khách hài lòng", [
        (HONG, D, NEW, "Chọn khách hàng, nhóm, nhập thông tin → thêm dòng (bước 02) → Lưu nháp. Nút 'Lưu nháp' chỉ mở khi đã có ≥1 dòng hàng (M10-02): làm bước thêm dòng kế tiếp rồi mới Lưu nháp", "KH: E2E-KH-001 Cty Sáng Tạo Mới E2E; Nhóm SP/DV: Thiết bị an ninh; Địa chỉ thi công: 12 Nguyễn Huệ, Q.1, TP.HCM; Mô tả: Lắp 2 camera + kiểm tra PC; Ưu tiên: Cao; Ngày hẹn: hôm nay + 2", "Chưa có dòng: 'Lưu nháp' bị khoá, gợi ý 'Cần thêm ít nhất 1 dòng hàng.' Tên, SĐT 0909123456 của khách tự điền. Sau khi lưu: đơn mã DH<yyMM>-0001, trạng thái 'Nháp'."),
        (HONG, D, ADD_LINE, "Thêm sản phẩm", "UAT-SP-002 Camera an ninh Hikvision UAT; SL 2", "Đơn giá 1.900.000 bị khoá (giá cố định); VAT 8%; bảo hành 24 tháng; 'Ghi doanh số' mặc định Lê Thị Hồng; Thành tiền 4.104.000."),
        (HONG, D, "Chi tiết đơn nháp › dòng Camera", "Thử sửa đơn giá", "1.800.000", "Không sửa được / báo lỗi giá cố định; giữ 1.900.000."),
        (HONG, D, ADD_LINE, "Thêm dịch vụ", "E2E-DV-002 Sửa chữa PC E2E; SL 1; Đơn giá 300.000", "Thành tiền 324.000. Tổng đơn: Tạm tính 4.100.000; VAT 328.000; Tổng cộng 4.428.000."),
        (HONG, D, "Chi tiết đơn nháp", "Gửi đơn → Xác nhận", "—", "'Chờ điều phối'. Toàn nhận thông báo; đơn có ở 'Đơn chờ điều phối' (badge +1)."),
        (TOAN, D, QUEUE, "Mở đơn → Tạo đầu việc", "Tiêu đề: Lắp đặt 2 camera + kiểm tra PC; Số giờ ước tính: 3; Hạn hoàn thành: hôm nay + 2; Giao: Trần Minh Quân, Đỗ Văn Đạt", "Đầu việc 'Chờ tiếp nhận'; ĐƠN chuyển 'Đang thực hiện' ngay khi có phân công (Q90); Quân và Đạt nhận thông báo giao việc; Hồng và Toàn nhận thông báo 'Đơn hàng đã bắt đầu thực hiện'."),
        (QUAN, M, MYWORK, "Mở đầu việc → Tiếp nhận", "—", "Phân công của Quân 'Đã tiếp nhận'; đơn giữ 'Đang thực hiện'."),
        (DAT, M, MYWORK, "Tiếp nhận", "—", "Phân công của Đạt 'Đã tiếp nhận'."),
        (QUAN, M, MYWORK, "Bắt đầu", "—", "Đầu việc 'Đang thực hiện'; đơn giữ 'Đang thực hiện' (đã chuyển ở bước 06, không gửi thông báo lần nữa)."),
        (QUAN, M, MYWORK, "Tìm nút Từ chối", "—", "Không còn 'Từ chối' sau khi đã tiếp nhận."),
        (DAT, M, MYWORK, "Bắt đầu", "—", "Phân công của Đạt 'Đang thực hiện'."),
        (QUAN, M, MYWORK, "Xong", "Giờ thực tế: 3", "Phân công Quân 'Xong'; đầu việc VẪN 'Đang thực hiện' (Đạt chưa xong)."),
        (DAT, M, MYWORK, "Xong", "Giờ thực tế: 3", "Đầu việc 'Hoàn thành'; ĐƠN 'Chờ KH xác nhận'; Toàn và Hồng nhận thông báo."),
        (QUAN, M, "Chi tiết đơn", "Tìm nút 'Hoàn tất đơn' khi chưa có ảnh phiếu", "—", "KHÔNG có nút 'Hoàn tất đơn' cho tới khi tải ảnh phiếu xác nhận (AC-ORD-140)."),
        (QUAN, M, "Chi tiết đơn › Tải ảnh phiếu xác nhận", "Chụp/tải ảnh phiếu đã ký", "Ảnh JPG/PNG", "Ảnh hiện trong danh sách ảnh phiếu xác nhận."),
        (QUAN, M, "Chi tiết đơn", "Hoàn tất đơn", "Tên người ký: Nguyễn Văn Bảo", "Đơn 'Hoàn tất'; Hồng và Toàn nhận thông báo."),
        (LAN, D, "Đơn hàng › Danh sách đơn", "Tắt 'Chỉ đơn của tôi' → mở đơn CS1 → Phản hồi khách hàng", "Số sao: 5; Nội dung: Khách hài lòng, lắp đúng hẹn", "Lưu; đơn tô màu 5 sao; ô thống kê '5 sao' tăng 1."),
        (HONG, "Desktop ≥ 1024px", "Chi tiết đơn CS1", "In", "—", "Hoá đơn bán hàng A5: thông tin công ty, khách, 2 dòng hàng, Tổng cộng 4.428.000."),
        (HONG, M, "Chi tiết đơn CS1", "Tìm nút In", "—", "Không có nút 'In' trên điện thoại."),
    ]),
    ("CS2", "2. Từ chối → giao lại → KTV thêm dòng tại hiện trường → ghi tiềm năng → CSKH yêu cầu sửa → Chỉnh sửa, mở lại (lỗi KPI)", "Anh Ngọc thay màn hình + mực; KTV đầu bận; KTV sau bán thêm dịch vụ vệ sinh; khách phản ánh lắp lệch → làm lại", [
        (HOA, D, NEW, "Tạo đơn → thêm dòng (bước 02) → Lưu nháp. Nút 'Lưu nháp' chỉ mở khi đã có ≥1 dòng hàng (M10-02): làm bước thêm dòng kế tiếp rồi mới Lưu nháp", "KH: E2E-KH-002 Anh Ngọc E2E - Grand Hotel; Nhóm SP/DV: Thiết bị văn phòng; Địa chỉ: 45 Lê Lợi, Q.1; Mô tả: Thay màn hình + mực máy in; Ưu tiên: Bình thường", "Đơn 'Nháp'."),
        (HOA, D, ADD_LINE, "Thêm sản phẩm", "E2E-MON-001 Màn hình Dell 22 inch E2E; SL 1", "Đơn giá 2.800.000 cố định; bảo hành 36 tháng; Ghi doanh số = Lê Thị Hoa; Thành tiền 3.024.000."),
        (HOA, D, ADD_LINE, "Thêm sản phẩm, sửa giá, giảm giá", "E2E-PRN-001 Hộp mực Canon E2E; SL 2; Đơn giá 800.000; Giảm giá 50.000", "Cho sửa giá (không cố định). Thành tiền 1.674.000 (= 1.600.000 − 50.000 + VAT 124.000). Tổng đơn 4.698.000."),
        (HOA, D, "Chi tiết đơn nháp", "Gửi đơn", "—", "'Chờ điều phối'; Toàn nhận thông báo."),
        (TOAN, D, QUEUE, "Tạo đầu việc", "Tiêu đề: Thay màn hình + mực; Số giờ ước tính: 2; Hạn: hôm nay + 2; Giao: Nguyễn Thành Long", "Long nhận thông báo; đơn 'Đang thực hiện' (Q90)."),
        (LONG, M, MYWORK, "Từ chối, không chọn lý do", "—", "Không gửi được — bắt buộc lý do."),
        (LONG, M, MYWORK, "Từ chối", "Lý do: Không đủ thời gian (đang nhiều việc); Chi tiết: Đang ở công trình khác", "Phân công 'Đã từ chối'; đầu việc 'Cần giao lại' (báo đỏ ở Bảng đầu việc); ĐƠN về 'Chờ điều phối' (không còn ai được giao); Toàn nhận thông báo từ chối; Toàn và Hoa nhận thông báo 'Đơn hàng quay lại chờ điều phối'."),
        (TOAN, D, "Điều phối kỹ thuật › Bảng đầu việc", "Mở đầu việc → + Thêm người", "Đỗ Văn Đạt", "Đầu việc 'Chờ tiếp nhận'; ĐƠN quay lại 'Đang thực hiện'; Đạt nhận thông báo; Hoa và Toàn nhận thông báo đơn bắt đầu thực hiện."),
        (DAT, M, MYWORK, "Tiếp nhận → Bắt đầu", "—", "Đầu việc 'Đang thực hiện'; đơn 'Đang thực hiện'."),
        (DAT, M, "Chi tiết đơn › tab Dòng hàng", "Thêm dòng hàng (tại hiện trường)", "DV-QAIMP1792114593137 Vệ sinh…; SL 2", "Ô chọn KHÔNG hiện giá vốn. Dòng mới có nhãn 'KTV thêm', Ghi doanh số = Đỗ Văn Đạt; Thành tiền 324.000; Tổng đơn 5.022.000; Hoa và Toàn nhận thông báo."),
        (DAT, M, "Chi tiết đơn › tab Dòng hàng", "Tìm nút sửa/xoá trên dòng Màn hình (Hoa thêm)", "—", "Không sửa/xoá được dòng người khác; chỉ dòng mình thêm."),
        (DAT, M, "Chi tiết đơn › Tiềm năng sử dụng dịch vụ", "Ghi tiềm năng", "Khách muốn lắp camera cho nhà riêng, liên hệ lại tháng 1/2027", "Lưu; hiện trong lịch sử kèm tên Đạt, mã đơn, thời điểm."),
        (DAT, M, MYWORK, "Xong", "Giờ thực tế: 2,5", "Đầu việc 'Hoàn thành'; đơn 'Chờ KH xác nhận'."),
        (DAT, M, "Chi tiết đơn", "Tải ảnh phiếu → Hoàn tất đơn", "Ảnh phiếu; Tên người ký: Anh Ngọc", "Đơn 'Hoàn tất'."),
        (LAN, D, "Danh sách đơn › đơn CS2 › Phản hồi khách hàng", "Chọn 2 sao, để trống nội dung, lưu", "—", "Báo lỗi bắt buộc nội dung; không lưu."),
        (LAN, D, "Danh sách đơn › đơn CS2 › Phản hồi khách hàng", "Lưu phản hồi", "Số sao: 3; Nội dung: Màn hình lắp lệch, khách muốn chỉnh lại", "Lưu; xuất hiện nút 'Tạo yêu cầu chỉnh sửa'."),
        (LAN, D, "Chi tiết đơn CS2", "Tạo yêu cầu chỉnh sửa", "Nội dung điền sẵn = phản hồi; thêm: Nhờ QLKT cử người chỉnh lại", "Badge 'Đã gửi yêu cầu chỉnh sửa (chưa xử lý)'; đơn VẪN 'Hoàn tất'; Toàn nhận thông báo."),
        (TOAN, D, "Chi tiết đơn CS2", "Chuyển Chỉnh sửa", "Lý do: Màn hình lắp lệch theo phản ánh khách", "Đơn 'Chỉnh sửa'; badge yêu cầu ẩn; đơn có ở 'Đơn cần chỉnh sửa'; Hoa nhận thông báo; đơn KHÔNG tự về 'Chờ KH xác nhận' khi chưa có việc mới."),
        (TOAN, D, "Chi tiết đầu việc 'Thay màn hình + mực'", "Mở lại đầu việc", "Lý do: Lắp lệch màn hình; Mức độ lỗi: Nhẹ (form không có ô chọn người)", "Hệ thống tự giao lại cho người đã làm xong chu kỳ 1 (Đạt); đầu việc chu kỳ 2 'Chờ tiếp nhận'; lịch sử chu kỳ 1 còn; ghi 1 lỗi KPI cho Đạt; Đạt nhận thông báo."),
        (DAT, M, MYWORK, "Tiếp nhận → Bắt đầu → Xong", "Giờ thực tế: 1", "Đầu việc 'Hoàn thành'; đơn 'Chờ KH xác nhận'."),
        (DAT, M, "Chi tiết đơn", "Tìm nút 'Hoàn tất đơn' khi chưa tải ảnh mới", "—", "KHÔNG có nút 'Hoàn tất đơn': ảnh phiếu lần trước không tính, lần chỉnh sửa này cần ảnh mới."),
        (DAT, M, "Chi tiết đơn", "Tải ảnh phiếu mới → Hoàn tất đơn", "Ảnh phiếu lần 2; Tên người ký: Anh Ngọc", "Đơn 'Hoàn tất'; tổng đơn giữ 5.022.000."),
    ]),
    ("CS3", "3. Vai trò kết hợp Sale + KTV; đơn dở dang", "Hà tạo đơn vệ sinh 3 máy cho Cty Tiềm Năng rồi tự nhận việc; dừng ở 'Đang thực hiện'", [
        (HA, D, NEW, "Tạo đơn → thêm dòng (bước 02) → Lưu nháp. Nút 'Lưu nháp' chỉ mở khi đã có ≥1 dòng hàng (M10-02): làm bước thêm dòng kế tiếp rồi mới Lưu nháp", "KH: E2E-KH-M2105A Cty Tiềm Năng Di Động E2E; Nhóm SP/DV: Kỹ thuật chung; Địa chỉ thi công: 88 Điện Biên Phủ, Q. Bình Thạnh, TP.HCM; Mô tả: Vệ sinh 3 máy tính văn phòng", "Đơn 'Nháp'."),
        (HA, D, ADD_LINE, "Thêm dịch vụ", "DV-QAIMP1792114593137; SL 3", "Đơn giá 150.000 cố định; Thành tiền 486.000; Ghi doanh số = Phạm Thu Hà."),
        (HA, D, "Chi tiết đơn nháp", "Gửi đơn", "—", "'Chờ điều phối'; Toàn nhận thông báo."),
        (TOAN, D, QUEUE, "Tạo đầu việc", "Tiêu đề: Vệ sinh 3 máy tính; Số giờ ước tính: 1,5; Hạn: hôm nay + 3; Giao: Phạm Thu Hà, Nguyễn Thành Long", "Hà và Long nhận thông báo; đơn 'Đang thực hiện' (Q90)."),
        (HA, M, "Menu", "Kiểm tra", "—", "Có cả 'Đơn hàng' (Sale) và 'Việc của tôi' (KTV)."),
        (HA, M, MYWORK, "Tiếp nhận → Bắt đầu", "—", "Đơn 'Đang thực hiện'."),
        (LONG, M, MYWORK, "Tiếp nhận (KHÔNG bắt đầu)", "—", "Phân công Long 'Đã tiếp nhận'. DỪNG — đơn giữ 'Đang thực hiện'."),
    ]),
    ("CS4", "4. CSKH tạo đơn, hàng tặng kèm; Manager gửi; QLKT tự hoàn tất", "Lan lên đơn giao 2 hộp mực, tặng 1 hộp cho Cty Sáng Tạo Mới; QLKT xác nhận thay KTV", [
        (LAN, D, NEW, "Tạo đơn → thêm dòng (bước 02) → Lưu nháp. Nút 'Lưu nháp' chỉ mở khi đã có ≥1 dòng hàng (M10-02): làm bước thêm dòng kế tiếp rồi mới Lưu nháp", "KH: E2E-KH-001; Nhóm SP/DV: Thiết bị văn phòng; Địa chỉ thi công: 12 Nguyễn Huệ, Q.1, TP.HCM; Mô tả: Giao 2 hộp mực, tặng 1 hộp", "Đơn 'Nháp'."),
        (LAN, D, ADD_LINE, "Thêm sản phẩm", "E2E-PRN-001 Hộp mực Canon E2E; SL 2; Đơn giá 850.000", "Thành tiền 1.836.000; Ghi doanh số = Nguyễn Thị Lan."),
        (LAN, D, ADD_LINE, "Thêm dòng tặng kèm", "E2E-PRN-001; SL 1; tick 'Tặng kèm'", "Đơn giá 0, thành tiền 0; tổng đơn 1.836.000."),
        (LAN, D, "Chi tiết đơn nháp", "Tìm nút Gửi đơn", "—", "CSKH KHÔNG có 'Gửi đơn' (chỉ Sale chủ đơn / Manager); CÓ 'Huỷ đơn' vì là đơn Lan tạo (Q183) — KHÔNG bấm."),
        (NAM, D, "Đơn hàng › Danh sách đơn", "Mở đơn nháp của Lan → Gửi đơn", "—", "'Chờ điều phối'; Toàn nhận thông báo."),
        (TOAN, D, QUEUE, "Tạo đầu việc", "Tiêu đề: Giao mực máy in; Số giờ ước tính: 1; Hạn: hôm nay + 1; Giao: Nguyễn Thành Long", "Long nhận thông báo; đơn 'Đang thực hiện' (Q90); Lan (người tạo đơn) nhận thông báo 'Đơn hàng đã bắt đầu thực hiện' ở chuông (Q184)."),
        (LONG, M, MYWORK, "Tiếp nhận → Bắt đầu → Xong", "Giờ thực tế: 1", "Đơn 'Chờ KH xác nhận'; Lan nhận thông báo 'Đơn hàng chờ khách xác nhận'."),
        (TOAN, D, "Chi tiết đơn", "Tải ảnh phiếu → Hoàn tất đơn (QLKT làm thay)", "Ảnh phiếu; Tên người ký: Chị Mai – Cty Sáng Tạo Mới", "Đơn 'Hoàn tất'; Lan nhận thông báo 'Đơn hàng đã hoàn tất'. KHÔNG ghi phản hồi CSKH cho đơn này (để kiểm 'Chưa đánh giá')."),
    ]),
    ("CS5", "5. Huỷ nháp, thu hồi, gỡ người, huỷ đơn đang thực hiện", "Khách đổi ý; gửi nhầm số lượng; KTV bị gỡ; khách hoãn dự án", [
        (HONG, D, NEW, "Tạo đơn nháp → Huỷ đơn", "KH: E2E-KH-002; Nhóm: Kỹ thuật chung; dòng E2E-DV-002 SL 1; Lý do huỷ: Khách đổi ý", "Đơn 'Đã huỷ'; không sửa được nữa."),
        (HONG, D, NEW, "Tạo đơn → Gửi đơn", "KH: E2E-KH-M2105A; Nhóm: Kỹ thuật chung; Địa chỉ thi công: 88 Điện Biên Phủ, Q. Bình Thạnh, TP.HCM; dòng E2E-DV-002 SL 1", "'Chờ điều phối'."),
        (HONG, D, "Chi tiết đơn", "Thu hồi → sửa SL = 2 → Gửi đơn lại", "—", "Thu hồi về 'Nháp'; sửa được; gửi lại 'Chờ điều phối'."),
        (TOAN, D, QUEUE, "Tạo đầu việc", "Tiêu đề: Kiểm tra PC; Số giờ ước tính: 2; Hạn: hôm nay + 2; Giao: Trần Minh Quân", "Quân nhận thông báo; đơn 'Đang thực hiện' (Q90)."),
        (HONG, D, "Chi tiết đơn", "Tìm nút Thu hồi", "—", "Không còn 'Thu hồi' khi đã có đầu việc."),
        (QUAN, M, MYWORK, "Tiếp nhận → Bắt đầu", "—", "Đơn 'Đang thực hiện'."),
        (TOAN, D, "Bảng đầu việc › Kiểm tra PC", "Gỡ Trần Minh Quân", "—", "Quân nhận thông báo bị gỡ; đầu việc 'Cần giao lại'; ĐƠN về 'Chờ điều phối'; Hồng và Toàn nhận thông báo."),
        (TOAN, D, "Bảng đầu việc", "+ Thêm người", "Nguyễn Thành Long", "Long nhận thông báo; ĐƠN quay lại 'Đang thực hiện'."),
        (LONG, M, MYWORK, "Tiếp nhận → Bắt đầu", "—", "Đơn 'Đang thực hiện'."),
        (HONG, D, "Chi tiết đơn", "Tìm nút Huỷ đơn", "—", "Sale không huỷ được đơn đang thực hiện."),
        (NAM, D, "Chi tiết đơn", "Huỷ đơn", "Lý do huỷ: Khách hoãn dự án", "Đơn 'Đã huỷ'; đầu việc 'Đã huỷ'; Long nhận thông báo."),
    ]),
    ("CS6", "6. Ghi nhận quà tặng khách hàng", "CSKH và Sale ghi nhận chi phí quà tặng cho 2 khách", [
        (LAN, D, "Đơn hàng › Ghi nhận quà tặng KH", "Thêm bản ghi", "KH: E2E-KH-001; Dịp/lễ: Quà Tết 2027; Ngày: hôm nay; Tên quà: Giỏ quà Tết; SL 2; Đơn giá 500.000; Chi phí khác 50.000; Người thực hiện: Nguyễn Thị Lan; Người yêu cầu: Nguyễn Văn Nam; Tải ảnh quà tặng", "Tổng chi phí tự tính 1.050.000; ảnh hiển thị."),
        (HONG, D, "Đơn hàng › Ghi nhận quà tặng KH", "Thêm bản ghi", "KH: E2E-KH-M2105A; Dịp/lễ: Sinh nhật công ty; Tên quà: Lẵng hoa chúc mừng; SL 1; Đơn giá 300.000; Chi phí khác 0; Người thực hiện: Lê Thị Hồng; Người yêu cầu: Nguyễn Văn Nam", "Tổng 300.000."),
        (HONG, D, "Ghi nhận quà tặng KH", "Sửa ghi chú bản vừa tạo; tìm nút Xoá", "Ghi chú: Giao trước 9h", "Lưu được; KHÔNG có nút xoá."),
        (QUAN, M, "Menu", "Tìm mục quà tặng", "—", "KTV không thấy 'Ghi nhận quà tặng KH' / 'Chi phí quà tặng KH'."),
    ]),
    ("KH", "7. Khách hàng", "Sale thêm khách mới (không phát sinh đơn — không ảnh hưởng báo cáo)", [
        (HONG, D, "Đơn hàng › Khách hàng", "Thêm khách hàng tổ chức", "Tên: Cty UAT Thử Nghiệm; SĐT: 0901111222; MST 0312345999; Người liên hệ: Anh Tú, 0901111222; Giám đốc: Ông Hải; Phụ trách IT: Anh Minh", "Mã KH tự sinh; lưu đủ trường tổ chức."),
        (HONG, D, "Chi tiết khách vừa tạo", "Sửa", "—", "Không đổi được loại khách sau khi tạo."),
        (HONG, D, NEW, "Thêm khách hàng cá nhân ngay trong màn tạo đơn; KHÔNG lưu nháp", "Tên: Chị Thu UAT; SĐT 0902222333; Giới tính: Nữ", "Khách mới tự được chọn vào ô khách hàng; rời màn hình không lưu đơn."),
        (HONG, D, "Đơn hàng › Khách hàng", "Xuất Excel", "—", "Tải file đủ thông tin khách, tiếng Việt đúng."),
    ]),
    ("NS", "8. Nhân sự, tài khoản, phân quyền", "Manager tuyển 1 Sale mới, cấp mật khẩu tạm, cho nghỉ việc", [
        (NAM, D, "Nhân sự & phân quyền", "Thêm nhân viên", "Họ tên: Trần Văn Thử; SĐT 0901000999; Phòng ban: Phát Triển Kinh Tế; Vai trò: Nhân viên kinh doanh", "Sinh tên đăng nhập (vd thu.tv) + mật khẩu tạm để sao chép, hết hạn sau 24 giờ."),
        ("Người test", B, "Trang Đăng nhập", "Đăng nhập tài khoản mới bằng mật khẩu tạm", "Mật khẩu tạm vừa sao chép", "Bắt buộc đổi mật khẩu trước khi vào."),
        ("Người test", B, "Đổi mật khẩu", "Đổi mật khẩu", "Mật khẩu mới: Uat@Moi2026", "Vào 'Tổng quan' với menu của Sale."),
        ("Người test (thu.tv)", B, "Cá nhân › Đổi mật khẩu", "Tự đổi mật khẩu", "Mật khẩu hiện tại Uat@Moi2026; mới Uat@Moi2027", "Đổi được; đăng xuất rồi đăng nhập bằng Uat@Moi2027 được, Uat@Moi2026 bị từ chối."),
        (NAM, D, "Nhân sự & phân quyền › Trần Văn Thử", "Thử gán 'Quản lý chung' cùng 'Nhân viên kỹ thuật'", "—", "Bị chặn: Quản lý chung không đi cùng Nhân viên kỹ thuật (không lưu)."),
        (NAM, D, "Nhân sự & phân quyền › Trần Văn Thử", "Cấp lại mật khẩu", "—", "Hiện mật khẩu tạm mới; mật khẩu Uat@Moi2027 không đăng nhập được nữa."),
        (NAM, D, "Nhân sự & phân quyền › Trần Văn Thử", "Khoá tài khoản (cho nghỉ việc)", "—", "Nhãn 'Đã khoá'; tài khoản không đăng nhập được; vẫn còn trong danh sách."),
        (NAM, D, "Nhân sự & phân quyền", "Xuất Excel; xem khối 'Cách phân quyền hoạt động'", "—", "File có Tài khoản đăng nhập, SĐT, ngày sinh; khối hướng dẫn khớp ma trận phân quyền."),
        (NAM, D, "Phòng ban", "Thêm 'Phòng UAT' → Ngừng hoạt động phòng ban", "Tên: Phòng UAT", "Sau khi ngừng, không còn trong ô chọn phòng ban."),
        (NAM, D, "Phòng ban", "Ngừng hoạt động phòng 'Phát Triển Kinh Tế'", "—", "Bị chặn: 'Phòng ban còn … nhân viên đang hoạt động, hãy chuyển họ sang phòng khác trước khi ngừng hoạt động.'; phòng vẫn hoạt động."),
        (NAM, D, "Thông tin Công ty", "Sửa Điện thoại công ty → lưu → in lại hoá đơn đơn CS1 → trả lại số cũ", "ĐT: 0932000111", "Hoá đơn in hiện số mới; sau khi trả lại, hoá đơn hiện số cũ 0932068787."),
    ]),
    ("DM", "9. Danh mục & chỉ tiêu KPI", "Manager bảo trì danh mục và chỉ tiêu (không làm đổi số liệu đơn đã có)", [
        (NAM, D, "Danh mục › Sản phẩm", "Thêm sản phẩm, bỏ trống giá vốn", "SKU UAT-SP-900; Tên: Chuột không dây UAT; Giá bán 250.000", "Báo lỗi bắt buộc giá vốn; không lưu."),
        (NAM, D, "Danh mục › Sản phẩm", "Thêm sản phẩm đủ thông tin", "Như trên + Giá vốn 150.000; VAT 8; Bảo hành 12 tháng", "Lưu; chọn được khi tạo đơn."),
        (NAM, D, "Danh mục › Nhóm sản phẩm/dịch vụ", "Thêm 'Nhóm UAT tạm' → Ngừng", "—", "Sau khi ngừng, không còn trong ô chọn khi tạo đơn."),
        (NAM, D, "Thiết lập doanh thu KPI", "Tháng sau: sửa chỉ tiêu Lan", "3.000.000 → 3.500.000", "Lưu; tháng hiện tại của Lan vẫn 3.000.000."),
        (NAM, D, "Thiết lập doanh thu KPI", "Copy từ tháng hiện tại sang các tháng tới tháng + 3, KHÔNG ghi đè", "—", "Tháng + 3 có 7 chỉ tiêu; tháng sau của Lan vẫn 3.500.000."),
        (NAM, D, "Danh mục › Dịch vụ", "Thêm dịch vụ, bỏ trống giá vốn", "Mã UAT-DV-900; Tên: Cài phần mềm UAT; Giá 200.000", "Báo lỗi bắt buộc giá vốn; không lưu."),
        (NAM, D, "Danh mục › Sản phẩm", "Thêm sản phẩm trùng tên sản phẩm đã có", "SKU UAT-SP-901; Tên: Màn hình Dell 22 inch E2E; Giá bán 2.800.000; Giá vốn 2.000.000", "Báo trùng; không lưu."),
        (NAM, D, "Danh mục › Sản phẩm › Chuột không dây UAT", "Ngừng kinh doanh → mở Tạo đơn mới, tìm 'Chuột'", "—", "Không còn chọn được khi thêm dòng; danh sách sản phẩm vẫn hiện (đã ngừng)."),
        (NAM, D, "Danh mục › Sản phẩm", "Nhập từ CSV", "File CSV mẫu 1 sản phẩm mới (SKU UAT-SP-902, có giá vốn)", "Nhập thành công 1 dòng; dòng lỗi (nếu có) được báo rõ, không nhập nửa vời."),
    ]),
    ("PQ", "10. Phân quyền — kiểm tra chặn", "Mỗi vai trò chỉ làm/xem phần của mình, kể cả khi gõ thẳng địa chỉ", [
        (QUAN, B, "Thanh địa chỉ", "Gõ /reports/kpi-sales", "—", "Không có quyền / không vào được."),
        (QUAN, B, "Thanh địa chỉ", "Mở chi tiết đơn CS3 (Quân không được giao)", "Link đơn CS3", "Không xem được đơn."),
        (QUAN, M, "Chi tiết đơn CS1 (được giao)", "Xem dòng hàng", "—", "Thấy đơn giá / thành tiền; KHÔNG thấy giá vốn."),
        (HOA, D, "Danh sách đơn › đơn CS3 (của Hà, đang thực hiện)", "Mở", "—", "Xem được; KHÔNG có 'Sửa liên hệ', sửa/thêm dòng, 'Huỷ đơn' (chỉ Sale chủ đơn / Manager)."),
        (HOA, D, "Danh sách đơn › đơn CS1 (Hoàn tất)", "Mở", "—", "KHÔNG có 'Phản hồi khách hàng' (chỉ CSKH/Manager) và 'Chuyển Chỉnh sửa' (chỉ QLKT)."),
        (TOAN, D, "Menu", "Kiểm tra", "—", "Không thấy Danh mục, Nhân sự & phân quyền, Báo cáo KPI, Biểu đồ kinh doanh."),
        (HONG, D, "Menu", "Kiểm tra", "—", "Không thấy Biểu đồ kinh doanh, Báo cáo KPI, Công việc theo nhân viên, Điều phối kỹ thuật."),
        (LAN, D, "Menu", "Kiểm tra", "—", "Không thấy Điều phối kỹ thuật, Việc của tôi, Danh mục; có Ghi nhận quà tặng KH; CÓ chuông Thông báo (Q184)."),
        (HONG, D, "Thanh địa chỉ", "Gõ lần lượt /dispatch/queue, /employees, /audit", "—", "Mỗi trang hiện 'Không có quyền truy cập'."),
        (LAN, D, "Thanh địa chỉ", "Gõ /reports/kpi (Công việc theo nhân viên)", "—", "'Không có quyền truy cập'."),
        (TOAN, D, "Thanh địa chỉ", "Gõ /orders/new", "—", "'Không có quyền truy cập' (QLKT không tạo đơn)."),
    ]),
    ("BC", "11. Báo cáo & tổng quan — đối chiếu số liệu cuối", "Sau CS1–CS6: mọi báo cáo khớp sheet 'Đối chiếu báo cáo' (kỳ = tháng test)", [
        (NAM, D, "Báo cáo › Doanh thu theo nhân viên", "Kỳ tháng này, trạng thái Hoàn tất", "Từ ngày 1 → hôm nay", "Mục A: Hồng 1 đơn / 4.428.000 / LN 1.618.000; Đạt 1 / 324.000 / 114.000; Hoa 1 / 4.698.000 / 1.258.000; Lan 1 / 1.836.000 / 36.000; Tổng 11.286.000 / 3.026.000. Không có 'Chưa gán'."),
        (NAM, D, "Doanh thu theo nhân viên › dòng Hoa", "Xem chi tiết", "—", "2 dòng hàng: Màn hình 3.024.000 (LN 784.000); Hộp mực 1.674.000 (LN 474.000)."),
        (NAM, D, "Doanh thu theo nhân viên", "Trạng thái 'Chưa hoàn tất'", "—", "Mục B: Hà 1 đơn / 486.000 / 171.000. Đơn đã huỷ không xuất hiện."),
        (NAM, D, "Doanh thu theo nhân viên", "Xuất Excel", "—", "File mở được, tiếng Việt đúng, số liệu khớp màn hình."),
        (HONG, D, "Doanh thu theo nhân viên", "Mở (Hoàn tất)", "—", "Chỉ thấy dòng của Hồng: 4.428.000 / 1.618.000."),
        (LAN, D, "Doanh thu theo nhân viên", "Mở (Hoàn tất)", "—", "Chỉ thấy dòng của Lan: 1.836.000 / 36.000."),
        (TOAN, D, "Doanh thu theo nhân viên", "Mở (Hoàn tất)", "—", "Thấy đủ 4 dòng như Manager."),
        (NAM, D, "Báo cáo › Doanh thu theo SP/DV (ngay dưới 'Doanh thu theo nhân viên')", "Xem theo: Nhóm SP/DV (mặc định); Hoàn tất; nhóm Tất cả", "—", "2 dòng: Thiết bị văn phòng 2 đơn / 6.858.000 / 1.408.000; Thiết bị an ninh 1 đơn / 4.428.000 / 1.618.000. Tổng cộng 11.286.000 / 3.026.000 (khớp Mục G1)."),
        (NAM, D, "Doanh thu theo SP/DV", "Chọn radio 'Từng sản phẩm/dịch vụ'", "—", "URL có ?mode=item; bộ lọc giữ nguyên; cột Mã, Tên, Loại, ĐVT, Số lượng, Số đơn, Doanh thu, Lợi nhuận. Camera an ninh Hikvision UAT: Sản phẩm, SL 2, 1 đơn, 4.104.000 / 1.444.000; Hộp mực Canon E2E: SL 5 (gồm 1 hộp tặng), 2 đơn, 3.510.000 / 510.000. Tổng cộng vẫn 11.286.000 / 3.026.000."),
        (NAM, D, "Doanh thu theo SP/DV", "Bấm dòng Camera; lọc nhóm Thiết bị an ninh → Xuất Excel; tải lại trang (F5)", "—", "Chi tiết: 1 dòng của đơn CS1. File CSV chỉ có dòng của nhóm An ninh. Sau F5 vẫn ở chế độ 'Từng sản phẩm/dịch vụ'."),
        (HONG, D, "Doanh thu theo SP/DV", "Mở (Hoàn tất)", "—", "Chỉ tính dòng ghi công cho Hồng: Thiết bị an ninh 4.428.000 / 1.618.000."),
        (NAM, D, "Báo cáo › Doanh thu theo khách hàng", "Hoàn tất", "—", "Mục C: 4 dòng khách × người bán. E2E-KH-002: Tiềm năng = ghi chú của Đạt; Ngày mua hàng cuối = hôm nay."),
        (NAM, D, "Doanh thu theo khách hàng", "Chưa hoàn tất", "—", "1 dòng: E2E-KH-M2105A / Phạm Thu Hà / 486.000 / 171.000."),
        (NAM, D, "Báo cáo › Báo cáo KPI", "Tháng hiện tại; Xuất Excel", "—", "Mục D: 7 dòng; Tỷ lệ đạt Hồng 16,2%; Hoa 15,7%; Đạt 5,7%; Lan 1,2%; Quân, Long, Hà 0%. File xuất khớp."),
        (NAM, D, "Báo cáo KPI", "Lọc nhóm dịch vụ = Thiết bị an ninh", "—", "Chỉ Hồng có doanh số 4.428.000 / 1.618.000; người khác doanh số 0 nhưng vẫn hiện với mục tiêu tổng."),
        (NAM, D, "Báo cáo › Công việc theo nhân viên", "Từ ngày 1 → hôm nay", "—", "Mục E: Quân 1 việc / 0 lỗi; Đạt 3 việc / 1 lỗi; Long 1 việc / 1 từ chối; Hà 0. Đúng hạn 100%."),
        (QUAN, D, "Công việc theo nhân viên", "Mở", "—", "Chỉ thấy dòng của Quân."),
        (NAM, D, "Báo cáo › Chi phí quà tặng KH", "Tháng này; bấm dòng; Xuất Excel", "—", "Mục F: E2E-KH-001 1 lần / 1.050.000; E2E-KH-M2105A 1 lần / 300.000."),
        (NAM, D, "Báo cáo › Biểu đồ kinh doanh › Kết quả kinh doanh", "Để mặc định từng card (có tháng hiện tại)", "—", "Mục G1: tháng này Doanh thu 11.286.000 / Lợi nhuận 3.026.000; Cơ cấu theo Nhóm SP/DV: Văn phòng 6.858.000, An ninh 4.428.000; theo loại KH: Tổ chức 6.264.000, Cá nhân 5.022.000; Khách mới 3, quay lại 0."),
        (NAM, D, "Biểu đồ kinh doanh › Bán hàng & sản phẩm", "Pareto (Doanh thu) + Top bán chạy", "—", "Mục G2: Camera, Hộp mực, Màn hình thuộc nhóm 80%; Top bán chạy: Hộp mực 5, Camera 2, Vệ sinh 2, Màn hình 1, Sửa chữa PC 1."),
        (NAM, D, "Biểu đồ kinh doanh › Nhân sự & KPI", "Xem", "—", "Giờ được phân công (Mục E): Đạt 7, Quân 3, Long 2,5, Hà 1,5; Tỷ lệ hoàn thành KPI giảm dần như Mục D."),
        (NAM, D, "Tổng quan", "Xem các khối; bấm từng thẻ", "—", "Mục H: Hoàn tất 3, Đang thực hiện 1, Đã huỷ 2; Top 10 KH; Phản hồi 5★ = 1, 3★ = 1, Chưa đánh giá = 1; CSKH: đã chăm sóc 2, NV gọi điện 1, Đơn phải sửa 1, Đơn ghi doanh số (CSKH) 1. Thẻ mở popup + Xuất Excel (desktop)."),
        (LAN, D, "Tổng quan", "Khối Chăm sóc khách hàng", "—", "'Đơn ghi doanh số' = 1 (đơn CS4, 1.836.000)."),
        (HONG, B, "Thông tin tài khoản", "Thẻ 'KPI doanh số của tôi'", "—", "Doanh số 4.428.000; Doanh thu thuần 1.618.000; Mục tiêu 10.000.000; Đạt 16,2%."),
        (NAM, D, "Nhật ký hệ thống", "Lọc Nghiệp vụ = Đơn hàng; tìm mã đơn CS2", "—", "Đủ chuỗi: tạo → gửi → bắt đầu thực hiện (Toàn) → quay lại chờ điều phối (Long từ chối) → bắt đầu lại (Toàn thêm Đạt) → KTV thêm/sửa dòng (Đạt) → chờ KH xác nhận → tải ảnh → hoàn tất → phản hồi KH + yêu cầu chỉnh sửa (Lan) → chuyển chỉnh sửa (Toàn) → chờ KH xác nhận → hoàn tất lại; đúng người, giờ Việt Nam."),
        (NAM, D, "Nhật ký hệ thống", "Lọc Nghiệp vụ = 'Việc của tôi (kỹ thuật viên)', rồi 'Quản lý đầu việc'", "—", "'Việc của tôi': có từ chối của Long (lý do Không đủ thời gian, 'Đang ở công trình khác'). 'Quản lý đầu việc': có mở lại đầu việc của Toàn."),
        (NAM, D, "Nhật ký hệ thống", "Lọc Nghiệp vụ = Đăng nhập", "—", "Có sự kiện 'Đăng nhập sai' của hong.lt (bước P0-03)."),
        (NAM, D, "Báo cáo › Doanh thu theo khách hàng", "Xuất Excel", "—", "File mở được, tiếng Việt đúng, 4 dòng khớp màn hình."),
        (NAM, D, "Biểu đồ kinh doanh › Nhân sự & KPI", "Đổi riêng card 'Giờ được phân công' sang tháng trước; rồi chọn Từ tháng sau Đến tháng trước", "—", "Chỉ card đó đổi số liệu, card khác giữ tháng này; chọn Từ > Đến → báo 'Tháng bắt đầu phải trước hoặc bằng tháng kết thúc'."),
        (TOAN, D, "Điều phối kỹ thuật › Lịch & tải việc", "Xem", "—", "Thấy việc đang mở của Hà và Long (CS3, Vệ sinh 3 máy tính); KTV khác không có việc đang mở."),
        (HONG, B, "Thông báo", "Đánh dấu tất cả đã đọc", "—", "Số trên chuông về 0; danh sách vẫn còn, hiển thị đã đọc."),
    ]),
    ("SN", "12. Snapshot giá (làm sau mục 11)", "Đổi giá danh mục không làm thay đổi đơn cũ và báo cáo", [
        (NAM, D, "Danh mục › Sản phẩm › Camera an ninh Hikvision UAT", "Sửa giá", "Giá bán 2.000.000; Giá vốn 1.400.000", "Lưu; lịch sử giá ghi cũ → mới."),
        (NAM, D, "Chi tiết đơn CS1", "Xem dòng Camera", "—", "Vẫn 1.900.000 / thành tiền 4.104.000; tổng 4.428.000."),
        (NAM, D, "Doanh thu theo nhân viên; Báo cáo KPI", "Mở lại", "—", "Số liệu KHÔNG đổi so với mục 11."),
    ]),
    ("CS7", "13. Sửa sau khi gửi, sửa đầu việc, KTV sửa dòng, chỉnh sửa khi chưa ký, chặn huỷ (làm SAU mục 12)", "Anh Ngọc đặt bảo trì PC, đổi địa chỉ và số lượng; khách muốn lắp thêm ổ cứng trước khi ký — không đối chiếu báo cáo", [
        (HONG, D, NEW, "Tạo đơn → thêm dòng → Lưu nháp → Gửi đơn", "KH: E2E-KH-002; Nhóm: Kỹ thuật chung; Địa chỉ thi công: 45 Lê Lợi, Q.1; dòng E2E-DV-002 SL 1", "'Chờ điều phối'; Toàn nhận thông báo."),
        (HONG, D, "Chi tiết đơn CS7 › Thông tin", "Sửa liên hệ", "SĐT: 0918210599; Địa chỉ thi công: 90 Lê Lợi, Q.1", "Lưu; thông tin mới hiện ngay; tab Lịch sử có sự kiện sửa liên hệ."),
        (HONG, D, "Chi tiết đơn CS7 › Dòng hàng", "Sửa SL dòng E2E-DV-002 (đơn đã gửi)", "SL 1 → 2", "Lưu; thành tiền và tổng đơn tăng tương ứng; Lịch sử có sự kiện sửa dòng."),
        (HOA, D, "Danh sách đơn › đơn CS7 (của Hồng)", "Mở", "—", "KHÔNG có 'Sửa liên hệ', không sửa/thêm dòng, không 'Thu hồi' / 'Huỷ đơn'."),
        (TOAN, D, QUEUE, "Tạo đầu việc", "Tiêu đề: Bảo trì PC; Số giờ ước tính: 2; Hạn: hôm nay + 2; Giao: Trần Minh Quân", "Quân nhận thông báo; đơn 'Đang thực hiện'."),
        (HONG, D, "Chi tiết đơn CS7", "Tìm nút Thu hồi / Huỷ đơn", "—", "Không có (đơn đã có đầu việc; Sale không huỷ đơn đang thực hiện)."),
        (TOAN, D, "Bảng đầu việc › Bảo trì PC", "Sửa đầu việc", "Số giờ ước tính 2 → 3; Hạn: hôm nay + 3", "Lưu; Quân nhận thông báo đầu việc được cập nhật."),
        (QUAN, M, "Chi tiết đơn CS7 › Dòng hàng", "Tìm 'Thêm dòng hàng' khi CHƯA tiếp nhận", "—", "Không có nút (chỉ KTV đã tiếp nhận / đang làm mới thêm dòng)."),
        (QUAN, M, "Việc của tôi → Chi tiết đơn › Dòng hàng", "Tiếp nhận → Bắt đầu → Thêm dòng → sửa SL → xoá dòng vừa thêm", "E2E-DV-002 SL 1 → 2 → xoá", "Mỗi thao tác Hồng và Toàn nhận thông báo 'KTV thay đổi dòng hàng'; tổng đơn về như trước khi thêm."),
        (QUAN, M, MYWORK, "Xong", "Giờ thực tế: 3", "Đầu việc 'Hoàn thành'; đơn 'Chờ KH xác nhận'."),
        (QUAN, M, "Chi tiết đơn CS7 › Dòng hàng", "Tìm 'Thêm dòng hàng'", "—", "Không có (đơn chờ khách xác nhận — khoá thêm dòng)."),
        (TOAN, D, "Chi tiết đơn CS7", "Chuyển Chỉnh sửa (khách CHƯA ký)", "Lý do: Khách muốn lắp thêm ổ cứng", "Đơn 'Chỉnh sửa'; Hồng nhận thông báo; đơn KHÔNG tự về 'Chờ KH xác nhận' khi chưa có việc mới."),
        (TOAN, D, "Chi tiết đơn CS7 › Đầu việc", "Tạo đầu việc mới (phát sinh trong lần chỉnh sửa)", "Tiêu đề: Lắp thêm ổ cứng; Số giờ ước tính: 1; Hạn: hôm nay + 1; Giao: Đỗ Văn Đạt", "Đạt nhận thông báo; đầu việc 'Chờ tiếp nhận'; đầu việc 'Bảo trì PC' giữ 'Hoàn thành'."),
        (DAT, M, MYWORK, "Tiếp nhận → Bắt đầu → Xong", "Giờ thực tế: 1", "Đơn 'Chờ KH xác nhận'."),
        (DAT, M, "Chi tiết đơn CS7 › Tải ảnh phiếu xác nhận", "Tải ảnh phiếu đã ký (CHƯA bấm Hoàn tất)", "Ảnh JPG/PNG", "Ảnh hiện; xuất hiện nút 'Hoàn tất đơn'."),
        (NAM, D, "Chi tiết đơn CS7", "Huỷ đơn", "Lý do: Khách đổi ý", "Bị chặn: 'Đơn đã có ảnh khách ký xác nhận, không thể huỷ.'; đơn giữ 'Chờ KH xác nhận'."),
        (DAT, M, "Chi tiết đơn CS7", "Hoàn tất đơn", "Tên người ký: Anh Ngọc", "Đơn 'Hoàn tất'."),
        (HONG, D, NEW, "Tạo đơn → Gửi đơn", "KH: E2E-KH-001; Nhóm: Kỹ thuật chung; Địa chỉ: 12 Nguyễn Huệ, Q.1; dòng E2E-DV-002 SL 1", "'Chờ điều phối' (đơn CS7B)."),
        (TOAN, D, "Đơn chờ điều phối › CS7B", "Tạo đầu việc → Huỷ đầu việc", "Tạo: Kiểm tra mạng, 1 giờ, hạn hôm nay + 1, giao Long; Huỷ: Lý do: Khách hoãn lịch", "Long nhận thông báo giao rồi bị gỡ; đầu việc 'Đã huỷ'; đơn quay về 'Chờ điều phối'."),
        (HONG, D, "Chi tiết đơn CS7B", "Huỷ đơn (mọi đầu việc đã huỷ)", "Lý do: Khách huỷ hẳn", "Huỷ được (Q183) → 'Đã huỷ'."),
        (LAN, D, NEW, "Tạo đơn → thêm dòng → Lưu nháp → Huỷ đơn", "KH: E2E-KH-002; Nhóm: Kỹ thuật chung; dòng E2E-DV-002 SL 1; Lý do huỷ: Khách gọi huỷ", "CSKH huỷ được đơn do mình tạo (Q183) → 'Đã huỷ'."),
        (LAN, D, "Danh sách đơn › đơn CS7 (của Hồng)", "Tìm nút Huỷ đơn", "—", "KHÔNG có (không phải đơn của Lan)."),
        (HONG, D, NEW, "Tạo đơn → Gửi đơn → Huỷ đơn (chưa có đầu việc)", "KH: E2E-KH-M2105A; Nhóm: Kỹ thuật chung; Địa chỉ: 88 Điện Biên Phủ; dòng E2E-DV-002 SL 1; Lý do huỷ: Khách huỷ hẹn", "Huỷ được khi đơn còn 'Chờ điều phối' và chưa có đầu việc → 'Đã huỷ'."),
    ]),
]


# ---------------------------------------------------------------- helpers
def cell_style(cell: Cell, fill: PatternFill | None = None, money: bool = False) -> None:
    cell.font = Font(name=FONT)
    cell.border = BORDER
    cell.alignment = WRAP
    if fill:
        cell.fill = fill
    if money:
        cell.number_format = MONEY


def style_header(ws: Worksheet, row: int, ncols: int) -> None:
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = Font(name=FONT, bold=True, color="FFFFFF")
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        cell.border = BORDER


def write_table(ws: Worksheet, top: int, headers: list[str], rows: Rows, money: set[int] | None = None) -> int:
    money = money or set()
    for i, h in enumerate(headers, 1):
        ws.cell(row=top, column=i, value=h)
    style_header(ws, top, len(headers))
    for r, row in enumerate(rows, top + 1):
        for c, value in enumerate(row, 1):
            is_formula = isinstance(value, str) and value.startswith("=")
            cell_style(ws.cell(row=r, column=c, value=value), CALC_FILL if is_formula else None, c in money)
    return top + len(rows)


def title(ws: Worksheet, text: str, sub: str | None = None) -> None:
    ws["A1"] = text
    ws["A1"].font = Font(name=FONT, bold=True, size=14, color="C2410C")
    if sub:
        ws["A2"] = sub
        ws["A2"].font = Font(name=FONT, italic=True, color="595959")


def section(ws: Worksheet, row: int, text: str, ncols: int) -> None:
    ws.cell(row=row, column=1, value=text)
    for c in range(1, ncols + 1):
        ws.cell(row=row, column=c).fill = SECTION_FILL
        ws.cell(row=row, column=c).font = Font(name=FONT, bold=True)


def widths(ws: Worksheet, values: list[int]) -> None:
    for i, w in enumerate(values, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def col_range(sheet: str, col: str, first: int, last: int) -> str:
    return f"'{sheet}'!${col}${first}:${col}${last}"


# ---------------------------------------------------------------- sheets
def sheet_guide(wb: Workbook) -> None:
    ws = wb.active
    ws.title = "Hướng dẫn"
    title(ws, "SMYou Pro — Kịch bản kiểm thử nghiệm thu (UAT)", "Bộ dữ liệu: make reset-uat-data · bản 2026-11-05")
    rows = [
        ("Mục đích", "Xác nhận toàn bộ luồng nghiệp vụ: tạo đơn → điều phối → thực hiện → khách ký → CSKH → chỉnh sửa; quà tặng; nhân sự, danh mục, phân quyền; và số liệu cuối cùng trên mọi báo cáo khớp kết quả mong đợi."),
        ("Địa chỉ", URL),
        ("Dữ liệu ban đầu", "Trước mỗi đợt test: trên server chạy lệnh ở DEPLOYMENT.md §10 (backup trước, cờ --allow-production); trên máy dev chạy make reset-uat-data. Lệnh sẽ xoá mọi đơn, đầu việc, quà tặng, nhật ký, thông báo; chỉ giữ dữ liệu ở sheet 'Tài khoản & dữ liệu'; đặt lại mật khẩu 9 tài khoản và chỉ tiêu KPI 3 tháng. LƯU Ý: chạy make e2e / make verify trên cùng máy sẽ thêm dữ liệu test tự động — phải chạy lại make reset-uat-data sau đó."),
        ("Mật khẩu chung", f"{PASSWORD} (mọi tài khoản UAT)."),
        ("Thứ tự", "Làm đúng thứ tự sheet 'Kịch bản UAT': P0 → CS1 → CS2 → CS3 → CS4 → CS5 → CS6 → KH → NS → DM → PQ → BC → SN. Số liệu báo cáo (BC) chỉ đúng khi CS1–CS6 làm đủ, đúng dữ liệu đầu vào."),
        ("Cùng tháng", "Làm toàn bộ trong CÙNG MỘT THÁNG (giờ Việt Nam). Qua tháng mới thì chọn lại kỳ báo cáo là tháng đã test."),
        ("Thiết bị", "KTV làm trên điện thoại (~390px); Manager/Sale/QLKT/CSKH trên máy tính. Nút 'In' chỉ có trên desktop ≥ 1024px."),
        ("Ghi kết quả", "Điền 'Kết quả thực tế', chọn 'Trạng thái' (Chưa test / Đạt / Không đạt / Bị chặn / Bỏ qua). Không đạt → ghi ở sheet 'Theo dõi lỗi', điền Mã lỗi vào kịch bản. Sheet 'Tổng hợp' tự đếm."),
        ("Màu ô", "Nền vàng = người test điền / đầu vào kịch bản. Nền xám = công thức, KHÔNG sửa."),
        ("Thông báo", "Bước có 'nhận thông báo': người đó kiểm tra chuông thông báo (và Web Push nếu đã bật) ngay sau bước."),
        ("Ngoài phạm vi", "Quên mật khẩu qua email (cần cấu hình gửi mail)."),
        ("Cách tính tiền", "VND, đã gồm VAT 8%: Thành tiền dòng = SL × Đơn giá − Giảm giá + VAT. Lợi nhuận (Doanh thu thuần) = Thành tiền − Giá vốn × SL; dòng tặng kèm doanh thu 0, lợi nhuận âm bằng giá vốn. Báo cáo doanh thu tính theo người 'Ghi doanh số' của từng dòng."),
    ]
    write_table(ws, 4, ["Mục", "Nội dung"], [list(r) for r in rows])
    widths(ws, [20, 120])


def sheet_data(wb: Workbook) -> dict[str, str]:
    name = "Tài khoản & dữ liệu"
    ws = wb.create_sheet(name)
    title(ws, "Tài khoản & dữ liệu nền (sau make reset-uat-data)", "Mật khẩu và chỉ tiêu được make reset-uat-data đặt lại mỗi lần chạy (backend/scripts/reset_uat_data.py).")
    r = 4
    section(ws, r, "A. Tài khoản đăng nhập", 9)
    rows: Rows = [[code, full, user, PASSWORD, label, "Phát Triển Kinh Tế"] for code, full, _s, user, label, _k in STAFF]
    r = write_table(ws, r + 1, ["Mã NV", "Họ tên", "Tên đăng nhập", "Mật khẩu", "Vai trò", "Phòng ban"], rows) + 2

    section(ws, r, "B. Chỉ tiêu 'Thu nhập thuần' mỗi tháng (tháng hiện tại + 2 tháng sau)", 9)
    first = r + 2
    r = write_table(ws, r + 1, ["Nhân viên", "Chỉ tiêu / tháng (VND)"], [[n, t] for n, t in KPI_TARGETS.items()], {2})
    out = {"kpi_name": col_range(name, "A", first, r), "kpi_target": col_range(name, "B", first, r)}
    r += 2

    section(ws, r, "C. Khách hàng", 9)
    first = r + 2
    r = write_table(ws, r + 1, ["Mã KH", "Tên", "Loại", "SĐT"], [list(c) for c in CUSTOMERS])
    out |= {"cust_code": col_range(name, "A", first, r), "cust_type": col_range(name, "C", first, r)}
    r += 2

    section(ws, r, "D. Sản phẩm / dịch vụ", 9)
    first = r + 2
    r = write_table(ws, r + 1, ["Mã", "Tên", "Loại", "ĐVT", "Giá bán", "Giá vốn", "VAT %", "Giá cố định", "Bảo hành / Giờ ước tính"], [list(i) for i in ITEMS], {5, 6})
    out |= {
        "item_code": col_range(name, "A", first, r),
        "item_name": col_range(name, "B", first, r),
        "item_cost": col_range(name, "F", first, r),
        "item_vat": col_range(name, "G", first, r),
    }
    r += 2
    section(ws, r, "E. Nhóm SP/DV & phòng ban", 9)
    write_table(ws, r + 1, ["Nhóm sản phẩm/dịch vụ", "Phòng ban"], [[g, DEPARTMENTS[i]] for i, g in enumerate(GROUPS)])
    widths(ws, [24, 38, 16, 22, 40, 20, 8, 12, 22])
    return out


def sheet_steps(wb: Workbook) -> int:
    ws = wb.create_sheet("Kịch bản UAT")
    title(ws, "Kịch bản UAT chi tiết — làm theo thứ tự từ trên xuống")
    headers = ["Mã bước", "Luồng nghiệp vụ", "Case study", "Người thực hiện (vai trò – tài khoản)", "Thiết bị", "Màn hình / Menu", "Thao tác", "Dữ liệu đầu vào", "Kết quả mong đợi", "Kết quả thực tế", "Trạng thái", "Mã lỗi", "Người test / Ngày"]
    top = 3
    for i, h in enumerate(headers, 1):
        ws.cell(row=top, column=i, value=h)
    style_header(ws, top, len(headers))
    r = top
    for prefix, flow, case, steps in CASES:
        r += 1
        section(ws, r, f"{prefix} — {flow}", len(headers))
        ws.cell(row=r, column=3, value=case).font = Font(name=FONT, italic=True, bold=True)
        for n, (actor, device, screen, action, given, expected) in enumerate(steps, 1):
            r += 1
            values = [f"{prefix}-{n:02d}", flow, case, actor, device, screen, action, given, expected, None, "Chưa test", None, None]
            for c, v in enumerate(values, 1):
                cell_style(ws.cell(row=r, column=c, value=v), INPUT_FILL if c >= 10 else None)
    dv = DataValidation(type="list", formula1='"Chưa test,Đạt,Không đạt,Bị chặn,Bỏ qua"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"K{top + 1}:K{r}")
    ws.freeze_panes = "D4"
    ws.auto_filter.ref = f"A{top}:M{r}"
    widths(ws, [10, 24, 26, 24, 13, 26, 32, 42, 55, 30, 12, 10, 16])
    return r


def sheet_lines(wb: Workbook, ref: dict[str, str]) -> dict[str, str]:
    name = "Dòng hàng"
    ws = wb.create_sheet(name)
    title(ws, "Dòng hàng của các case study — tính Thành tiền / Lợi nhuận (ô xám là công thức)", "Ô vàng = dữ liệu người test nhập theo kịch bản. Giá vốn & VAT lấy từ sheet dữ liệu.")
    headers = ["Case", "Đơn", "Mã KH", "Loại KH", "Nhóm SP/DV", "Trạng thái cuối", "Mã SP/DV", "Tên SP/DV", "SL", "Đơn giá", "Giảm giá", "Tặng kèm", "Ghi doanh số", "VAT %", "Giá vốn", "Trước VAT", "Tiền VAT", "Thành tiền", "Lợi nhuận", "Đếm đơn (NV)", "Đếm đơn", "Đếm KH (đơn không huỷ)"]
    top = 4
    first = top + 1
    rows: Rows = []
    for r, (case, order, cust, group, status, code, qty, price, disc, gift, credited) in enumerate(LINES, first):
        rows.append([
            case, order, cust,
            f"=INDEX({ref['cust_type']},MATCH(C{r},{ref['cust_code']},0))",
            group, status, code,
            f"=INDEX({ref['item_name']},MATCH(G{r},{ref['item_code']},0))",
            qty, price, disc, gift, credited,
            f"=INDEX({ref['item_vat']},MATCH(G{r},{ref['item_code']},0))",
            f"=INDEX({ref['item_cost']},MATCH(G{r},{ref['item_code']},0))",
            f"=ROUND(I{r}*J{r},0)",
            f"=ROUND((P{r}-K{r})*N{r}/100,0)",
            f"=P{r}-K{r}+Q{r}",
            f"=R{r}-O{r}*I{r}",
            f"=IF(COUNTIFS($B${first}:B{r},B{r},$M${first}:M{r},M{r})=1,1,0)",
            f"=IF(COUNTIF($B${first}:B{r},B{r})=1,1,0)",
            f"=IF(F{r}=\"Đã huỷ\",0,IF(COUNTIFS($C${first}:C{r},C{r},$F${first}:F{r},\"<>Đã huỷ\")=1,1,0))",
        ])
    last = write_table(ws, top, headers, rows, {10, 11, 15, 16, 17, 18, 19})
    for r in range(first, last + 1):
        for c in (9, 10, 11, 12, 13):
            ws.cell(row=r, column=c).fill = INPUT_FILL
    widths(ws, [6, 30, 15, 10, 18, 15, 22, 34, 6, 12, 10, 9, 18, 7, 12, 12, 11, 13, 13, 10, 8, 12])
    ws.freeze_panes = "C5"
    cols = {"cust": "C", "ctype": "D", "group": "E", "status": "F", "code": "G", "qty": "I", "credited": "M", "total": "R", "profit": "S", "ord_nv": "T", "ord": "U", "new_cust": "V"}
    return {k: col_range(name, c, first, last) for k, c in cols.items()}


def sheet_assignments(wb: Workbook) -> dict[str, str]:
    name = "Phân công"
    ws = wb.create_sheet(name)
    title(ws, "Phân công của các case study (Công việc theo NV & giờ phân công)")
    headers = ["Case", "Đầu việc", "Chu kỳ", "Kỹ thuật viên", "Giờ ước tính", "Trạng thái cuối", "Lý do từ chối", "Giờ thực tế", "Lỗi KPI ghi nhận"]
    top = 3
    last = write_table(ws, top, headers, [list(a) for a in ASSIGNMENTS])
    for r in range(top + 1, last + 1):
        for c in (5, 6, 8):
            ws.cell(row=r, column=c).fill = INPUT_FILL
    widths(ws, [6, 32, 8, 20, 12, 16, 14, 12, 14])
    cols = {"tech": "D", "est": "E", "status": "F", "actual": "H", "defect": "I"}
    return {k: col_range(name, c, top + 1, last) for k, c in cols.items()}


def sheet_gifts(wb: Workbook) -> dict[str, str]:
    name = "Quà tặng"
    ws = wb.create_sheet(name)
    title(ws, "Quà tặng khách hàng (CS6) — Tổng = SL × Đơn giá + Chi phí khác")
    headers = ["Mã KH", "Dịp/lễ", "Tên quà", "SL", "Đơn giá", "Chi phí khác", "Người thực hiện", "Người yêu cầu", "Tổng chi phí"]
    top = 3
    rows: Rows = [[*g, f"=D{r}*E{r}+F{r}"] for r, g in enumerate(GIFTS, top + 1)]
    last = write_table(ws, top, headers, rows, {5, 6, 9})
    widths(ws, [16, 20, 22, 6, 12, 12, 18, 18, 14])
    return {"cust": col_range(name, "A", top + 1, last), "total": col_range(name, "I", top + 1, last)}


def sheet_expected(wb: Workbook, ref: dict[str, str], L: dict[str, str], A: dict[str, str], G: dict[str, str]) -> None:
    ws = wb.create_sheet("Đối chiếu báo cáo")
    title(ws, "Số liệu mong đợi trên báo cáo sau CS1–CS6 (kỳ = tháng test) — mọi ô xám là công thức", "So từng ô với màn hình; khác → ghi lỗi ở 'Theo dõi lỗi'.")
    done = '"Hoàn tất"'
    st = L["status"]
    cursor = [4]

    def block(heading: str, headers: list[str], build: Builder, money: set[int], note: str | None = None) -> int:
        r = cursor[0]
        section(ws, r, heading, len(headers))
        first = r + 2
        last = write_table(ws, r + 1, headers, build(first), money)
        if note:
            last += 1
            ws.cell(row=last, column=1, value=note).font = Font(name=FONT, italic=True, color="595959")
        cursor[0] = last + 2
        return first

    def emp_rows(names: list[str], status: str) -> Builder:
        def build(first: int) -> Rows:
            out: Rows = []
            for i, n in enumerate(names):
                rr = first + i
                out.append([n, *[f"=SUMIFS({L[k]},{st},{status},{L['credited']},A{rr})" for k in ("ord_nv", "total", "profit")]])
            end = first + len(names) - 1
            out.append(["Tổng", f"=SUM(B{first}:B{end})", f"=SUM(C{first}:C{end})", f"=SUM(D{first}:D{end})"])
            return out

        return build

    block("A. Doanh thu theo nhân viên — Hoàn tất", ["Nhân viên (Ghi doanh số)", "Số đơn", "Doanh thu", "Lợi nhuận"],
          emp_rows(["Lê Thị Hồng", "Đỗ Văn Đạt", "Lê Thị Hoa", "Nguyễn Thị Lan"], done), {3, 4},
          "Không có dòng 'Chưa gán'. Sale/CSKH chỉ thấy dòng của mình; Manager, QLKT thấy tất cả.")
    block("B. Doanh thu theo nhân viên — Chưa hoàn tất", ["Nhân viên", "Số đơn", "Doanh thu", "Lợi nhuận"],
          emp_rows(["Phạm Thu Hà"], '"Đang thực hiện"'), {3, 4}, "Đơn Đã huỷ (CS5) không thuộc nhóm nào.")

    pairs = [("E2E-KH-001", "Lê Thị Hồng"), ("E2E-KH-001", "Nguyễn Thị Lan"), ("E2E-KH-002", "Lê Thị Hoa"), ("E2E-KH-002", "Đỗ Văn Đạt")]

    def customers(first: int) -> Rows:
        return [[c, n, *[f"=SUMIFS({L[k]},{st},{done},{L['cust']},A{first + i},{L['credited']},B{first + i})" for k in ("ord_nv", "total", "profit")]] for i, (c, n) in enumerate(pairs)]

    block("C. Doanh thu theo khách hàng — Hoàn tất (mỗi dòng = khách × người bán)", ["Mã KH", "Người bán", "Số đơn", "Doanh thu", "Lợi nhuận"], customers, {4, 5},
          "E2E-KH-002: Tiềm năng = ghi chú của Đạt (CS2); Ngày mua hàng cuối = ngày test. Chưa hoàn tất: E2E-KH-M2105A / Phạm Thu Hà = mục B.")

    def kpi(first: int) -> Rows:
        out: Rows = []
        for i, n in enumerate(KPI_TARGETS):
            rr = first + i
            out.append([n,
                        f"=SUMIFS({L['total']},{st},{done},{L['credited']},A{rr})",
                        f"=SUMIFS({L['profit']},{st},{done},{L['credited']},A{rr})",
                        f"=INDEX({ref['kpi_target']},MATCH(A{rr},{ref['kpi_name']},0))",
                        f"=IF(D{rr}=0,\"\",ROUND(C{rr}/D{rr}*100,1))"])
        end = first + len(KPI_TARGETS) - 1
        out.append(["Tổng", f"=SUM(B{first}:B{end})", f"=SUM(C{first}:C{end})", f"=SUM(D{first}:D{end})", ""])
        return out

    block("D. Báo cáo KPI (tháng): Tổng doanh số / Doanh thu thuần / Mục tiêu / Tỷ lệ đạt", ["Nhân viên", "Tổng doanh số", "Doanh thu thuần", "Mục tiêu", "Tỷ lệ đạt (%)"], kpi, {2, 3, 4},
          "Nam, Toàn không có chỉ tiêu, không doanh số → không hiện. Thẻ 'KPI doanh số của tôi' = dòng của chính người đó.")

    techs = ["Trần Minh Quân", "Đỗ Văn Đạt", "Nguyễn Thành Long", "Phạm Thu Hà"]

    def work(first: int) -> Rows:
        out: Rows = []
        for i, n in enumerate(techs):
            rr = first + i
            out.append([n,
                        f"=COUNTIFS({A['tech']},A{rr},{A['status']},\"Xong\")",
                        f"=COUNTIFS({A['tech']},A{rr},{A['status']},\"Từ chối\")",
                        f"=SUMIFS({A['defect']},{A['tech']},A{rr})",
                        f"=SUMIFS({A['est']},{A['tech']},A{rr},{A['status']},\"Xong\")",
                        f"=SUMIFS({A['actual']},{A['tech']},A{rr},{A['status']},\"Xong\")",
                        f"=SUMIFS({A['est']},{A['tech']},A{rr},{A['status']},\"<>Từ chối\",{A['status']},\"<>Đã gỡ\")"])
        return out

    block("E. Công việc theo nhân viên + Giờ được phân công (biểu đồ Nhân sự & KPI)",
          ["Kỹ thuật viên", "Việc đã xong", "Lần từ chối", "Lỗi KPI", "Giờ ước tính (việc xong)", "Giờ thực tế", "Giờ được phân công (biểu đồ)"], work, set(),
          "Hạn hoàn thành đặt sau ngày làm → đúng hạn 100%. Giờ phân công tính mọi phân công trừ Từ chối / Đã gỡ (kể cả chu kỳ cũ).")

    def gifts(first: int) -> Rows:
        return [[c, f"=COUNTIF({G['cust']},A{first + i})", f"=SUMIFS({G['total']},{G['cust']},A{first + i})"] for i, (c, *_x) in enumerate(CUSTOMERS)]

    block("F. Chi phí quà tặng KH", ["Mã KH", "Số lần tặng", "Tổng chi phí"], gifts, {3}, "Khách 0 lần tặng không hiện trên báo cáo.")

    def results(_first: int) -> Rows:
        out: Rows = [
            ["Doanh thu tháng", f"=SUMIFS({L['total']},{st},{done})", ""],
            ["Lợi nhuận tháng", f"=SUMIFS({L['profit']},{st},{done})", ""],
        ]
        for g in GROUPS:
            out.append([f"Cơ cấu doanh thu — {g}", f"=SUMIFS({L['total']},{st},{done},{L['group']},\"{g}\")", "Không hiện nếu = 0"])
            out.append([f"Cơ cấu lợi nhuận — {g}", f"=SUMIFS({L['profit']},{st},{done},{L['group']},\"{g}\")", ""])
        for t in ("Tổ chức", "Cá nhân"):
            out.append([f"Doanh thu theo loại KH — {t}", f"=SUMIFS({L['total']},{st},{done},{L['ctype']},\"{t}\")", ""])
        out.append(["Khách hàng mới (tháng)", f"=SUM({L['new_cust']})", "Khách có đơn đã gửi, không huỷ, lần đầu trong tháng"])
        out.append(["Khách hàng quay lại (tháng)", 0, "Dữ liệu vừa reset → chưa khách nào có đơn trước tháng này"])
        return out

    first = block("G1. Biểu đồ kinh doanh — Kết quả kinh doanh (tháng test)", ["Chỉ số", "Giá trị mong đợi", "Ghi chú"], results, {2})
    for rr in (first + 10, first + 11):
        ws.cell(row=rr, column=2).number_format = "0"

    def pareto(first: int) -> Rows:
        last = first + len(PARETO_ORDER) - 1
        out: Rows = []
        for i, code in enumerate(PARETO_ORDER):
            rr = first + i
            vital = "Có" if i == 0 else f"=IF(D{rr - 1}<80,\"Có\",\"Không\")"
            out.append([code,
                        f"=INDEX({ref['item_name']},MATCH(A{rr},{ref['item_code']},0))",
                        f"=SUMIFS({L['total']},{st},{done},{L['code']},A{rr})",
                        f"=ROUND(SUM(C${first}:C{rr})/SUM(C${first}:C${last})*100,1)",
                        vital,
                        f"=SUMIFS({L['qty']},{st},{done},{L['code']},A{rr})"])
        return out

    block("G2. Biểu đồ — Pareto doanh thu (giảm dần) & số lượng bán", ["Mã", "Tên", "Doanh thu", "% luỹ kế", "Nhóm 80%", "Số lượng bán (gồm tặng kèm)"], pareto, {3},
          "Nhóm 80% = các mục từ đầu tới mục đầu tiên có % luỹ kế ≥ 80 (gồm mục đó). Hai dịch vụ cùng 324.000 có thể đổi chỗ nhau.")

    def overview(first: int) -> Rows:
        return [
            ["Đơn Hoàn tất", f"=SUMIFS({L['ord']},{st},{done})"],
            ["Đơn Đang thực hiện", f"=SUMIFS({L['ord']},{st},\"Đang thực hiện\")"],
            ["Đơn Đã huỷ", f"=SUMIFS({L['ord']},{st},\"Đã huỷ\")"],
            ["Top KH #1 — E2E-KH-001 (doanh thu)", f"=SUMIFS({L['total']},{st},{done},{L['cust']},\"E2E-KH-001\")"],
            ["Top KH #2 — E2E-KH-002 (doanh thu)", f"=SUMIFS({L['total']},{st},{done},{L['cust']},\"E2E-KH-002\")"],
            ["Phản hồi 5★ (CS1)", 1],
            ["Phản hồi 3★ (CS2)", 1],
            ["Đơn hoàn tất chưa đánh giá", f"=B{first}-B{first + 5}-B{first + 6}"],
            ["KH đã chăm sóc (tháng)", f"=B{first + 5}+B{first + 6}"],
            ["NV đã gọi điện CSKH (tháng)", 1],
            ["Đơn hàng phải sửa (tháng)", 1],
            ["Đơn ghi doanh số cho CSKH (tháng)", f"=SUMIFS({L['ord_nv']},{L['credited']},\"Nguyễn Thị Lan\",{st},\"<>Đã huỷ\")"],
        ]

    first = block("H. Tổng quan (Manager)", ["Thẻ / chỉ số", "Giá trị mong đợi"], overview, set(),
                  "Phản hồi, NV gọi điện, đơn phải sửa lấy từ kịch bản: CS1 = 5★, CS2 = 3★ (đều do Lan ghi); CS2 là đơn duy nhất bị chuyển Chỉnh sửa.")
    for rr in (first + 3, first + 4):
        ws.cell(row=rr, column=2).number_format = MONEY
    widths(ws, [44, 22, 18, 18, 18, 18, 22])


def sheet_permissions(wb: Workbook) -> None:
    ws = wb.create_sheet("Ma trận phân quyền")
    spec = yaml.safe_load((ROOT / "spec/permissions.yaml").read_text())
    caps = spec["capabilities"]
    title(ws, "Menu mỗi tài khoản phải thấy (sinh từ spec/permissions.yaml)", "✓ = phải thấy; — = không được thấy. Cột Kết quả: người test ghi Đạt / Không đạt.")
    people = [s for s in STAFF if s[0] in ("NV01", "NV02", "E2E14", "NV03", "NV04", "E2E09")]
    headers = ["Nhóm menu", "Mục menu", *[f"{s[2]} – {s[4]}" for s in people], "Kết quả"]

    def allowed(cap: str | None, roles: list[str]) -> bool:
        return cap is None or any(role in caps.get(cap, {}) for role in roles)

    rows: Rows = []
    for item in spec["menu"]:
        for child in item.get("children") or [item]:
            cap = child.get("capability", item.get("capability"))
            rows.append([item["label"] if item.get("children") else "", child["label"], *["✓" if allowed(cap, s[5]) else "—" for s in people], None])
    last = write_table(ws, 4, headers, rows)
    for rr in range(5, last + 1):
        ws.cell(row=rr, column=len(headers)).fill = INPUT_FILL
        for c in range(3, len(headers)):
            ws.cell(row=rr, column=c).alignment = Alignment(horizontal="center")
    ws.cell(row=last + 2, column=1, value="Hoa có menu như Hồng; Quân, Đạt, Long như cột KTV. Ma trận tính theo vai trò đang lưu: Nam là Quản lý chung nên tự kèm Kinh doanh, CSKH, QLKT (Q185) — Nam cũng nhận thông báo như QLKT.").font = Font(name=FONT, italic=True)
    widths(ws, [20, 30, 18, 18, 18, 18, 18, 22, 12])


def sheet_bugs(wb: Workbook) -> None:
    ws = wb.create_sheet("Theo dõi lỗi")
    title(ws, "Theo dõi lỗi UAT", "Dòng 4 là ví dụ cách ghi — xoá khi dùng thật.")
    headers = ["Mã lỗi", "Mã bước", "Mô tả lỗi", "Các bước tái hiện", "Kết quả thực tế", "Kết quả mong đợi", "Mức độ", "Ảnh / video", "Người báo", "Ngày báo", "Trạng thái xử lý", "Ghi chú dev"]
    example: list[object] = ["BUG-001", "CS1-04", "Tổng cộng đơn hiển thị sai", "Thêm Camera SL 2 + Sửa chữa PC SL 1", "Tổng 4.400.000", "Tổng 4.428.000", "Cao", "link ảnh", "Hồng", "2026-11-06", "Mới", ""]
    write_table(ws, 3, headers, [example])
    for c in range(1, len(headers) + 1):
        ws.cell(row=4, column=c).font = Font(name=FONT, italic=True, color="808080")
    sev = DataValidation(type="list", formula1='"Nghiêm trọng,Cao,Trung bình,Thấp"', allow_blank=True)
    fix = DataValidation(type="list", formula1='"Mới,Đang sửa,Đã sửa – chờ test lại,Đóng,Không phải lỗi"', allow_blank=True)
    ws.add_data_validation(sev)
    ws.add_data_validation(fix)
    sev.add("G4:G300")
    fix.add("K4:K300")
    widths(ws, [10, 10, 34, 40, 26, 26, 12, 16, 12, 12, 18, 24])


def sheet_summary(wb: Workbook, last: int) -> None:
    ws = wb.create_sheet("Tổng hợp", 1)
    title(ws, "Tổng hợp kết quả UAT (tự cập nhật theo cột Trạng thái của 'Kịch bản UAT')")
    statuses = ["Đạt", "Không đạt", "Bị chặn", "Bỏ qua", "Chưa test"]
    q = "'Kịch bản UAT'"
    flow_col, id_col, st_col = f"{q}!$B$4:$B${last}", f"{q}!$A$4:$A${last}", f"{q}!$K$4:$K${last}"
    start = 4
    rows: Rows = []
    for i, (_p, flow, _c, _s) in enumerate(CASES):
        rr = start + i
        rows.append([flow, f"=COUNTIFS({flow_col},A{rr},{id_col},\"*-*\")", *[f"=COUNTIFS({flow_col},A{rr},{st_col},\"{s}\")" for s in statuses], f"=IF(B{rr}=0,0,C{rr}/B{rr})"])
    end = start + len(CASES) - 1
    rows.append(["TỔNG", *[f"=SUM({get_column_letter(c)}{start}:{get_column_letter(c)}{end})" for c in range(2, 8)], f"=IF(B{end + 1}=0,0,C{end + 1}/B{end + 1})"])
    last_row = write_table(ws, 3, ["Luồng nghiệp vụ", "Số bước", *statuses, "% Đạt"], rows)
    for rr in range(start, last_row + 1):
        ws.cell(row=rr, column=8).number_format = "0.0%"
    for c in range(1, 9):
        ws.cell(row=last_row, column=c).font = Font(name=FONT, bold=True)
    ws.cell(row=last_row + 2, column=1, value="Tiêu chí nghiệm thu: 100% bước 'Đạt' (hoặc 'Bỏ qua' có lý do được duyệt); không còn lỗi mức Nghiêm trọng / Cao chưa đóng.").font = Font(name=FONT, bold=True)
    ws.cell(row=last_row + 4, column=1, value="Đại diện SMYou (ký, ghi rõ họ tên):").font = Font(name=FONT)
    ws.cell(row=last_row + 4, column=4, value="Đại diện phát triển (ký, ghi rõ họ tên):").font = Font(name=FONT)
    widths(ws, [70, 10, 10, 11, 10, 10, 11, 10])


def main() -> None:
    wb = Workbook()
    sheet_guide(wb)
    ref = sheet_data(wb)
    last = sheet_steps(wb)
    lines = sheet_lines(wb, ref)
    assignments = sheet_assignments(wb)
    gifts = sheet_gifts(wb)
    sheet_expected(wb, ref, lines, assignments, gifts)
    sheet_permissions(wb)
    sheet_bugs(wb)
    sheet_summary(wb, last)
    wb.calculation.fullCalcOnLoad = True  # no cached values: Excel computes every formula on open
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
