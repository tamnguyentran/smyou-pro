import { ORDER_STATUS_LABEL, ORDER_STATUS_ORDER } from "../../orders/orderStatus";
import type { Dashboard } from "../api";
import { StatTile } from "./StatTile";

type OrderSummary = NonNullable<Dashboard["order_summary"]>;

/** AC-DASH-001/007/008/010/014: 7 thẻ đếm đơn theo trạng thái (spec/state_machines.yaml#order.states). */
export function OrderSummarySection({ summary }: { summary: OrderSummary }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Đơn theo trạng thái</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {ORDER_STATUS_ORDER.map((status) => (
          <StatTile
            key={status}
            label={ORDER_STATUS_LABEL[status]}
            value={summary.counts_by_status[status]}
          />
        ))}
      </div>
    </section>
  );
}
