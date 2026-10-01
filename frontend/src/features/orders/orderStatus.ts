export type { OrderStatus } from "./api";
import type { OrderStatus } from "./api";

/** spec/state_machines.yaml#order.states — label + Badge tone per status. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Nháp",
  PENDING_DISPATCH: "Chờ điều phối",
  IN_PROGRESS: "Đang thực hiện",
  AWAITING_CONFIRMATION: "Chờ khách xác nhận",
  COMPLETED: "Hoàn tất",
  REVISION: "Chỉnh sửa",
  CANCELLED: "Đã huỷ",
};

export const ORDER_STATUS_TONE: Record<
  OrderStatus,
  "todo" | "in_progress" | "review" | "completed" | "urgent"
> = {
  DRAFT: "todo",
  PENDING_DISPATCH: "review",
  IN_PROGRESS: "in_progress",
  AWAITING_CONFIRMATION: "review",
  COMPLETED: "completed",
  REVISION: "urgent",
  CANCELLED: "todo",
};

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "DRAFT",
  "PENDING_DISPATCH",
  "IN_PROGRESS",
  "AWAITING_CONFIRMATION",
  "COMPLETED",
  "REVISION",
  "CANCELLED",
];

/** spec/state_machines.yaml#order.transitions (submit/recall/cancel) + backend's other
 * `audit.record` actions on ORDER (orders/service.py) — nhãn tiếng Việt cho tab "Lịch sử". */
export const COMMAND_LABELS: Record<string, string> = {
  submit: "Gửi đơn",
  recall: "Thu hồi",
  cancel: "Huỷ đơn",
  create: "Tạo đơn",
  update: "Cập nhật thông tin",
  add_line: "Thêm dòng hàng",
  update_line: "Sửa dòng hàng",
  remove_line: "Xoá dòng hàng",
};
