import type { Dashboard } from "../api";
import { StatTile } from "./StatTile";

type MyTaskSummary = NonNullable<Dashboard["my_task_summary"]>;

/** AC-DASH-020/021 (M7-02d): tình trạng đầu việc của chính KTV — cùng 3 nhóm "Chờ nhận"/"Đang
 * làm"/"Đã xong" đã dùng ở "Việc của tôi" (`MyTasksPage`), "Đã xong" chỉ tính trong ngày. */
export function MyTaskSummarySection({ summary }: { summary: MyTaskSummary }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Đầu việc của tôi</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Chờ nhận" value={summary.pending_count} tone="urgent" />
        <StatTile label="Đang làm" value={summary.active_count} tone="in_progress" />
        <StatTile label="Đã xong hôm nay" value={summary.done_today_count} tone="completed" />
        <StatTile
          label="Chưa thực hiện"
          value={summary.not_started_count}
          tone="review"
          to="/my-tasks?focus=not_started"
        />
        <StatTile
          label="Quá hạn chưa hoàn thành"
          value={summary.overdue_count}
          tone="urgent"
          to="/my-tasks?focus=overdue"
        />
        <StatTile
          label="Chưa hoàn tất, cần KH xác nhận"
          value={summary.awaiting_confirmation_count}
          tone="review"
          to="/orders?status=AWAITING_CONFIRMATION"
        />
      </div>
    </section>
  );
}
