import { useMediaQuery } from "../../../lib/useMediaQuery";
import { formatCurrency } from "../../../lib/format";
import type { RevenueRow } from "../api";

const PROFIT_TOOLTIP = "Một số dòng hàng chưa có giá vốn tại thời điểm tạo đơn.";

function Profit({ profit }: { profit: number | null }) {
  if (profit === null) {
    return <span title={PROFIT_TOOLTIP}>—</span>;
  }
  return <>{formatCurrency(profit)}</>;
}

function rowKey(row: RevenueRow): string {
  return `${row.customer_id}:${row.seller?.id ?? "unassigned"}`;
}

function sellerLabel(row: RevenueRow): string {
  return row.seller ? `${row.seller.full_name} (${row.seller.code})` : "Chưa gán";
}

/** AC-RPT-011, AC-RPT-013, AC-RPT-015: bảng (desktop) / thẻ (mobile) — mỗi dòng là 1 cặp
 * (khách hàng × người bán) theo đúng API trả (Q88/Q96). */
export function RevenueTable({
  rows,
  onSelect,
}: {
  rows: RevenueRow[];
  onSelect: (row: RevenueRow) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã KH", "Tên KH", "Liên hệ", "Người bán", "Số đơn", "Doanh thu", "Lợi nhuận"].map(
              (heading) => (
                <th key={heading} scope="col" className="px-4 py-3">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 font-medium text-heading">{row.customer_code}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(row);
                  }}
                  className="min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  {row.customer_name}
                </button>
              </td>
              <td className="px-4 py-3 text-body">
                {row.contact_person ? `${row.contact_person} · ` : ""}
                {row.contact_phone}
              </td>
              <td className="px-4 py-3 text-body">{sellerLabel(row)}</td>
              <td className="px-4 py-3 text-right text-body">{row.order_count}</td>
              <td className="px-4 py-3 text-right text-body">
                {formatCurrency(row.subtotal_revenue)}
              </td>
              <td className="px-4 py-3 text-right text-body">
                <Profit profit={row.profit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={rowKey(row)}>
          <button
            type="button"
            onClick={() => {
              onSelect(row);
            }}
            className="w-full rounded-2xl bg-card p-5 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-heading">{row.customer_name}</p>
              <span className="text-xs font-medium text-muted">{row.customer_code}</span>
            </div>
            <p className="mt-1 text-sm text-body">
              {row.contact_person ? `${row.contact_person} · ` : ""}
              {row.contact_phone}
            </p>
            <dl className="mt-2 space-y-1 text-sm text-body">
              <div className="flex justify-between">
                <dt className="text-muted">Người bán</dt>
                <dd>{sellerLabel(row)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Số đơn</dt>
                <dd>{row.order_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Doanh thu</dt>
                <dd>{formatCurrency(row.subtotal_revenue)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Lợi nhuận</dt>
                <dd>
                  <Profit profit={row.profit} />
                </dd>
              </div>
            </dl>
          </button>
        </li>
      ))}
    </ul>
  );
}
