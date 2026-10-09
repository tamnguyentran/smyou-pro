import { Inbox } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { useMe } from "../../me/api";
import { useOrders } from "../../orders/api";
import { OrderList } from "../../orders/components/OrderList";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách đơn cần chỉnh sửa"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** AC-DSP-127…129: trang `/dispatch/revisions` — capability vào trang là `task.manage`, giống
 * menu `dispatch-revise` (không phải `order.revise`, vốn chỉ gate nút "Chuyển Chỉnh sửa"). */
export function RevisionQueuePage() {
  usePageTitle("Đơn cần chỉnh sửa");
  const me = useMe();
  const [offset, setOffset] = useState(0);
  const allowed = me.data !== undefined && "task.manage" in me.data.capabilities;
  const orders = useOrders(
    { q: "", status: "REVISION", limit: PAGE_SIZE, offset },
    { enabled: allowed },
  );

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
      {orders.isPending ? (
        <Waiting />
      ) : orders.isError ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được danh sách."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void orders.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        />
      ) : orders.data.items.length === 0 ? (
        <EmptyState icon={Inbox} message="Không có đơn cần chỉnh sửa." />
      ) : (
        <>
          <OrderList
            items={orders.data.items}
            extraColumn={{
              heading: "Lần chỉnh sửa",
              render: (order) => `Lần chỉnh sửa ${String(order.revision_no)}`,
            }}
          />
          <Pagination
            total={orders.data.total}
            limit={PAGE_SIZE}
            offset={offset}
            onOffset={setOffset}
          />
        </>
      )}
    </div>
  );
}
