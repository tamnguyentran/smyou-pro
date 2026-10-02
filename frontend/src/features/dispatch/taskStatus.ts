/** spec/state_machines.yaml#task.states — nhãn + tone Badge cho từng trạng thái đầu việc.
 * Trạng thái task là **suy ra** từ các phân công đang hoạt động (`#task.derived_status`), server
 * tính và trả về trong `TaskSummary.status`; client chỉ hiển thị. */
export const TASK_STATUS_LABEL = {
  NEEDS_ASSIGNEE: "Cần giao lại",
  PENDING_ACCEPTANCE: "Chờ tiếp nhận",
  ACCEPTED: "Đã tiếp nhận",
  IN_PROGRESS: "Đang thực hiện",
  DONE: "Hoàn thành",
  CANCELLED: "Đã huỷ",
} as const;

export type TaskStatus = keyof typeof TASK_STATUS_LABEL;

export const TASK_STATUS_TONE: Record<
  TaskStatus,
  "todo" | "in_progress" | "review" | "completed" | "urgent"
> = {
  NEEDS_ASSIGNEE: "urgent",
  PENDING_ACCEPTANCE: "todo",
  ACCEPTED: "review",
  IN_PROGRESS: "in_progress",
  DONE: "completed",
  CANCELLED: "todo",
};

/** Trạng thái lạ (server thêm trạng thái mới trước khi frontend kịp cập nhật) không được làm
 * sập trang — hiện nguyên mã với tone trung tính, như `OrderHistoryTab` đã làm. */
export function knownTaskStatus(status: string): TaskStatus | undefined {
  return status in TASK_STATUS_LABEL ? (status as TaskStatus) : undefined;
}
