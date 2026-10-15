import { Badge } from "../../../components/ui/Badge";
import type { KpiRow } from "../api";
import { formatHoursPair, onTimePercent } from "../labels";
import { OnTimeBar, RejectionDisclosure } from "./KpiStatBlocks";

function TechnicianLabel({ row }: { row: KpiRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>
        {row.employee_full_name} ({row.employee_code})
      </span>
      {!row.employee_is_active ? <Badge tone="neutral">Đã nghỉ</Badge> : null}
    </span>
  );
}

function StatBig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-2xl font-bold text-heading">{value}</p>
    </div>
  );
}

function KpiCard({ row }: { row: KpiRow }) {
  const percent = onTimePercent(row.on_time_count, row.completed_task_count);
  return (
    <li className="space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card">
      <p className="font-semibold text-heading">
        <TechnicianLabel row={row} />
      </p>
      <div className="grid grid-cols-3 gap-3">
        <StatBig label="Xong" value={String(row.completed_task_count)} />
        <StatBig label="Đúng hạn" value={percent === null ? "—" : `${String(percent)}%`} />
        <StatBig label="Lỗi" value={String(row.defect_count)} />
      </div>
      <OnTimeBar row={row} />
      <p className="text-sm text-body">
        <span className="text-muted">Giờ ước tính/thực tế:</span>{" "}
        {formatHoursPair(row.estimated_hours_total, row.actual_hours_total)}
      </p>
      <RejectionDisclosure row={row} />
    </li>
  );
}

/** AC-KPI-017/018 (M8-01c): lưới card — 1 cột ở mobile, nhiều cột ở desktop — thay bảng dày đặc
 * trước đây (11 cột: KTV/Xong/Đúng hạn/5 lý do từ chối/Tổng/Lỗi/Giờ) để dễ quét số liệu nhiều KTV. */
export function KpiRows({ rows }: { rows: KpiRow[] }) {
  return (
    <ul
      aria-label="Báo cáo KPI theo kỹ thuật viên"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
    >
      {rows.map((row) => (
        <KpiCard key={row.employee_id} row={row} />
      ))}
    </ul>
  );
}
