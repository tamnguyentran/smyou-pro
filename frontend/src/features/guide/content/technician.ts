import type { Guide } from "./types";

export const TECHNICIAN_GUIDE: Guide = {
  role: "TECHNICIAN",
  label: "Nhân viên kỹ thuật",
  summary:
    "Bạn nhận đầu việc do Quản lý kỹ thuật giao, đến chỗ khách thực hiện, báo hoàn thành kèm giờ thực tế và tải ảnh phiếu khách ký để hoàn tất đơn.",
  sections: [
    {
      id: "viec-cua-toi",
      title: "Việc của tôi",
      body: "Mọi đầu việc được giao cho bạn nằm ở trang Việc của tôi, chia 3 tab.",
      steps: [
        "Bấm Việc của tôi trên menu (hoặc ở thanh dưới trên điện thoại).",
        "Tab Chờ nhận: việc mới được giao, cần Tiếp nhận hoặc Từ chối.",
        "Tab Đang làm: việc đã tiếp nhận hoặc đang thực hiện.",
        "Tab Đã xong: việc đã báo hoàn thành.",
        "Bấm Chi tiết để mở đơn hàng: xem khách, địa chỉ, dòng hàng và tệp đính kèm.",
      ],
      screens: ["/my-tasks"],
    },
    {
      id: "tiep-nhan-tu-choi",
      title: "Tiếp nhận / Từ chối đầu việc",
      steps: [
        "Ở tab Chờ nhận, xem hạn chót và giờ ước tính của đầu việc.",
        "Làm được: bấm Tiếp nhận — đầu việc chuyển sang tab Đang làm.",
        "Không làm được: bấm Từ chối, chọn Lý do từ chối và nhập Lý do chi tiết (ít nhất 5 ký tự), rồi bấm Xác nhận từ chối.",
      ],
      note: "Từ chối bắt buộc có lý do. Quản lý kỹ thuật được báo ngay để giao người khác.",
      screens: ["/my-tasks"],
    },
    {
      id: "bat-dau",
      title: "Bắt đầu làm",
      steps: [
        "Khi đến chỗ khách và bắt đầu làm, mở tab Đang làm.",
        "Bấm Bắt đầu ở đầu việc tương ứng.",
      ],
      note: "Lần Bắt đầu đầu tiên của đơn chuyển đơn sang Đang thực hiện.",
      screens: ["/my-tasks"],
    },
    {
      id: "them-dong-hang",
      title: "Thêm dòng hàng tại hiện trường",
      body: "Khi khách mua thêm hàng hoặc dịch vụ ngay tại chỗ, bạn tự thêm vào đơn.",
      steps: [
        "Mở đơn (Chi tiết), chọn tab Dòng hàng.",
        "Bấm Thêm dòng hàng, chọn Sản phẩm hoặc Dịch vụ, tìm theo tên hoặc mã rồi bấm Thêm.",
        'Sửa số lượng nếu cần. Dòng bạn thêm có nhãn "KTV thêm".',
      ],
      note: "Chỉ thêm/sửa được khi bạn đang nhận hoặc thực hiện đầu việc của đơn, và chỉ sửa/xoá được dòng do chính bạn thêm. Người tạo đơn được thông báo.",
      screens: ["/my-tasks"],
    },
    {
      id: "tiem-nang",
      title: "Ghi tiềm năng khách hàng",
      body: "Khách có nhu cầu mới (lắp thêm camera, hỏi giá máy in…)? Ghi lại để Kinh doanh liên hệ.",
      steps: [
        "Mở đơn, tab Thông tin, tìm khối Tiềm năng sử dụng dịch vụ.",
        "Bấm Ghi tiềm năng, nhập Nội dung rồi bấm Lưu.",
      ],
      note: "Không ghi được khi đơn đã hoàn tất/huỷ hoặc đơn là khách lẻ chưa có trong danh bạ.",
      screens: ["/my-tasks"],
    },
    {
      id: "bao-xong",
      title: "Báo xong (giờ thực tế)",
      steps: [
        "Làm xong, mở tab Đang làm và bấm Báo hoàn thành.",
        "Nhập Giờ thực tế đã làm và Ghi chú (nếu có).",
        "Bấm Xác nhận hoàn thành — đầu việc chuyển sang tab Đã xong.",
      ],
      note: "Giờ thực tế dùng để tính KPI, hãy nhập đúng. Khi mọi đầu việc của đơn xong, đơn chuyển sang Chờ KH xác nhận.",
      screens: ["/my-tasks"],
    },
    {
      id: "hoan-tat-don",
      title: "Tải ảnh phiếu & Hoàn tất đơn",
      steps: [
        "Cho khách ký phiếu xác nhận, chụp ảnh phiếu.",
        "Mở đơn, tab Tệp đính kèm, bấm Tải ảnh phiếu xác nhận và chọn ảnh.",
        "Bấm Hoàn tất đơn ở đầu trang đơn, nhập Tên người ký.",
        "Bấm Xác nhận hoàn tất — đơn chuyển sang Hoàn tất.",
      ],
      note: "Phải có ảnh phiếu có chữ ký khách mới hoàn tất được. Thao tác này không hoàn tác.",
      screens: ["/my-tasks"],
    },
    {
      id: "mo-lai",
      title: "Khi đầu việc bị mở lại",
      body: "Nếu khách báo lỗi, Quản lý kỹ thuật có thể chuyển đơn sang Chỉnh sửa và mở lại đầu việc bạn đã làm.",
      steps: [
        "Đầu việc quay lại tab Chờ nhận với một lượt giao mới.",
        "Làm lại như bình thường: Tiếp nhận → Bắt đầu → Báo hoàn thành.",
        "Xong thì tải ảnh phiếu xác nhận mới cho lần chỉnh sửa này rồi Hoàn tất đơn.",
      ],
      note: "Lần mở lại ghi nhận một lỗi (Nhẹ hoặc Nặng) cho người đã làm lượt trước và tính vào KPI.",
      screens: ["/my-tasks"],
    },
    {
      id: "kpi-ktv",
      title: "Xem KPI công việc của tôi",
      steps: [
        "Mở Báo cáo → Công việc theo nhân viên.",
        "Chọn Từ ngày, Đến ngày để xem số đầu việc đúng hạn, số lỗi và giờ ước tính/thực tế của bạn.",
      ],
      screens: ["/reports/kpi"],
    },
  ],
  faq: [
    {
      question: "Tôi lỡ từ chối đầu việc, làm sao nhận lại?",
      answer:
        "Báo Quản lý kỹ thuật để giao lại cho bạn — đầu việc sẽ xuất hiện lại ở tab Chờ nhận.",
    },
    {
      question: "Vì sao tôi không thấy nút Thêm dòng hàng?",
      answer:
        "Bạn cần đang nhận hoặc thực hiện đầu việc của đơn, và đơn phải đang Đang thực hiện hoặc Chỉnh sửa.",
    },
  ],
};
