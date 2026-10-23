import { useMediaQuery } from "../../../lib/useMediaQuery";
import { formatCurrency } from "../../../lib/format";
import type { EmployeeRevenueRow } from "../employeeApi";

const PROFIT_TOOLTIP = "Một số dòng hàng chưa có giá vốn tại thời điểm tạo đơn.";

function Profit({ profit }: { profit: number | null }) {
  if (profit === null) {
    return <span title={PROFIT_TOOLTIP}>—</span>;
  }
  return <>{formatCurrency(profit)}</>;
}

/** AC-RPT-031, AC-RPT-034: bảng (desktop) / thẻ (mobile) — mỗi dòng là 1 nhân viên (M15-10a). */
export function EmployeeRevenueTable({
  rows,
  onSelect,
}: {
  rows: EmployeeRevenueRow[];
  onSelect: (row: EmployeeRevenueRow) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã NV", "Tên NV", "Số đơn", "Doanh thu", "Lợi nhuận"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.employee_id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 font-medium text-heading">{row.employee_code}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(row);
                  }}
                  className="min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  {row.employee_name}
                </button>
              </td>
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
        <li key={row.employee_id}>
          <button
            type="button"
            onClick={() => {
              onSelect(row);
            }}
            className="w-full rounded-2xl bg-card p-5 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-heading">{row.employee_name}</p>
              <span className="text-xs font-medium text-muted">{row.employee_code}</span>
            </div>
            <dl className="mt-2 space-y-1 text-sm text-body">
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
