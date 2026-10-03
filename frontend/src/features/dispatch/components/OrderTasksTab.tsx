import { CalendarClock, ClipboardList, Plus, Timer, Users } from "lucide-react";
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
import {
  DISPATCHABLE_STATUSES,
  knownTaskStatus,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
} from "../taskStatus";
import { TaskCreateSheet } from "./TaskCreateSheet";
import { TaskEditSheet } from "./TaskEditSheet";

const COLUMNS = ["Mã", "Tiêu đề", "Trạng thái", "Số giờ", "Hạn hoàn thành", "Người được giao"];

const CODE_BUTTON =
  "min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

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

/** AC-DSP-028/036/058: bảng trên desktop, thẻ trên mobile — thứ tự giữ nguyên như API trả về
 * (`created_at asc`), client không tự sắp lại. Bấm vào dòng/thẻ mở `TaskEditSheet` (khuôn
 * `M3-05-clickable-list-rows.md`, như `OrderList.tsx`). */
function TaskList({
  tasks,
  onSelect,
}: {
  tasks: TaskSummary[];
  onSelect: (taskId: string) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table
        data-testid="order-tasks"
        className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm"
      >
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
            <tr
              key={task.id}
              className="cursor-pointer hover:bg-sidebar-sub"
              onClick={() => {
                onSelect(task.id);
              }}
            >
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(task.id);
                  }}
                  className={CODE_BUTTON}
                >
                  {task.code}
                </button>
              </td>
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
    <ul data-testid="order-tasks" aria-label="Đầu việc của đơn" className="space-y-3">
      {tasks.map((task) => (
        <li key={task.id}>
          <button
            type="button"
            onClick={() => {
              onSelect(task.id);
            }}
            className="w-full space-y-1 rounded-2xl border border-line bg-card p-4 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-heading">{task.code}</span>
              <StatusBadge status={task.status} />
            </div>
            <p className="text-sm text-body">{task.title}</p>
            <p className="flex items-center gap-2 text-sm text-body">
              <Timer aria-hidden="true" className="size-4 shrink-0 text-muted" />
              Số giờ: {hoursLabel(task.estimated_hours)} giờ
            </p>
            <p className="flex items-center gap-2 text-sm text-body">
              <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-muted" />
              Hạn: {formatDateTime(task.due_at)}
            </p>
            <p className="flex items-center gap-2 text-sm text-body">
              <Users aria-hidden="true" className="size-4 shrink-0 text-muted" />
              Người được giao: {assigneeNames(task)}
            </p>
          </button>
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
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
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
          className="space-y-3"
        >
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-20 animate-pulse rounded-2xl bg-sidebar-sub" />
          ))}
        </div>
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
        <TaskList tasks={tasks.data.items} onSelect={setEditTaskId} />
      )}

      {createOpen ? (
        <TaskCreateSheet
          order={order}
          onClose={() => {
            setCreateOpen(false);
          }}
        />
      ) : null}

      {editTaskId !== null ? (
        <TaskEditSheet
          orderId={order.id}
          taskId={editTaskId}
          onClose={() => {
            setEditTaskId(null);
          }}
        />
      ) : null}
    </div>
  );
}
