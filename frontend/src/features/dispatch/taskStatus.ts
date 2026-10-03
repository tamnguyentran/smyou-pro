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

/** Thứ tự cột Kanban của "Bảng đầu việc" (M4-03b) — đúng thứ tự khai báo trên. */
export const TASK_STATUS_ORDER = Object.keys(TASK_STATUS_LABEL) as TaskStatus[];

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

/** Task đã xong/huỷ: `TaskEditSheet` chỉ hiện chế độ xem (M4-02b, AC-DSP-065). */
export const TERMINAL_TASK_STATUSES = new Set<string>(["DONE", "CANCELLED"]);

/** Đúng guard `order_in_dispatchable_state` của các lệnh task (`spec/state_machines.yaml`,
 * `backend/app/modules/workflow/guards.py`) — một nguồn quy tắc duy nhất cho nút "Tạo đầu việc"
 * (Q65) và các nút sửa/thêm/gỡ/huỷ trong `TaskEditSheet` (M4-02b, AC-DSP-066). Server vẫn là nơi
 * chặn thật. */
export const DISPATCHABLE_STATUSES = new Set(["PENDING_DISPATCH", "IN_PROGRESS", "REVISION"]);

/** spec/state_machines.yaml#assignment.states — nhãn + tone cho trạng thái 1 phân công trong
 * "Người được giao" của `TaskEditSheet`. API chỉ trả phân công đang hoạt động (M4-02a), nên
 * REJECTED/REMOVED không bao giờ xuất hiện ở đây — chỉ cần nhãn cho 4 trạng thái còn lại. */
export const ASSIGNMENT_STATUS_LABEL = {
  PENDING: "Chờ tiếp nhận",
  ACCEPTED: "Đã tiếp nhận",
  IN_PROGRESS: "Đang thực hiện",
  DONE: "Hoàn thành",
} as const;

export type AssignmentStatus = keyof typeof ASSIGNMENT_STATUS_LABEL;

export const ASSIGNMENT_STATUS_TONE: Record<
  AssignmentStatus,
  "todo" | "review" | "in_progress" | "completed"
> = {
  PENDING: "todo",
  ACCEPTED: "review",
  IN_PROGRESS: "in_progress",
  DONE: "completed",
};

export function knownAssignmentStatus(status: string): AssignmentStatus | undefined {
  return status in ASSIGNMENT_STATUS_LABEL ? (status as AssignmentStatus) : undefined;
}
