import { TASK_STATUS_LABEL, TASK_STATUS_ORDER } from "../../dispatch/taskStatus";
import type { Dashboard } from "../api";
import { StatTile } from "./StatTile";

type TaskSummary = NonNullable<Dashboard["task_summary"]>;

/** AC-DASH-010 (M7-02c): 6 thẻ đếm đầu việc toàn công ty theo trạng thái suy ra
 * (spec/state_machines.yaml#task.states, cùng thứ tự `TASK_STATUS_ORDER` dùng ở Bảng đầu việc).
 * "Cần giao lại" tô `urgent` khi > 0 — cùng số với `dispatch_summary.needs_assignee_count`,
 * lặp lại có chủ đích để thấy trong bức tranh đầy đủ các trạng thái đầu việc (như order_summary
 * đã lặp `pending_dispatch_count`). */
export function TaskSummarySection({ summary }: { summary: TaskSummary }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Đầu việc theo trạng thái</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {TASK_STATUS_ORDER.map((status) => (
          <StatTile
            key={status}
            label={TASK_STATUS_LABEL[status]}
            value={summary.counts_by_status[status]}
            tone={status === "NEEDS_ASSIGNEE" ? "urgent" : undefined}
          />
        ))}
      </div>
    </section>
  );
}
