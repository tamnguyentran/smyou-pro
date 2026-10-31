/** Vietnamese wording of every capability in permissionMatrix.json (M17-05). A new capability in
 * spec/permissions.yaml needs a label here too — permissionLabels.test.ts fails until it has one. */
export const CAPABILITY_LABELS: Record<string, string> = {
  "catalog.read": "Xem danh mục sản phẩm/dịch vụ",
  "catalog.manage": "Thêm/sửa danh mục sản phẩm/dịch vụ",
  "employee.read": "Xem danh sách nhân viên",
  "employee.manage": "Quản lý nhân viên, phòng ban, vai trò",
  "employee.lookup": "Tìm nhân viên khi chọn người phụ trách",
  "profile.manage": "Sửa hồ sơ, đổi mật khẩu của mình",
  "customer.read": "Xem khách hàng",
  "customer.manage": "Thêm/sửa khách hàng",
  "customer_gift.read": "Xem ghi nhận quà tặng khách hàng",
  "customer_gift.manage": "Ghi nhận/sửa quà tặng khách hàng",
  "order.read": "Xem đơn hàng",
  "order.print": "In hoá đơn bán hàng",
  "order.read_prices": "Xem giá trong đơn",
  "order.create": "Tạo đơn",
  "order.edit_draft": "Sửa đơn nháp",
  "order.edit_contact": "Sửa SĐT/địa chỉ/ghi chú đơn sau khi gửi",
  "order.edit_lines_after_submit": "Sửa dòng hàng sau khi gửi",
  "order.submit": "Gửi đơn cho kỹ thuật",
  "order.cancel": "Huỷ đơn nháp/chờ điều phối",
  "order.cancel_active": "Huỷ đơn đang thực hiện",
  "order.upload_confirmation": "Tải ảnh khách ký xác nhận",
  "order.complete": "Hoàn tất đơn",
  "order.revise": "Chỉnh sửa đơn đã hoàn tất",
  "customer_care.manage_feedback": "Ghi nhận phản hồi chăm sóc khách hàng",
  "task.read": "Xem đầu việc",
  "task.manage": "Tạo, giao, sửa, huỷ đầu việc",
  "task.reopen": "Mở lại đầu việc",
  "assignment.respond": "Nhận/từ chối/bắt đầu/xong việc được giao",
  "task.upload_photo": "Tải ảnh đầu việc",
  "dashboard.read": "Xem Tổng quan",
  "kpi.read": "Xem báo cáo KPI",
  "report.revenue.read": "Xem báo cáo doanh thu",
  "report.customer_gift.read": "Xem báo cáo chi phí quà tặng",
  "audit.read": "Xem Nhật ký hệ thống",
  "company.manage": "Xem/sửa thông tin công ty",
  "notification.read": "Nhận thông báo",
};

export const SCOPE_LABELS: Record<string, string> = {
  all: "Tất cả",
  own: "Của mình",
  assigned: "Được giao",
  self: "Bản thân",
};

interface Matrix {
  groups: { capabilities: { id: string }[] }[];
}

/** Capabilities in the matrix without a label, and labels for capabilities no longer in it. */
export function labelProblems(
  matrix: Matrix,
  labels: Record<string, string> = CAPABILITY_LABELS,
): { missing: string[]; extra: string[] } {
  const ids = matrix.groups.flatMap((g) => g.capabilities.map((c) => c.id));
  return {
    missing: ids.filter((id) => !(id in labels)),
    extra: Object.keys(labels).filter((id) => !ids.includes(id)),
  };
}
