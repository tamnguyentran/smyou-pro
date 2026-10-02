import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { formatDateTime } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { useMe } from "../../me/api";
import type { Order } from "../../orders/api";
import { useOrderTasks, type TaskSummary } from "../api";
import { hoursLabel } from "../schemas";
import { knownTaskStatus, TASK_STATUS_LABEL, TASK_STATUS_TONE } from "../taskStatus";
import { TaskCreateSheet } from "./TaskCreateSheet";

/** Đúng guard `order_in_dispatchable_state` của lệnh tạo đầu việc
 * (`spec/state_machines.yaml#task.commands[create]`, `backend/app/modules/workflow/guards.py`) —
 * một nguồn quy tắc duy nhất cho nút "Tạo đầu việc" (Q65). Server vẫn là nơi chặn thật. */
const DISPATCHABLE_STATUSES = new Set(["PENDING_DISPATCH", "IN_PROGRESS", "REVISION"]);

const COLUMNS = ["Mã", "Tiêu đề", "Trạng thái", "Số giờ", "Hạn hoàn thành", "Người được giao"];

function StatusBadge({ status }: { status: string }) {
  const known = knownTaskStatus(status);
  return (
    <Badge tone={known ? TASK_STATUS_TONE[known] : "neutral"}>
      {known ? TASK_STATUS_LABEL[known] : status}
    </Badge>
  );
}

function assigneeNames(task: TaskSummary): string {
  return task.assignees.map((assignee) => assignee.full_name).join(", ");
}

/** AC-DSP-028/036: bảng trên desktop, thẻ trên mobile — thứ tự giữ nguyên như API trả về
 * (`created_at asc`), client không tự sắp lại. */
function TaskList({ tasks }: { tasks: TaskSummary[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <caption className="sr-only">Đầu việc của đơn</caption>
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {COLUMNS.map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="px-4 py-3 font-semibold text-heading">{task.code}</td>
              <td className="px-4 py-3 text-body">{task.title}</td>
              <td className="px-4 py-3">
                <StatusBadge status={task.status} />
              </td>
              <td className="px-4 py-3 text-body tabular-nums">
                {hoursLabel(task.estimated_hours)} giờ
              </td>
              <td className="px-4 py-3 text-body tabular-nums">{formatDateTime(task.due_at)}</td>
              <td className="px-4 py-3 text-body">{assigneeNames(task)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul aria-label="Đầu việc của đơn" className="space-y-3">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="space-y-1 rounded-2xl border border-line bg-card p-4 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-heading">{task.code}</span>
            <StatusBadge status={task.status} />
          </div>
          <p className="text-sm text-body">{task.title}</p>
          <p className="text-sm text-body">Số giờ: {hoursLabel(task.estimated_hours)} giờ</p>
          <p className="text-sm text-body">Hạn: {formatDateTime(task.due_at)}</p>
          <p className="text-sm text-body">Người được giao: {assigneeNames(task)}</p>
        </li>
      ))}
    </ul>
  );
}

/** Tab "Đầu việc" của `/orders/:id` (AC-DSP-028…037): mọi vai trò xem được đơn đều xem được danh
 * sách (`order.read` — Q61); nút "Tạo đầu việc" chỉ cho người có `task.manage` và khi đơn còn ở
 * trạng thái điều phối được. */
export function OrderTasksTab({ order }: { order: Order }) {
  const me = useMe();
  const tasks = useOrderTasks(order.id);
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate =
    me.data !== undefined &&
    "task.manage" in me.data.capabilities &&
    DISPATCHABLE_STATUSES.has(order.status);

  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex lg:justify-end">
          <Button
            icon={<Plus aria-hidden="true" className="size-4" />}
            className="w-full lg:w-auto"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            Tạo đầu việc
          </Button>
        </div>
      ) : null}

      {tasks.isPending ? (
        <div
          role="group"
          aria-busy="true"
          aria-label="Đang tải danh sách đầu việc"
          className="h-32 animate-pulse rounded-2xl bg-sidebar-sub"
        />
      ) : tasks.isError ? (
        <EmptyState
          icon={ClipboardList}
          message="Không tải được danh sách đầu việc."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void tasks.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : tasks.data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          message="Chưa có đầu việc nào."
          action={
            <p className="text-sm text-muted">
              Quản lý kỹ thuật tạo đầu việc để giao cho kỹ thuật viên.
            </p>
          }
        />
      ) : (
        <TaskList tasks={tasks.data.items} />
      )}

      {createOpen ? (
        <TaskCreateSheet
          order={order}
          onClose={() => {
            setCreateOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
