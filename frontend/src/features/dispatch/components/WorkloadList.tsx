import { CalendarClock, Timer } from "lucide-react";
import { formatDateTime } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { EmployeeWorkload } from "../api";

type WorkloadGroupKey = "IN_PROGRESS" | "NOT_STARTED" | "IDLE";

/** AC-DSP-108/109 (M4-04b): nhóm theo `in_progress_count`/`open_task_count` — không suy luận
 * trạng thái phân công nào cả, chỉ dùng 2 số đã tổng hợp sẵn từ `GET /api/v1/tasks/workload`. */
function groupKeyOf(item: EmployeeWorkload): WorkloadGroupKey {
  if (item.in_progress_count > 0) return "IN_PROGRESS";
  if (item.open_task_count > 0) return "NOT_STARTED";
  return "IDLE";
}

/** Dùng lại đúng tone Badge đã có (UI_GUIDELINES §2) — không tạo màu mới: `in_progress` (xanh
 * nhạt) = đang làm, `review` (vàng nhạt) = đã giao nhưng chưa bắt đầu, `urgent` (hồng nhạt) =
 * chưa có đầu việc, mẫu header màu theo `TaskBoardColumn.tsx`. Chỉ tô màu header, không tô hàng/thẻ
 * (nền pha loãng + `text-muted` từng rớt dưới 4.5:1 ở axe — nhóm đã đủ rõ nhờ tiêu đề). */
const GROUPS: {
  key: WorkloadGroupKey;
  label: string;
  headerClass: string;
}[] = [
  {
    key: "IN_PROGRESS",
    label: "Đang làm",
    headerClass: "border-in_progress-border bg-in_progress-bg text-in_progress-fg",
  },
  {
    key: "NOT_STARTED",
    label: "Chưa thực hiện",
    headerClass: "border-review-border bg-review-bg text-review-fg",
  },
  {
    key: "IDLE",
    label: "Chưa có đầu việc",
    headerClass: "border-urgent-border bg-urgent-bg text-urgent-fg",
  },
];

function GroupHeader({
  label,
  count,
  headerClass,
}: {
  label: string;
  count: number;
  headerClass: string;
}) {
  return (
    <h2 className={`rounded-xl border px-3 py-2 text-sm font-semibold ${headerClass}`}>
      {label} ({count})
    </h2>
  );
}

/** AC-DSP-101/102/108/109: table on desktop, cards on mobile — grouped by workload status;
 * read-only, no row action (out of scope §2: linking to the filtered board is a separate,
 * later item). */
export function WorkloadList({ items }: { items: EmployeeWorkload[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const groups = GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => groupKeyOf(item) === group.key),
  })).filter((group) => group.items.length > 0);

  if (desktop) {
    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <GroupHeader
              label={group.label}
              count={group.items.length}
              headerClass={group.headerClass}
            />
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
                {group.items.map((item) => (
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
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <GroupHeader
            label={group.label}
            count={group.items.length}
            headerClass={group.headerClass}
          />
          <ul className="space-y-3">
            {group.items.map((item) => (
              <li key={item.employee_id} className="rounded-2xl p-5 shadow-card">
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
        </div>
      ))}
    </div>
  );
}
