import { useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "../../../lib/format";
import { addMonths, currentMonth, monthLabel } from "../../kpiTargets/month";
import { useMyKpiSales } from "../api";
import { Achievement, NetRevenue, Target } from "./KpiSalesFigures";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-right text-sm font-semibold text-heading">{children}</dd>
    </div>
  );
}

/** AC-RPT-096…098 (M21-02b): KPI doanh số của chính mình ở Thông tin tài khoản (`/me/kpi-sales`).
 * Đổi tháng bằng nút ‹ › — không ô nhập, để trang Cá nhân vẫn "chỉ xem" (AC-EMP-073). */
export function MyKpiSalesCard() {
  const titleId = useId();
  const [month, setMonth] = useState(() => currentMonth());
  const kpi = useMyKpiSales(month);

  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-2xl bg-card p-7 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-heading">
            KPI doanh số của tôi
          </h2>
          <p className="text-sm text-muted">Tháng {monthLabel(month)}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {(
            [
              ["Tháng trước", ChevronLeft, -1],
              ["Tháng sau", ChevronRight, 1],
            ] as const
          ).map(([label, Icon, step]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => {
                setMonth((current) => addMonths(current, step));
              }}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-card text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Icon aria-hidden="true" className="size-4" />
            </button>
          ))}
        </div>
      </div>
      {kpi.data ? (
        <dl className="divide-y divide-line">
          <Row label="Tổng doanh số">{formatCurrency(kpi.data.total_sales)}</Row>
          <Row label="Doanh thu thuần">
            <NetRevenue amount={kpi.data.net_revenue} />
          </Row>
          <Row label="Mục tiêu">
            <Target amount={kpi.data.target} />
          </Row>
          <Row label="Tỷ lệ đạt">
            <Achievement pct={kpi.data.achievement_pct} />
          </Row>
        </dl>
      ) : kpi.isError ? (
        <p className="text-sm text-body">Không tải được KPI doanh số.</p>
      ) : (
        <div aria-busy="true" className="h-40 animate-pulse rounded-xl bg-sidebar-sub" />
      )}
    </section>
  );
}
