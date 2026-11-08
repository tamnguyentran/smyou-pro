import type { Guide } from "./types";

export const CUSTOMER_CARE_GUIDE: Guide = {
  role: "CUSTOMER_CARE",
  label: "Chăm sóc khách hàng",
  summary:
    "Bạn chăm sóc khách sau bán hàng: ghi phản hồi, đề nghị chỉnh sửa khi khách chưa hài lòng, ghi nhận quà tặng và có thể tạo đơn cho khách.",
  sections: [
    {
      id: "tao-don-cskh",
      title: "Tạo đơn",
      steps: [
        "Mở Đơn hàng → Tạo đơn mới, chọn khách hàng, nhóm, địa chỉ thi công và thêm dòng hàng như Nhân viên kinh doanh.",
        "Bấm Lưu nháp.",
        "Báo Nhân viên kinh doanh hoặc Quản lý chung gửi đơn đi.",
      ],
      note: "Chăm sóc khách hàng không gửi được đơn — không có nút Gửi đơn; nhờ Sale hoặc Quản lý chung gửi.",
      screens: ["/orders/new", "/orders"],
    },
    {
      id: "huy-don-cskh",
      title: "Huỷ đơn mình tạo",
      steps: [
        "Mở đơn do bạn tạo, đang Nháp hoặc Chờ điều phối.",
        "Bấm Huỷ đơn, nhập Lý do huỷ (ít nhất 5 ký tự), bấm Xác nhận huỷ.",
      ],
      note: "Đơn còn đầu việc đang mở thì không huỷ được.",
      screens: ["/orders"],
    },
    {
      id: "phan-hoi",
      title: "Phản hồi khách hàng",
      steps: [
        "Gọi điện cho khách sau khi đơn Hoàn tất.",
        "Mở đơn, tab Thông tin, khối Phản hồi khách hàng.",
        "Chọn Số sao (1–5), nhập Nội dung phản hồi, bấm Lưu phản hồi.",
      ],
      note: "Chỉ ghi phản hồi khi đơn đã Hoàn tất. Có thể Cập nhật phản hồi sau.",
      screens: ["/orders"],
    },
    {
      id: "yeu-cau-chinh-sua",
      title: "Tạo yêu cầu chỉnh sửa",
      steps: [
        "Khách chưa hài lòng: trong đơn Hoàn tất, bấm Tạo yêu cầu chỉnh sửa.",
        "Kiểm tra Mô tả (điền sẵn từ phản hồi), bấm Gửi yêu cầu.",
        "Quản lý kỹ thuật xem xét và quyết định có chuyển đơn sang Chỉnh sửa hay không.",
      ],
      note: 'Đơn vẫn Hoàn tất cho tới khi Quản lý kỹ thuật quyết định; đầu đơn hiện "Đã gửi yêu cầu chỉnh sửa (chưa xử lý)".',
      screens: ["/orders"],
    },
    {
      id: "khach-hang-cskh",
      title: "Khách hàng",
      steps: [
        "Mở Đơn hàng → Khách hàng.",
        "Tìm khách, xem và cập nhật thông tin liên hệ; bấm Thêm khách hàng để tạo mới.",
      ],
      screens: ["/customers"],
    },
    {
      id: "qua-tang-cskh",
      title: "Ghi nhận quà tặng KH",
      steps: [
        "Mở Đơn hàng → Ghi nhận quà tặng KH, tìm khách hàng.",
        "Bấm Thêm quà tặng, nhập thông tin quà và chi phí, bấm Lưu.",
        "Xem tổng chi phí ở Báo cáo → Chi phí quà tặng KH.",
      ],
      screens: ["/customer-gifts", "/reports/customer-gifts"],
    },
    {
      id: "cham-soc-kh",
      title: "Chăm sóc KH — ghi nhận cuộc gọi",
      steps: [
        "Mở Đơn hàng → Chăm sóc KH, bấm Ghi nhận cuộc gọi.",
        "Tìm khách hàng; khách mới thì bấm Thêm khách hàng, nhập thông tin rồi Lưu — khách vừa thêm được chọn sẵn.",
        "Ghi Chào sản phẩm/dịch vụ gì và Ghi nhận yêu cầu của KH (nếu có), bấm Lưu.",
      ],
      note: "Yêu cầu của khách được ghi thành tiềm năng sử dụng dịch vụ của khách đó. Bạn chỉ xem được các cuộc gọi do mình ghi.",
      screens: ["/customer-care"],
    },
    {
      id: "thong-bao-cskh",
      title: "Thông báo đơn mình tạo",
      body: "Với đơn bạn tạo, bạn được báo khi kỹ thuật viên bắt đầu, khi mọi đầu việc xong, khi đơn hoàn tất hoặc chuyển Chỉnh sửa.",
      steps: [
        "Bấm chuông trên đầu trang để xem thông báo.",
        "Bấm thông báo để mở đơn — ví dụ khi đơn Hoàn tất thì gọi khách ghi phản hồi.",
      ],
      screens: ["/thong-bao"],
    },
    {
      id: "bao-cao-cskh",
      title: "Báo cáo doanh thu của tôi",
      steps: [
        "Mở Báo cáo → Doanh thu theo khách hàng / theo nhân viên / theo SP/DV.",
        "Chọn khoảng ngày, bấm Xuất Excel khi cần.",
      ],
      note: "Báo cáo chỉ tính các dòng hàng ghi doanh số cho bạn.",
      screens: [
        "/reports/revenue-by-customer",
        "/reports/revenue-by-employee",
        "/reports/revenue-by-product",
      ],
    },
  ],
  faq: [
    {
      question: "Tôi tạo đơn xong nhưng không thấy nút Gửi đơn?",
      answer:
        "Đúng vậy — chỉ Nhân viên kinh doanh và Quản lý chung gửi được đơn. Lưu nháp rồi nhờ họ gửi.",
    },
  ],
};
