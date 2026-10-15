import type { Dashboard } from "../api";
import { StatTile } from "./StatTile";

type StaffSummary = NonNullable<Dashboard["staff_summary"]>;

/** AC-DASH-011 (M7-02c): đếm KTV đang hoạt động theo 3 nhóm — đúng cách nhóm "Đang làm"/"Chưa
 * thực hiện"/"Chưa có đầu việc" đã dùng ở `WorkloadList` (M4-04b), nhất quán màu giữa 2 màn. */
export function StaffSummarySection({ summary }: { summary: StaffSummary }) {
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
        />
        <StatTile
          label="Chưa thực hiện"
          value={summary.counts_by_status.NOT_STARTED}
          tone="review"
        />
        <StatTile label="Chưa có đầu việc" value={summary.counts_by_status.IDLE} tone="urgent" />
      </div>
    </section>
  );
}
