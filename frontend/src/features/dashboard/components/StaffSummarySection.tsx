import type { Dashboard } from "../api";
import { StatTile } from "./StatTile";

type StaffSummary = NonNullable<Dashboard["staff_summary"]>;

/** AC-DASH-011 (M7-02c): đếm KTV đang hoạt động theo 3 nhóm — đúng cách nhóm "Đang làm"/"Chưa
 * thực hiện"/"Chờ giao việc" đã dùng ở `WorkloadList` (M4-04b), nhất quán màu giữa 2 màn.
 * AC-DASH-039…042 (M10-07b): "Chưa tiếp nhận" (đếm theo đầu việc, Q85) chèn giữa "Đang làm" và
 * "Chưa thực hiện"; mọi link (gồm 3 thẻ còn lại, drill-down tới `/dispatch/workload?group=...`)
 * chỉ bật khi người gọi có `task.manage` (TECH_LEAD) — MANAGER không có quyền vào trang đó nên
 * vẫn thấy số nhưng không bấm được. */
export function StaffSummarySection({
  summary,
  canViewTaskBoard,
}: {
  summary: StaffSummary;
  canViewTaskBoard: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">
        Nhân sự kỹ thuật ({summary.active_technician_count} đang hoạt động)
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label="Đang làm"
          value={summary.counts_by_status.IN_PROGRESS}
          tone="in_progress"
          to={canViewTaskBoard ? "/dispatch/workload?group=IN_PROGRESS" : undefined}
        />
        <StatTile
          label="Chưa tiếp nhận"
          value={summary.pending_acceptance_count}
          tone="urgent"
          to={canViewTaskBoard ? "/dispatch/board?status=PENDING_ACCEPTANCE" : undefined}
        />
        <StatTile
          label="Chưa thực hiện"
          value={summary.counts_by_status.NOT_STARTED}
          tone="review"
          to={canViewTaskBoard ? "/dispatch/workload?group=NOT_STARTED" : undefined}
        />
        <StatTile
          label="Chờ giao việc"
          value={summary.counts_by_status.IDLE}
          tone="urgent"
          to={canViewTaskBoard ? "/dispatch/workload?group=IDLE" : undefined}
        />
      </div>
    </section>
  );
}
