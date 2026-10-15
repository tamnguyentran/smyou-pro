import type { KpiRow } from "../api";
import { formatHoursPair, onTimePercent } from "../labels";
import { OnTimeBar, RejectionDisclosure } from "./KpiStatBlocks";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 text-center">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-heading">{value}</p>
    </div>
  );
}

/** AC-KPI-023 (M8-01c): TECHNICIAN chỉ thấy 1 card số liệu của chính mình — 3 số chính + thanh
 * đúng hạn + "Tổng từ chối" gộp (chi tiết 5 lý do chỉ hiện khi bấm mở), cùng mẫu `KpiRows`. */
export function KpiSelfCard({ row }: { row: KpiRow }) {
  const percent = onTimePercent(row.on_time_count, row.completed_task_count);
  return (
    <div className="max-w-md space-y-3 rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Xong" value={String(row.completed_task_count)} />
        <Tile label="Đúng hạn" value={percent === null ? "—" : `${String(percent)}%`} />
        <Tile label="Lỗi" value={String(row.defect_count)} />
      </div>
      <OnTimeBar row={row} />
      <p className="text-sm text-body">
        <span className="text-muted">Giờ ước tính/thực tế:</span>{" "}
        {formatHoursPair(row.estimated_hours_total, row.actual_hours_total)}
      </p>
      <RejectionDisclosure row={row} />
    </div>
  );
}
