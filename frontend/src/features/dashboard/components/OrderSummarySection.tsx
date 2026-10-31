import { useState } from "react";
import { ORDER_STATUS_LABEL, ORDER_STATUS_ORDER } from "../../orders/orderStatus";
import type { Dashboard } from "../api";
import { CardDetailDialog, type OpenCard } from "./CardDetailDialog";
import { StatTile } from "./StatTile";

type OrderSummary = NonNullable<Dashboard["order_summary"]>;

/** AC-DASH-001/007/008/010/014: 7 thẻ đếm đơn theo trạng thái (spec/state_machines.yaml#order.states)
 * + "Quá hạn". M18-01a (AC-DASH-077/084): bấm thẻ mở popup danh sách chi tiết (`order.<STATUS>` /
 * `order.overdue`), không chuyển trang; server tự áp scope own/all như khi đếm. */
export function OrderSummarySection({ summary }: { summary: OrderSummary }) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Đơn theo trạng thái</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {ORDER_STATUS_ORDER.map((status) => (
          <StatTile
            key={status}
            label={ORDER_STATUS_LABEL[status]}
            value={summary.counts_by_status[status]}
            onClick={() => {
              setOpen({ card: `order.${status}`, label: ORDER_STATUS_LABEL[status] });
            }}
          />
        ))}
        <StatTile
          label="Quá hạn"
          value={summary.overdue_count}
          tone="urgent"
          onClick={() => {
            setOpen({ card: "order.overdue", label: "Quá hạn" });
          }}
        />
      </div>
      <CardDetailDialog
        open={open}
        onClose={() => {
          setOpen(null);
        }}
      />
    </section>
  );
}
