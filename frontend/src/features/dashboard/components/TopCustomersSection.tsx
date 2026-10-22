import { formatCurrency } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { Dashboard } from "../api";

type TopCustomer = NonNullable<Dashboard["top_customers"]>[number];

/** AC-DASH-054/055/058/059 (M15-04): Top 10 khách hàng doanh thu cao nhất tháng này (sắp giảm
 * dần, không đệm cho đủ 10). Bảng trên desktop, thẻ trên mobile — cùng idiom `OrderList.tsx`. */
export function TopCustomersSection({ items }: { items: TopCustomer[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Top 10 khách hàng (tháng này)</h2>
      {desktop ? (
        <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
          <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
            <tr>
              {["Mã KH", "Tên", "Số đơn", "Doanh thu"].map((heading) => (
                <th key={heading} scope="col" className="px-4 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((row) => (
              <tr key={row.customer_id}>
                <td className="px-4 py-3 font-semibold text-heading">{row.customer_code}</td>
                <td className="px-4 py-3 text-body">{row.customer_name}</td>
                <td className="px-4 py-3 tabular-nums text-body">{row.order_count}</td>
                <td className="px-4 py-3 tabular-nums text-body">
                  {formatCurrency(row.total_revenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {items.map((row) => (
            <li
              key={row.customer_id}
              className="flex flex-col gap-1 rounded-2xl bg-card p-5 shadow-card"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-semibold text-heading">{row.customer_code}</span>
                <span className="text-sm text-body">{row.order_count} đơn</span>
              </div>
              <p className="text-sm text-body">{row.customer_name}</p>
              <p className="text-sm font-medium text-heading">
                {formatCurrency(row.total_revenue)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
