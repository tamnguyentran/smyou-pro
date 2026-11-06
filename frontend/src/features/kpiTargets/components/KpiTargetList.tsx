import { Badge } from "../../../components/ui/Badge";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { KpiTargetRow } from "../api";
import { TargetCell } from "./TargetCell";

function InactiveBadge({ row }: { row: KpiTargetRow }) {
  return row.employee_status === "INACTIVE" ? <Badge tone="todo">Đã nghỉ</Badge> : null;
}

/** AC-KPI-047/054: bảng 4 cột (≥1024px) / mỗi nhân viên một thẻ (điện thoại). */
export function KpiTargetList({
  items,
  month,
  onDelete,
}: {
  items: KpiTargetRow[];
  month: string;
  onDelete: (row: KpiTargetRow) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã NV", "Họ tên", "Phòng ban", "Chỉ tiêu thu nhập thuần (VND)"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((row) => (
            <tr key={row.employee_id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 text-body">{row.employee_code}</td>
              <td className="px-4 py-3">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-heading">
                  {row.employee_name}
                  <InactiveBadge row={row} />
                </span>
              </td>
              <td className="px-4 py-3 text-body">{row.department_name ?? "—"}</td>
              <td className="px-2 py-1">
                <TargetCell row={row} month={month} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((row) => (
        <li key={row.employee_id} className="space-y-2 rounded-2xl bg-card p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-heading" title={row.employee_name}>
                {row.employee_name}
              </p>
              <p className="text-sm text-body">
                {row.employee_code} · {row.department_name ?? "—"}
              </p>
            </div>
            <InactiveBadge row={row} />
          </div>
          <TargetCell row={row} month={month} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
