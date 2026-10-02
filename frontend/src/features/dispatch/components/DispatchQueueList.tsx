import { Badge } from "../../../components/ui/Badge";
import { formatCurrency, formatDate } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { OrderSummary } from "../../orders/api";
import { PRIORITY_LABELS, type Priority } from "../../orders/schemas";
import { PRIORITY_TONE } from "../schemas";

const CODE_BUTTON =
  "min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** AC-DSP-015/016: bảng trên desktop, thẻ trên mobile — thứ tự giữ nguyên như API trả về
 * (`sort=dispatch`: ưu tiên rồi ngày hẹn), client không bao giờ tự sắp lại. */
export function DispatchQueueList({
  items,
  onSelect,
}: {
  items: OrderSummary[];
  onSelect: (order: OrderSummary) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã", "Khách", "Ưu tiên", "Ngày hẹn", "Tổng tiền", "Người tạo"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((order) => (
            <tr
              key={order.id}
              className="cursor-pointer hover:bg-sidebar-sub"
              onClick={() => {
                onSelect(order);
              }}
            >
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(order);
                  }}
                  className={CODE_BUTTON}
                >
                  {order.code}
                </button>
              </td>
              <td className="px-4 py-3 text-body">{order.customer_name ?? "Khách lẻ"}</td>
              <td className="px-4 py-3">
                <Badge tone={PRIORITY_TONE[order.priority as Priority]}>
                  {PRIORITY_LABELS[order.priority as Priority]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-body">
                {order.requested_date ? formatDate(order.requested_date) : "—"}
              </td>
              <td className="px-4 py-3 text-body tabular-nums">{formatCurrency(order.total)}</td>
              <td className="px-4 py-3 text-body">{order.created_by_name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((order) => (
        <li key={order.id}>
          <button
            type="button"
            onClick={() => {
              onSelect(order);
            }}
            className="flex min-h-11 w-full flex-col items-start gap-1 rounded-2xl border border-line bg-card p-4 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="font-semibold text-heading">{order.code}</span>
              <Badge tone={PRIORITY_TONE[order.priority as Priority]}>
                {PRIORITY_LABELS[order.priority as Priority]}
              </Badge>
            </div>
            <p className="text-sm text-body">{order.customer_name ?? "Khách lẻ"}</p>
            <p className="text-sm text-body">
              {order.requested_date ? formatDate(order.requested_date) : "—"}
            </p>
            <p className="text-sm font-medium text-heading">{formatCurrency(order.total)}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
