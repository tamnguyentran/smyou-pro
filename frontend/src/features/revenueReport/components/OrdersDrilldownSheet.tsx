import { useState } from "react";
import { Inbox } from "lucide-react";
import { Sheet } from "../../../components/ui/Sheet";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";
import { formatCurrency } from "../../../lib/format";
import { formatDate } from "../../../lib/format";
import { useCustomerOrders, type RevenueFilters, type RevenueOrder } from "../api";
import { OrderLinesDrilldownSheet } from "./OrderLinesDrilldownSheet";

/** AC-RPT-011, AC-RPT-012: drilldown cấp 1 — đơn của đúng cặp (khách hàng × người bán) đã bấm. */
export function OrdersDrilldownSheet({
  customerId,
  customerName,
  sellerId,
  sellerName,
  filters,
  onClose,
}: {
  customerId: string;
  customerName: string;
  sellerId: string;
  sellerName: string;
  filters: Pick<RevenueFilters, "from" | "to" | "status">;
  onClose: () => void;
}) {
  const [selectedOrder, setSelectedOrder] = useState<RevenueOrder | null>(null);
  const orders = useCustomerOrders(customerId, sellerId, filters);

  return (
    <>
      <Sheet open title={`${customerName} — Người bán: ${sellerName}`} onClose={onClose}>
        {orders.isPending ? (
          <p className="py-8 text-center text-sm text-muted">Đang tải…</p>
        ) : orders.isError ? (
          <EmptyState
            icon={Inbox}
            message="Không tải được danh sách đơn."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void orders.refetch();
                }}
              >
                Tải lại
              </Button>
            }
          />
        ) : orders.data.length === 0 ? (
          <EmptyState icon={Inbox} message="Không có đơn phù hợp." />
        ) : (
          <ul className="divide-y divide-line">
            {orders.data.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrder(order);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <span>
                    <span className="font-semibold text-heading">{order.code}</span>
                    <span className="block text-xs text-muted">
                      {formatDate(order.completed_at ?? order.created_at)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-heading">
                    {formatCurrency(order.total)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      {selectedOrder ? (
        <OrderLinesDrilldownSheet
          orderId={selectedOrder.id}
          orderCode={selectedOrder.code}
          onClose={() => {
            setSelectedOrder(null);
          }}
        />
      ) : null}
    </>
  );
}
