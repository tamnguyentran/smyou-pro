import type { KpiRow } from "../api";
import {
  formatHoursPair,
  formatOnTime,
  REJECTION_REASON_LABELS,
  REJECTION_REASON_ORDER,
} from "../labels";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 text-center">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-heading">{value}</p>
    </div>
  );
}

/** AC-KPI-023: TECHNICIAN chỉ thấy 1 khối thẻ số liệu của chính mình, không bảng/danh sách. */
export function KpiSelfCard({ row }: { row: KpiRow }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Xong" value={String(row.completed_task_count)} />
        <Tile label="Đúng hạn" value={formatOnTime(row.on_time_count, row.completed_task_count)} />
        <Tile label="Lỗi" value={String(row.defect_count)} />
        <Tile
          label="Giờ ước tính/thực tế"
          value={formatHoursPair(row.estimated_hours_total, row.actual_hours_total)}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {REJECTION_REASON_ORDER.map((key) => (
          <Tile
            key={key}
            label={REJECTION_REASON_LABELS[key]}
            value={String(row.rejection_counts[key])}
          />
        ))}
        <Tile label="Tổng từ chối" value={String(row.rejection_total)} />
      </div>
    </div>
  );
}
