import { CalendarClock, Timer } from "lucide-react";
import { formatDateTime } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { EmployeeWorkload } from "../api";

/** AC-DSP-101/102: table on desktop, cards on mobile — read-only, no row action (out of
 * scope §2: linking to the filtered board is a separate, later item). */
export function WorkloadList({ items }: { items: EmployeeWorkload[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Tên KTV", "Số đầu việc đang mở", "Tổng giờ ước tính", "Hạn gần nhất"].map(
              (heading) => (
                <th key={heading} scope="col" className="px-4 py-3">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.employee_id}>
              <td className="px-4 py-3 font-medium text-heading">{item.full_name}</td>
              <td className="px-4 py-3 text-body">{item.open_task_count}</td>
              <td className="px-4 py-3 text-body">
                <span className="inline-flex items-center gap-1">
                  <Timer aria-hidden="true" className="size-4 text-muted" />
                  {item.total_estimated_hours}
                </span>
              </td>
              <td className="px-4 py-3 text-body">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock aria-hidden="true" className="size-4 text-muted" />
                  {item.nearest_due_at ? formatDateTime(item.nearest_due_at) : "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.employee_id}
          className="rounded-2xl border border-line bg-card p-4 shadow-card"
        >
          <p className="font-semibold text-heading">{item.full_name}</p>
          <p className="mt-1 text-sm text-body">
            <span className="text-muted">Số đầu việc đang mở:</span>{" "}
            <span>{item.open_task_count}</span>
          </p>
          <p className="text-sm text-body">
            <span className="text-muted">Tổng giờ ước tính:</span>{" "}
            <span className="inline-flex items-center gap-1">
              <Timer aria-hidden="true" className="size-4 text-muted" />
              {item.total_estimated_hours}
            </span>
          </p>
          <p className="text-sm text-body">
            <span className="text-muted">Hạn gần nhất:</span>{" "}
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden="true" className="size-4 text-muted" />
              {item.nearest_due_at ? formatDateTime(item.nearest_due_at) : "—"}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
