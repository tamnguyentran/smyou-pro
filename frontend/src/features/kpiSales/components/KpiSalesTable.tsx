import type { ReactNode } from "react";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { formatCurrency } from "../../../lib/format";
import type { KpiSalesRow, KpiSalesTotals } from "../api";
import { Achievement, NetRevenue, Target } from "./KpiSalesFigures";

const HEADINGS = [
  "STT",
  "Mã NV",
  "Họ tên",
  "Tổng doanh số",
  "Doanh thu thuần",
  "Mục tiêu",
  "Tỷ lệ đạt (%)",
];

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold text-heading">{children}</dd>
    </div>
  );
}

/** AC-RPT-089/090/094: bảng (desktop) / thẻ 2×2 (mobile), dòng "Tổng cộng" cuối — có Tỷ lệ đạt
 * do server tính trên tổng (UAT-05 AC-RPT-172). */
export function KpiSalesTable({ rows, totals }: { rows: KpiSalesRow[]; totals: KpiSalesTotals }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {HEADINGS.map((heading, index) => (
              <th
                key={heading}
                scope="col"
                className={`px-4 py-3 ${index > 2 ? "text-right" : ""}`}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.employee_id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 text-body">{row.stt}</td>
              <td className="px-4 py-3 font-medium text-heading">{row.employee_code}</td>
              <td className="px-4 py-3 font-semibold text-heading">{row.employee_name}</td>
              <td className="px-4 py-3 text-right text-body">{formatCurrency(row.total_sales)}</td>
              <td className="px-4 py-3 text-right text-body">
                <NetRevenue amount={row.net_revenue} />
              </td>
              <td className="px-4 py-3 text-right text-body">
                <Target amount={row.target} />
              </td>
              <td className="px-4 py-3 text-right text-body">
                <Achievement pct={row.achievement_pct} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-line bg-sidebar-sub font-semibold text-heading">
          <tr>
            <td colSpan={3} className="px-4 py-3">
              Tổng cộng
            </td>
            <td className="px-4 py-3 text-right">{formatCurrency(totals.total_sales)}</td>
            <td className="px-4 py-3 text-right">
              <NetRevenue amount={totals.net_revenue} missingCost={totals.has_missing_cost} />
            </td>
            <td className="px-4 py-3 text-right">{formatCurrency(totals.target)}</td>
            <td className="px-4 py-3 text-right">
              <Achievement pct={totals.achievement_pct} />
            </td>
          </tr>
        </tfoot>
      </table>
    );
  }

  return (
    <div className="space-y-3">
      <ul aria-label="Báo cáo KPI theo nhân viên" className="space-y-3">
        {rows.map((row) => (
          <li key={row.employee_id} className="rounded-2xl bg-card p-5 shadow-card">
            <p className="font-semibold break-words text-heading">
              <span className="text-muted">{row.stt}</span> · {row.employee_code} ·{" "}
              {row.employee_name}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Figure label="Tổng doanh số">{formatCurrency(row.total_sales)}</Figure>
              <Figure label="Doanh thu thuần">
                <NetRevenue amount={row.net_revenue} />
              </Figure>
              <Figure label="Mục tiêu">
                <Target amount={row.target} />
              </Figure>
              <Figure label="Tỷ lệ đạt">
                <Achievement pct={row.achievement_pct} />
              </Figure>
            </dl>
          </li>
        ))}
      </ul>
      <section aria-label="Tổng cộng" className="rounded-2xl bg-sidebar-sub p-5">
        <p className="font-semibold text-heading">Tổng cộng</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Figure label="Tổng doanh số">{formatCurrency(totals.total_sales)}</Figure>
          <Figure label="Doanh thu thuần">
            <NetRevenue amount={totals.net_revenue} missingCost={totals.has_missing_cost} />
          </Figure>
          <Figure label="Mục tiêu">{formatCurrency(totals.target)}</Figure>
          <Figure label="Tỷ lệ đạt">
            <Achievement pct={totals.achievement_pct} />
          </Figure>
        </dl>
      </section>
    </div>
  );
}
