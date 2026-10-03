import { useNavigate } from "react-router";
import { Badge } from "../../../components/ui/Badge";
import { formatDateTime } from "../../../lib/format";
import type { TaskBoardItem } from "../api";
import { priorityBadge } from "../schemas";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, knownTaskStatus } from "../taskStatus";

/** AC-DSP-082…087: thẻ dùng chung desktop (trong cột) và mobile (trong danh sách). Cả thẻ bấm
 * được → điều hướng `/orders/{order_id}` (AC-DSP-086) — không mở sheet nào trên board. */
export function TaskBoardCard({
  item,
  showStatus = false,
}: {
  item: TaskBoardItem;
  /** Mobile không nhóm theo cột nên cần hiện trạng thái ngay trên thẻ (AC-DSP-087). */
  showStatus?: boolean;
}) {
  const navigate = useNavigate();
  const priority = priorityBadge(item.priority);
  const status = knownTaskStatus(item.status);

  return (
    <button
      type="button"
      onClick={() => {
        void navigate(`/orders/${item.order_id}`);
      }}
      className="flex min-h-11 w-full flex-col items-start gap-1 rounded-xl border border-line bg-card p-3 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="font-semibold text-heading">{item.code}</span>
        <Badge tone={priority.tone}>{priority.label}</Badge>
      </div>
      {showStatus ? (
        <Badge tone={status ? TASK_STATUS_TONE[status] : "neutral"}>
          {status ? TASK_STATUS_LABEL[status] : item.status}
        </Badge>
      ) : null}
      <p className="text-sm text-body">{item.title}</p>
      <p className="text-sm text-muted">{item.order_code}</p>
      <p className="text-sm text-body">
        <span className="text-muted">Hạn:</span> {formatDateTime(item.due_at)}
      </p>
      <div className="flex flex-wrap gap-1">
        {item.assignees.length === 0 ? (
          <span className="text-sm text-muted">Chưa có ai</span>
        ) : (
          item.assignees.map((a) => (
            <span
              key={a.employee_id}
              className="rounded-full bg-sidebar-sub px-2 py-0.5 text-xs text-body"
            >
              {a.full_name}
            </span>
          ))
        )}
      </div>
    </button>
  );
}
