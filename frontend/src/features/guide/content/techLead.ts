import type { Guide } from "./types";

export const TECH_LEAD_GUIDE: Guide = {
  role: "TECH_LEAD",
  label: "Quản lý kỹ thuật",
  summary:
    "Bạn nhận đơn đã gửi, chia thành đầu việc, giao kỹ thuật viên, theo dõi tiến độ và xử lý khi khách cần chỉnh sửa.",
  sections: [
    {
      id: "cho-dieu-phoi",
      title: "Đơn chờ điều phối",
      steps: [
        "Mở Điều phối kỹ thuật → Đơn chờ điều phối (bạn được thông báo khi có đơn mới gửi).",
        "Xem khách, độ ưu tiên, ngày hẹn; bấm vào đơn để mở chi tiết.",
      ],
      screens: ["/dispatch/queue"],
    },
    {
      id: "tao-dau-viec",
      title: "Tạo đầu việc",
      steps: [
        "Trong đơn, mở tab Đầu việc, bấm Tạo đầu việc.",
        "Kiểm tra Tiêu đề đầu việc (điền sẵn 100 ký tự đầu của Mô tả công việc) và Mô tả (chép đầy đủ Mô tả công việc), sửa nếu cần.",
        "Nhập Số giờ ước tính (0,25 – 200 giờ, bước 0,25) — Hạn hoàn thành tự tính = bây giờ + số giờ, chỉ trong giờ làm 8h–12h, 13h–17h, Thứ 2 – Thứ 7 (sửa tay nếu cần, không ở quá khứ); chọn Mức ưu tiên.",
        "Ở Giao cho kỹ thuật viên, chọn một hoặc nhiều kỹ thuật viên.",
        "Bấm Tạo đầu việc — kỹ thuật viên được thông báo.",
      ],
      note: "Đơn chuyển sang Đang thực hiện khi có kỹ thuật viên nhận việc.",
      screens: ["/dispatch/queue", "/dispatch/board"],
    },
    {
      id: "bang-dau-viec",
      title: "Bảng đầu việc & Cần giao lại",
      steps: [
        "Mở Điều phối kỹ thuật → Bảng đầu việc; mỗi cột là một trạng thái đầu việc.",
        "Lọc theo Trạng thái, Ưu tiên, Kỹ thuật viên, khoảng ngày.",
        "Cột Cần giao lại: đầu việc không còn ai nhận (ví dụ kỹ thuật viên từ chối) — mở và thêm người mới.",
      ],
      screens: ["/dispatch/board"],
    },
    {
      id: "sua-dau-viec",
      title: "Thêm/gỡ người, sửa/huỷ đầu việc",
      steps: [
        "Bấm vào đầu việc để mở Sửa đầu việc.",
        "Người được giao: bấm + Thêm người, hoặc Gỡ để bỏ một người.",
        "Sửa tiêu đề, giờ, hạn, ưu tiên rồi bấm Lưu.",
        "Huỷ đầu việc: bấm Huỷ đầu việc, nhập Lý do huỷ, bấm Xác nhận huỷ.",
      ],
      screens: ["/dispatch/board"],
    },
    {
      id: "tai-viec",
      title: "Lịch & tải việc",
      steps: [
        "Mở Điều phối kỹ thuật → Lịch & tải việc.",
        "Xem mỗi kỹ thuật viên đang có bao nhiêu đầu việc mở, tổng giờ ước tính, hạn gần nhất để giao việc cân bằng.",
      ],
      screens: ["/dispatch/workload"],
    },
    {
      id: "hoan-tat-thay",
      title: "Hoàn tất thay kỹ thuật viên",
      body: "Khi kỹ thuật viên không tự tải được ảnh phiếu, bạn hoàn tất đơn thay.",
      steps: [
        "Mở đơn đang Chờ KH xác nhận, tab Tệp đính kèm, bấm Tải ảnh phiếu xác nhận.",
        "Bấm Hoàn tất đơn, nhập Tên người ký, bấm Xác nhận hoàn tất.",
      ],
      note: "Báo hoàn thành đầu việc (giờ thực tế) vẫn do chính kỹ thuật viên làm.",
      screens: ["/dispatch/board"],
    },
    {
      id: "chinh-sua",
      title: "Chuyển Chỉnh sửa & mở lại đầu việc",
      steps: [
        "Đơn Chờ KH xác nhận hoặc Hoàn tất cần làm lại: bấm Chuyển Chỉnh sửa, nhập Lý do, bấm Xác nhận.",
        "Đơn hiện ở Điều phối kỹ thuật → Đơn cần chỉnh sửa (kể cả yêu cầu từ Chăm sóc khách hàng).",
        "Mở đầu việc Hoàn thành cần làm lại, bấm Mở lại, nhập Lý do và chọn Mức độ lỗi (Nhẹ/Nặng), bấm Xác nhận mở lại.",
      ],
      note: "Mở lại ghi nhận lỗi theo mức lỗi đã chọn cho người đã làm lượt trước, tính vào KPI. Không hoàn tác.",
      screens: ["/dispatch/revisions", "/dispatch/board"],
    },
    {
      id: "phat-sinh",
      title: "Đầu việc phát sinh",
      steps: [
        "Đơn đang Chỉnh sửa cần thêm việc mới: mở tab Đầu việc, bấm Tạo đầu việc như bình thường.",
        "Giao kỹ thuật viên; xong mọi đầu việc thì đơn quay lại Chờ KH xác nhận.",
      ],
      note: "Mỗi lần Chỉnh sửa phải có ít nhất 1 đầu việc được tạo hoặc mở lại thì đơn mới quay lại Chờ KH xác nhận.",
      screens: ["/dispatch/revisions"],
    },
    {
      id: "kpi-ktv",
      title: "Công việc theo nhân viên",
      steps: [
        "Mở Báo cáo → Công việc theo nhân viên.",
        "Chọn Từ ngày, Đến ngày, Kỹ thuật viên; xem Đúng hạn, Lỗi, giờ ước tính/thực tế.",
        "Bấm Xuất CSV khi cần.",
      ],
      screens: ["/reports/kpi"],
    },
  ],
  faq: [
    {
      question: "Kỹ thuật viên từ chối thì sao?",
      answer: "Đầu việc hiện ở cột Cần giao lại trên Bảng đầu việc; mở và thêm người khác.",
    },
  ],
};
