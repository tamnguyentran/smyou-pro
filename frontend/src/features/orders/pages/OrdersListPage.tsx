import { Search, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useMe } from "../../me/api";
import { useOrders, type OrderFilters } from "../api";
import { OrderList } from "../components/OrderList";
import { ORDER_STATUS_LABEL, ORDER_STATUS_ORDER } from "../orderStatus";

const PAGE_SIZE = 20;

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải danh sách đơn"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** AC-ORD-069: trang `/orders` — capability hiệu lực để vào trang là `order.read` (spec §6, Q56). */
export function OrdersListPage() {
  usePageTitle("Danh sách đơn");
  const me = useMe();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const debouncedQ = useDebouncedValue(q, 300);

  const filters: OrderFilters = { q: debouncedQ, status, limit: PAGE_SIZE, offset };
  const orders = useOrders(filters);

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
  if (!("order.read" in me.data.capabilities)) return <ForbiddenPage />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-heading">Danh sách đơn</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Tìm kiếm"
          placeholder="Mã đơn, tên khách, số điện thoại…"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setOffset(0);
          }}
          trailing={
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted"
            >
              <Search className="size-4" />
            </span>
          }
        />
        <Select
          label="Trạng thái"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">Tất cả</option>
          {ORDER_STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
      </div>

      {orders.isPending ? (
        <Waiting />
      ) : orders.isError ? (
        <EmptyState icon={ShoppingBag} message="Không tải được danh sách." />
      ) : orders.data.items.length === 0 ? (
        <EmptyState icon={ShoppingBag} message="Không tìm thấy đơn nào." />
      ) : (
        <>
          <OrderList items={orders.data.items} />
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
