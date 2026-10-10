import { Badge } from "../../../components/ui/Badge";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { KpiRow } from "../api";
import {
  formatHoursPair,
  formatOnTime,
  REJECTION_REASON_LABELS,
  REJECTION_REASON_ORDER,
} from "../labels";

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

const NUMERIC_CELL = "px-4 py-3 text-right text-body";

/** AC-KPI-017/018: bảng ở desktop (≥1024px), card dọc ở mobile — cùng dữ liệu nhiều KTV. */
export function KpiRows({ rows }: { rows: KpiRow[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {[
              "KTV",
              "Xong",
              "Đúng hạn",
              ...REJECTION_REASON_ORDER.map((key) => REJECTION_REASON_LABELS[key]),
              "Tổng từ chối",
              "Lỗi",
              "Giờ ước tính/thực tế",
            ].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.employee_id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 font-medium text-heading">
                <TechnicianLabel row={row} />
              </td>
              <td className={NUMERIC_CELL}>{row.completed_task_count}</td>
              <td className={NUMERIC_CELL}>
                {formatOnTime(row.on_time_count, row.completed_task_count)}
              </td>
              {REJECTION_REASON_ORDER.map((key) => (
                <td key={key} className={NUMERIC_CELL}>
                  {row.rejection_counts[key]}
                </td>
              ))}
              <td className={NUMERIC_CELL}>{row.rejection_total}</td>
              <td className={NUMERIC_CELL}>{row.defect_count}</td>
              <td className={NUMERIC_CELL}>
                {formatHoursPair(row.estimated_hours_total, row.actual_hours_total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li
          key={row.employee_id}
          className="rounded-2xl border border-line bg-card p-4 shadow-card"
        >
          <p className="font-semibold text-heading">
            <TechnicianLabel row={row} />
          </p>
          <dl className="mt-2 space-y-1 text-sm text-body">
            <Line label="Xong" value={String(row.completed_task_count)} />
            <Line
              label="Đúng hạn"
              value={formatOnTime(row.on_time_count, row.completed_task_count)}
            />
            {REJECTION_REASON_ORDER.map((key) => (
              <Line
                key={key}
                label={REJECTION_REASON_LABELS[key]}
                value={String(row.rejection_counts[key])}
              />
            ))}
            <Line label="Tổng từ chối" value={String(row.rejection_total)} />
            <Line label="Lỗi" value={String(row.defect_count)} />
            <Line
              label="Giờ ước tính/thực tế"
              value={formatHoursPair(row.estimated_hours_total, row.actual_hours_total)}
            />
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-heading">{value}</dd>
    </div>
  );
}
