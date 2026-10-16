import type { KpiRow } from "../api";
import { onTimePercent, REJECTION_REASON_LABELS, REJECTION_REASON_ORDER } from "../labels";

/** Thanh tỷ lệ đúng hạn — trực quan hơn số thô "x/y · z%" (vẫn giữ số đó làm phụ đề). */
export function OnTimeBar({ row }: { row: KpiRow }) {
  const percent = onTimePercent(row.on_time_count, row.completed_task_count);
  if (percent === null) {
    return <p className="text-sm text-muted">Chưa có đầu việc hoàn thành.</p>;
  }
  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-sidebar-sub">
        <div
          className="h-full rounded-full bg-completed-fg"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <p className="text-xs text-muted">
        {row.on_time_count}/{row.completed_task_count} đúng hạn
      </p>
    </div>
  );
}

/** Gộp 5 lý do từ chối (trước đây 5 cột/thẻ riêng) thành 1 số "Tổng từ chối" + chi tiết chỉ hiện
 * khi bấm mở — giảm số lượng ô cần đọc khi quét nhanh nhiều KTV. */
export function RejectionDisclosure({ row }: { row: KpiRow }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-brand">
        Tổng từ chối: {row.rejection_total}
      </summary>
      <dl className="mt-2 space-y-1 border-t border-line pt-2">
        {REJECTION_REASON_ORDER.map((key) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <dt className="text-muted">{REJECTION_REASON_LABELS[key]}</dt>
            <dd className="font-medium text-heading">{row.rejection_counts[key]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
