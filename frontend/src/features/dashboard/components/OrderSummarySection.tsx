import { ORDER_STATUS_LABEL, ORDER_STATUS_ORDER } from "../../orders/orderStatus";
import type { Dashboard } from "../api";
import { StatTile } from "./StatTile";

type OrderSummary = NonNullable<Dashboard["order_summary"]>;

/** AC-DASH-001/007/008/010/014: 7 thẻ đếm đơn theo trạng thái (spec/state_machines.yaml#order.states).
 * AC-DASH-022/023/026 (M10-03): mỗi thẻ drill-down tới `/orders` đã lọc sẵn; thêm `&mine=1` khi
 * `summary.scope === "own"` để danh sách khớp đúng số đã đếm (Q82). */
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
            to={`/orders?status=${status}${summary.scope === "own" ? "&mine=1" : ""}`}
          />
        ))}
        <StatTile
          label="Quá hạn"
          value={summary.overdue_count}
          tone="urgent"
          to={`/orders?overdue=true${summary.scope === "own" ? "&mine=1" : ""}`}
        />
      </div>
    </section>
  );
}
