import type { OrderStatus } from "../../orders/orderStatus";
import type { GuideSection } from "./types";

/** Phần chung có ở đầu mọi bản. */
export const COMMON_SECTIONS: GuideSection[] = [
  {
    id: "dang-nhap",
    title: "Đăng nhập & đổi mật khẩu",
    body: "Mỗi nhân viên có một tên đăng nhập do Quản lý chung cấp.",
    steps: [
      "Mở trang đăng nhập, nhập Tên đăng nhập và Mật khẩu rồi bấm Đăng nhập.",
      "Lần đầu đăng nhập bằng mật khẩu tạm, hệ thống bắt đổi mật khẩu mới trước khi vào làm việc.",
      "Quên mật khẩu: bấm Quên mật khẩu? ở trang đăng nhập, nhập Email và bấm Gửi liên kết; hoặc nhờ Quản lý chung cấp mật khẩu tạm mới.",
      "Muốn đổi mật khẩu sau này: vào trang Cá nhân, bấm Đổi mật khẩu.",
    ],
    note: "Mật khẩu tạm có hạn sử dụng — hết hạn thì nhờ Quản lý chung cấp lại.",
    screens: ["/dang-nhap", "/doi-mat-khau", "/quen-mat-khau", "/ca-nhan"],
  },
  {
    id: "tong-quan",
    title: "Trang Tổng quan",
    body: "Trang đầu tiên sau khi đăng nhập, tóm tắt công việc theo vai trò của bạn.",
    steps: [
      "Bấm Tổng quan trên menu (hoặc ở thanh dưới trên điện thoại).",
      "Xem các thẻ số liệu; bấm vào một thẻ để mở danh sách chi tiết.",
    ],
    screens: ["/"],
  },
  {
    id: "thong-bao",
    title: "Thông báo",
    body: "Chuông trên đầu trang hiện số thông báo chưa đọc (đơn mới, được giao việc, đơn hoàn tất…).",
    steps: [
      "Bấm biểu tượng chuông để mở danh sách thông báo.",
      "Bấm một thông báo để mở đơn hàng liên quan; bấm Đánh dấu tất cả đã đọc để xoá số chưa đọc.",
    ],
    screens: ["/thong-bao"],
  },
  {
    id: "ca-nhan",
    title: "Trang Cá nhân",
    steps: [
      "Mở menu, chọn tên của bạn (hoặc Cá nhân ở thanh dưới trên điện thoại).",
      "Xem thông tin của mình; bấm Đổi mật khẩu khi cần.",
      "Đăng xuất khi dùng chung máy.",
    ],
    screens: ["/ca-nhan"],
  },
];

/** Giải thích từng trạng thái đơn — nhãn lấy từ ORDER_STATUS_LABEL (= spec/state_machines.yaml). */
export const ORDER_STATUS_HELP: Record<OrderStatus, string> = {
  DRAFT: "Đơn đang soạn, chỉ người tạo (và Quản lý chung) thấy để sửa. Chưa ai được giao việc.",
  PENDING_DISPATCH:
    "Đơn đã gửi, chờ Quản lý kỹ thuật tạo đầu việc và giao kỹ thuật viên. Người gửi còn Thu hồi được khi chưa có đầu việc.",
  IN_PROGRESS: "Đã có kỹ thuật viên được giao; các đầu việc đang được thực hiện.",
  AWAITING_CONFIRMATION:
    "Mọi đầu việc đã xong; chờ tải ảnh phiếu khách ký xác nhận để hoàn tất đơn.",
  COMPLETED:
    "Khách đã ký xác nhận, đơn kết thúc. Quản lý kỹ thuật vẫn có thể chuyển sang Chỉnh sửa nếu cần làm thêm.",
  REVISION:
    "Đơn được mở lại để làm thêm hoặc sửa lỗi; Quản lý kỹ thuật thêm/mở lại đầu việc, xong thì khách ký xác nhận lại.",
  CANCELLED: "Đơn đã huỷ (có lý do), không làm tiếp được.",
};
