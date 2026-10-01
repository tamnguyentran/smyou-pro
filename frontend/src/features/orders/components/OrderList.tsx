import { Badge } from "../../../components/ui/Badge";
import { formatCurrency, formatDate } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { useNavigate } from "react-router";
import type { OrderSummary } from "../api";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderStatus } from "../orderStatus";

const CODE_BUTTON =
  "min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** AC-ORD-069: table on desktop, cards on mobile — same idiom as CustomerList. */
export function OrderList({ items }: { items: OrderSummary[] }) {
  const navigate = useNavigate();
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  function open(order: OrderSummary) {
    void navigate(`/orders/${order.id}`);
  }

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã", "Khách", "Trạng thái", "Tổng tiền", "Ngày hẹn", "Người tạo"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((order) => {
            const status = order.status as OrderStatus;
            return (
              <tr
                key={order.id}
                className="cursor-pointer hover:bg-sidebar-sub"
                onClick={() => {
                  open(order);
                }}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      open(order);
                    }}
                    className={CODE_BUTTON}
                  >
                    {order.code}
                  </button>
                </td>
                <td className="px-4 py-3 text-body">{order.customer_name ?? "Khách lẻ"}</td>
                <td className="px-4 py-3">
                  <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
                </td>
                <td className="px-4 py-3 tabular-nums text-body">{formatCurrency(order.total)}</td>
                <td className="px-4 py-3 text-body">
                  {order.requested_date ? formatDate(order.requested_date) : "—"}
                </td>
                <td className="px-4 py-3 text-body">{order.created_by_name ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((order) => {
        const status = order.status as OrderStatus;
        return (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => {
                open(order);
              }}
              className="flex w-full flex-col items-start gap-1 rounded-2xl border border-line bg-card p-4 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-semibold text-heading">{order.code}</span>
                <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
              </div>
              <p className="text-sm text-body">{order.customer_name ?? "Khách lẻ"}</p>
              <p className="text-sm font-medium text-heading">{formatCurrency(order.total)}</p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
