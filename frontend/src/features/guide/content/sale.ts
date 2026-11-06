import type { Guide } from "./types";

export const SALE_GUIDE: Guide = {
  role: "SALE",
  label: "Nhân viên kinh doanh",
  summary:
    "Bạn quản lý khách hàng, tạo đơn bán hàng/dịch vụ, gửi đơn cho Quản lý kỹ thuật điều phối và theo dõi doanh số của mình.",
  sections: [
    {
      id: "khach-hang",
      title: "Khách hàng",
      steps: [
        "Mở Đơn hàng → Khách hàng.",
        "Tìm theo tên, số điện thoại hoặc mã số thuế; lọc theo Loại khách hàng.",
        "Bấm Thêm khách hàng, chọn loại (công ty/cá nhân), nhập thông tin rồi bấm Lưu.",
        "Xuất Excel để lấy danh sách khi cần.",
      ],
      note: "Hệ thống cảnh báo nếu số điện thoại đã dùng cho khách khác — kiểm tra để tránh tạo trùng.",
      screens: ["/customers"],
    },
    {
      id: "tao-don",
      title: "Tạo đơn & dòng hàng",
      steps: [
        "Mở Đơn hàng → Tạo đơn mới.",
        "Tìm khách hàng có sẵn, hoặc chọn Khách lẻ và nhập tên + số điện thoại, hoặc bấm Thêm khách hàng.",
        "Chọn Nhóm sản phẩm/dịch vụ (bắt buộc), Ngày hẹn, Địa chỉ thi công, Mô tả công việc, Độ ưu tiên.",
        "Bấm Thêm dòng hàng, chọn Sản phẩm hoặc Dịch vụ, tìm và bấm Thêm.",
        "Chỉnh Số lượng, Đơn giá, VAT (%), Giảm giá cho từng dòng. Dòng có nhãn Giá cố định thì không sửa được đơn giá.",
        "Hàng tặng kèm: đánh dấu Tặng kèm — đơn giá về 0.",
        'Người nhận doanh số mặc định là bạn (hiện "Ghi doanh số: …"); đổi nếu doanh số thuộc người khác.',
      ],
      note: "Đơn lưu lại tên, giá, bảo hành của sản phẩm tại lúc tạo — danh mục đổi sau cũng không ảnh hưởng đơn cũ.",
      screens: ["/orders/new"],
    },
    {
      id: "luu-nhap",
      title: "Lưu nháp",
      steps: [
        "Bấm Lưu nháp khi đã chọn khách hàng và có ít nhất 1 dòng hàng.",
        "Đơn ở trạng thái Nháp; mở lại từ Đơn hàng → Danh sách đơn để sửa tiếp.",
      ],
      note: "Nút Lưu nháp bị mờ cho tới khi có khách hàng và ít nhất 1 dòng hàng.",
      screens: ["/orders/new", "/orders"],
    },
    {
      id: "gui-don",
      title: "Gửi đơn",
      steps: [
        "Kiểm tra đơn đã có khách hàng, địa chỉ thi công và dòng hàng (hoặc mô tả công việc).",
        "Bấm Gửi đơn, xác nhận Gửi đơn trong hộp thoại.",
        "Đơn chuyển sang Chờ điều phối; Quản lý kỹ thuật được thông báo.",
      ],
      note: 'Thiếu địa chỉ thi công thì không gửi được — hệ thống báo "Đơn cần có địa chỉ thi công."',
      screens: ["/orders"],
    },
    {
      id: "thu-hoi-huy",
      title: "Thu hồi / Huỷ đơn",
      steps: [
        "Thu hồi: khi đơn Chờ điều phối và chưa có đầu việc, bấm Thu hồi để đưa về Nháp sửa tiếp.",
        "Huỷ: khi đơn Nháp hoặc Chờ điều phối, bấm Huỷ đơn, nhập Lý do huỷ (ít nhất 5 ký tự), bấm Xác nhận huỷ.",
      ],
      note: "Đơn đã có đầu việc thì không thu hồi được. Huỷ đơn không hoàn tác.",
      screens: ["/orders"],
    },
    {
      id: "sua-sau-gui",
      title: "Sửa liên hệ & dòng hàng sau khi gửi",
      steps: [
        "Mở đơn của bạn (chưa Hoàn tất), tab Thông tin, bấm Sửa liên hệ để đổi tên, số điện thoại, địa chỉ thi công, mô tả; bấm Lưu.",
        "Tab Dòng hàng: thêm, sửa, xoá dòng như lúc tạo đơn.",
      ],
      note: "Mọi thay đổi sau khi gửi đều được ghi lại ở tab Lịch sử.",
      screens: ["/orders"],
    },
    {
      id: "in-hoa-don",
      title: "In hoá đơn",
      steps: [
        "Mở đơn trên máy tính (màn hình rộng).",
        "Bấm In, chờ chuẩn bị xong rồi in từ hộp thoại của trình duyệt.",
      ],
      note: "Nút In chỉ hiện trên máy tính, không có trên điện thoại. Đơn nháp phải lưu trước khi in.",
      screens: ["/orders"],
    },
    {
      id: "qua-tang",
      title: "Ghi nhận quà tặng KH",
      steps: [
        "Mở Đơn hàng → Ghi nhận quà tặng KH, tìm khách hàng.",
        "Bấm Thêm quà tặng, nhập Dịp/lễ, Ngày thực hiện, Tên gói quà, Số lượng, Đơn giá, Chi phí khác…",
        "Tải ảnh quà tặng nếu có, bấm Lưu.",
      ],
      note: "Quà tặng sửa được nhưng không xoá được.",
      screens: ["/customer-gifts"],
    },
    {
      id: "bao-cao",
      title: "Báo cáo doanh thu & KPI của tôi",
      steps: [
        "Mở Báo cáo → Doanh thu theo khách hàng / theo nhân viên / theo SP/DV.",
        "Chọn Từ ngày, Đến ngày, Trạng thái; bấm Xuất Excel khi cần.",
        "KPI doanh số của tôi: mở trang Cá nhân, xem Tổng doanh số, Doanh thu thuần, Mục tiêu và Tỷ lệ đạt theo tháng.",
      ],
      note: "Báo cáo chỉ tính các dòng hàng ghi doanh số cho bạn.",
      screens: [
        "/reports/revenue-by-customer",
        "/reports/revenue-by-employee",
        "/reports/revenue-by-product",
        "/ca-nhan",
      ],
    },
  ],
  faq: [
    {
      question: "Vì sao nút Gửi đơn báo lỗi?",
      answer:
        "Kiểm tra đơn đã có khách hàng, địa chỉ thi công và ít nhất 1 dòng hàng hoặc mô tả công việc.",
    },
    {
      question: "Đơn đã có đầu việc, tôi muốn huỷ?",
      answer:
        "Nhờ Quản lý kỹ thuật huỷ các đầu việc, hoặc nhờ Quản lý chung huỷ đơn đang thực hiện.",
    },
  ],
};
