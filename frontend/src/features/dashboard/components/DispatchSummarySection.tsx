import type { Dashboard } from "../api";
import { StatTile } from "./StatTile";

type DispatchSummary = NonNullable<Dashboard["dispatch_summary"]>;

/** AC-DASH-002/003/004/007/008/011/014: 3 thẻ điều phối (toàn công ty, không có khái niệm "của tôi").
 * AC-DASH-027/028 (M10-03): chỉ "Chờ điều phối" drill-down tới `/dispatch/queue` (đã tự giới hạn
 * đúng danh sách, không cần param); "Cần giao lại"/"Quá hạn" đếm theo đầu việc, chưa có đích lọc phù hợp
 * → không link (ngoài phạm vi, xem spec §2). */
export function DispatchSummarySection({ summary }: { summary: DispatchSummary }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Điều phối</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label="Chờ điều phối"
          value={summary.pending_dispatch_count}
          to="/dispatch/queue"
        />
        <StatTile label="Cần giao lại" value={summary.needs_assignee_count} tone="urgent" />
        <StatTile label="Quá hạn" value={summary.overdue_task_count} tone="urgent" />
      </div>
    </section>
  );
}
