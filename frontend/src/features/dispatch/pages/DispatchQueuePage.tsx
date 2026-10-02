import { Inbox } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { useMe } from "../../me/api";
import type { OrderSummary } from "../../orders/api";
import { useDispatchQueue } from "../api";
import { DispatchQueueList } from "../components/DispatchQueueList";
import { TaskCreateSheet } from "../components/TaskCreateSheet";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải hàng đợi điều phối"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** AC-DSP-015…018: trang `/dispatch/queue` — capability vào trang là `task.manage`, giống mục menu. */
export function DispatchQueuePage() {
  usePageTitle("Đơn chờ điều phối");
  const me = useMe();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<OrderSummary | null>(null);
  const allowed = me.data !== undefined && "task.manage" in me.data.capabilities;
  const queue = useDispatchQueue({ limit: PAGE_SIZE, offset, enabled: allowed });

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <Waiting />;
  if (!allowed) return <ForbiddenPage />;

  return (
    <div className="space-y-4">
      {queue.isPending ? (
        <Waiting />
      ) : queue.isError ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được hàng đợi điều phối."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void queue.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : queue.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Không có đơn nào chờ điều phối."
          action={
            <p className="text-sm text-muted">Đơn mới do Kinh doanh gửi sẽ xuất hiện ở đây.</p>
          }
        />
      ) : (
        <>
          <DispatchQueueList items={queue.data.items} onSelect={setSelected} />
          <Pagination
            total={queue.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}

      {selected ? (
        <TaskCreateSheet
          order={selected}
          onClose={() => {
            setSelected(null);
          }}
        />
      ) : null}
    </div>
  );
}
