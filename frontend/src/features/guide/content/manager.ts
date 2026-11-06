import type { Guide } from "./types";

export const MANAGER_GUIDE: Guide = {
  role: "MANAGER",
  label: "Quản lý chung",
  summary:
    "Bạn quản trị hệ thống: nhân sự, phân quyền, danh mục, chỉ tiêu KPI và theo dõi báo cáo. Quản lý chung có thêm mọi quyền của Kinh doanh, CSKH, QLKT — xem các tab tương ứng.",
  sections: [
    {
      id: "nhan-su",
      title: "Nhân sự & phân quyền",
      steps: [
        "Mở Thông tin Công ty → Nhân sự & phân quyền.",
        "Bấm Thêm nhân viên, nhập Họ và tên, Phòng ban, Chức danh, chọn ít nhất một Vai trò và Tên đăng nhập, bấm Lưu.",
        "Hộp thoại Mật khẩu tạm hiện một lần: Sao chép và gửi cho nhân viên qua kênh riêng.",
        "Nhân viên quên mật khẩu hoặc mật khẩu tạm hết hạn: bấm Cấp lại mật khẩu.",
        "Nghỉ việc: bấm Khoá tài khoản — nhân viên bị đăng xuất khỏi mọi thiết bị; Mở khoá khi cần.",
      ],
      note: 'Xem khối "Cách phân quyền hoạt động" trên trang để biết mỗi vai trò làm được gì.',
      screens: ["/employees"],
    },
    {
      id: "phong-ban",
      title: "Phòng ban",
      steps: [
        "Mở Thông tin Công ty → Phòng ban.",
        "Bấm Thêm phòng ban, nhập Tên phòng ban (không trùng), bấm Lưu.",
        "Phòng ban không dùng nữa: Ngừng hoạt động phòng ban.",
      ],
      screens: ["/settings/departments"],
    },
    {
      id: "cong-ty",
      title: "Thông tin công ty",
      steps: [
        "Mở Thông tin Công ty → Thông tin Công ty.",
        "Sửa tên, địa chỉ, thông tin liên hệ; Tải logo; bấm Lưu.",
      ],
      note: "Thông tin này in trên hoá đơn.",
      screens: ["/settings/company"],
    },
    {
      id: "danh-muc",
      title: "Danh mục sản phẩm, dịch vụ",
      steps: [
        "Mở Danh mục → Sản phẩm, Dịch vụ hoặc Nhóm sản phẩm/dịch vụ.",
        "Bấm Thêm sản phẩm / Thêm dịch vụ, nhập mã, tên, đơn giá và Giá vốn (bắt buộc), bảo hành; đánh dấu Giá cố định nếu Sale không được sửa giá.",
        "Nhập nhiều mặt hàng: bấm Nhập từ CSV, Tải file mẫu, chọn file (tối đa 500 dòng), xem trước rồi Xác nhận nhập.",
        "Hàng không bán nữa: bấm Ngừng kinh doanh — không hiện khi tạo đơn mới; Mở lại kinh doanh khi cần.",
      ],
      note: "Sửa giá trong danh mục không làm đổi đơn đã tạo.",
      screens: ["/catalog/products", "/catalog/services", "/catalog/groups"],
    },
    {
      id: "chi-tieu-kpi",
      title: "Thiết lập doanh thu KPI",
      steps: [
        "Mở Thông tin Công ty → Thiết lập doanh thu KPI.",
        "Chọn Tháng, Phòng ban; bấm vào ô chỉ tiêu của nhân viên để nhập thu nhập thuần mục tiêu.",
        "Bấm Copy sang tháng sau để dùng lại chỉ tiêu cho các tháng tiếp theo.",
      ],
      screens: ["/settings/kpi-targets"],
    },
    {
      id: "huy-don-dang-lam",
      title: "Huỷ đơn đang thực hiện",
      steps: [
        "Mở đơn Đang thực hiện, Chờ KH xác nhận hoặc Chỉnh sửa.",
        "Bấm Huỷ đơn, nhập Lý do huỷ, bấm Xác nhận huỷ.",
      ],
      note: "Các đầu việc đang mở bị huỷ theo và kỹ thuật viên được báo. Đơn đã có ảnh khách ký xác nhận thì không huỷ được.",
      screens: ["/orders"],
    },
    {
      id: "bao-cao-ql",
      title: "Báo cáo & biểu đồ",
      steps: [
        "Báo cáo KPI: doanh số, thu nhập thuần so với chỉ tiêu theo tháng, phòng ban, nhân viên.",
        "Biểu đồ kinh doanh: 3 tab Kết quả kinh doanh, Bán hàng & sản phẩm, Nhân sự & KPI.",
        "Các báo cáo doanh thu theo khách hàng, theo nhân viên, theo SP/DV và Chi phí quà tặng KH.",
        "Công việc theo nhân viên: KPI đúng hạn, lỗi của kỹ thuật viên.",
        "Hầu hết báo cáo có nút Xuất Excel.",
      ],
      screens: [
        "/reports/kpi-sales",
        "/reports/business-charts",
        "/reports/revenue-by-customer",
        "/reports/revenue-by-employee",
        "/reports/revenue-by-product",
        "/reports/customer-gifts",
        "/reports/kpi",
      ],
    },
    {
      id: "nhat-ky",
      title: "Nhật ký hệ thống",
      steps: [
        "Mở Nhật ký hệ thống.",
        "Lọc theo Nghiệp vụ, Người thực hiện, khoảng ngày để xem ai đã làm gì, lúc nào.",
      ],
      screens: ["/audit"],
    },
  ],
  faq: [
    {
      question: "Nhân viên báo không thấy một menu?",
      answer:
        "Kiểm tra vai trò của họ ở Nhân sự & phân quyền — menu chỉ hiện theo quyền của vai trò.",
    },
    {
      question: "Tôi có giao việc kỹ thuật được không?",
      answer:
        "Được — tài khoản Quản lý chung luôn kèm vai trò Quản lý kỹ thuật. Xem tab Quản lý kỹ thuật để biết quy trình.",
    },
  ],
};
