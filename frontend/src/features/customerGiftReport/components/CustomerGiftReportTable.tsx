import { useMediaQuery } from "../../../lib/useMediaQuery";
import { formatCurrency } from "../../../lib/format";
import type { CustomerGiftReportRow } from "../api";

/** AC-GFT-040, AC-GFT-041: bảng (desktop) / thẻ (mobile) — Mã KH, Tên KH, Người liên hệ, Số lần
 * tặng, Tổng chi phí; bấm 1 dòng mở drilldown. */
export function CustomerGiftReportTable({
  rows,
  onSelect,
}: {
  rows: CustomerGiftReportRow[];
  onSelect: (row: CustomerGiftReportRow) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã KH", "Tên KH", "Người liên hệ", "Số lần tặng", "Tổng chi phí"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.customer_id} className="hover:bg-sidebar-sub">
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
              <td className="px-4 py-3 text-body">{row.contact_person ?? "—"}</td>
              <td className="px-4 py-3 text-right text-body">{row.gift_count}</td>
              <td className="px-4 py-3 text-right text-body">{formatCurrency(row.total_cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.customer_id}>
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
            <p className="mt-1 text-sm text-body">{row.contact_person ?? "—"}</p>
            <dl className="mt-2 space-y-1 text-sm text-body">
              <div className="flex justify-between">
                <dt className="text-muted">Số lần tặng</dt>
                <dd>{row.gift_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Tổng chi phí</dt>
                <dd>{formatCurrency(row.total_cost)}</dd>
              </div>
            </dl>
          </button>
        </li>
      ))}
    </ul>
  );
}
