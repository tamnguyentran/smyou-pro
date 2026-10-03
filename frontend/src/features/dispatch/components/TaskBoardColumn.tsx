import { Inbox } from "lucide-react";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cn } from "../../../lib/cn";
import type { TaskBoardItem } from "../api";
import { TASK_STATUS_LABEL, type TaskStatus } from "../taskStatus";
import { TaskBoardCard } from "./TaskBoardCard";

/** AC-DSP-082: 1 cột Kanban desktop — `NEEDS_ASSIGNEE` nổi tông `urgent` (UI_GUIDELINES §5). */
export function TaskBoardColumn({ status, items }: { status: TaskStatus; items: TaskBoardItem[] }) {
  const urgent = status === "NEEDS_ASSIGNEE";
  return (
    <div
      data-testid={`task-board-column-${status}`}
      className={cn(
        "flex max-h-[calc(100vh-16rem)] min-w-72 flex-1 flex-col rounded-2xl border bg-sidebar-sub/40",
        urgent ? "border-urgent-border" : "border-line",
      )}
    >
      <h2
        className={cn(
          "sticky top-0 shrink-0 rounded-t-2xl border-b px-3 py-2 text-sm font-semibold",
          urgent ? "border-urgent-border bg-urgent-bg text-urgent-fg" : "border-line text-heading",
        )}
      >
        {TASK_STATUS_LABEL[status]} ({items.length})
      </h2>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {items.length === 0 ? (
          <EmptyState icon={Inbox} message="Không có đầu việc phù hợp." />
        ) : (
          items.map((item) => <TaskBoardCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
