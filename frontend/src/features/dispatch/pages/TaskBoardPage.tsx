import { Inbox } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { cn } from "../../../lib/cn";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { useMe } from "../../me/api";
import { useActiveTechnicians, useTaskBoard } from "../api";
import { EMPTY_TASK_BOARD_FILTERS, TaskBoardFilters } from "../components/TaskBoardFilters";
import { TaskBoardCard } from "../components/TaskBoardCard";
import { TaskBoardColumn } from "../components/TaskBoardColumn";
import { TASK_STATUS_ORDER } from "../taskStatus";

function Waiting({ desktop }: { desktop: boolean }) {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải bảng đầu việc"
      className={desktop ? "flex gap-4 overflow-x-auto" : "space-y-3"}
    >
      {Array.from({ length: desktop ? 6 : 3 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "animate-pulse rounded-2xl bg-sidebar-sub",
            desktop ? "h-96 min-w-72 flex-1" : "h-28 w-full",
          )}
        />
      ))}
    </div>
  );
}

/** AC-DSP-082…091: trang `/dispatch/board` — capability vào trang là `task.manage`, giống
 * `DispatchQueuePage` (M4-01b); API `GET /api/v1/tasks` đã có từ M4-03a. */
export function TaskBoardPage() {
  usePageTitle("Bảng đầu việc");
  const me = useMe();
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const [filters, setFilters] = useState(EMPTY_TASK_BOARD_FILTERS);
  const allowed = me.data !== undefined && "task.manage" in me.data.capabilities;
  const board = useTaskBoard(filters, { enabled: allowed });
  const technicians = useActiveTechnicians(allowed);

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <Waiting desktop={desktop} />;
  if (!allowed) return <ForbiddenPage />;

  return (
    <div className="space-y-4">
      <TaskBoardFilters
        filters={filters}
        technicians={technicians.data ?? []}
        showStatus={!desktop}
        onChange={setFilters}
      />

      {board.isPending ? (
        <Waiting desktop={desktop} />
      ) : board.isError ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được bảng đầu việc."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void board.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : desktop ? (
        <div className="flex gap-4 overflow-x-auto">
          {TASK_STATUS_ORDER.map((status) => (
            <TaskBoardColumn
              key={status}
              status={status}
              items={board.data.items.filter((item) => item.status === status)}
            />
          ))}
        </div>
      ) : board.data.items.length === 0 ? (
        <EmptyState icon={Inbox} message="Không có đầu việc phù hợp." />
      ) : (
        <div className="space-y-3">
          {board.data.items.map((item) => (
            <TaskBoardCard key={item.id} item={item} showStatus />
          ))}
        </div>
      )}
    </div>
  );
}
