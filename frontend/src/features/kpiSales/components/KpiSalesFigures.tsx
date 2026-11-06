import { formatCurrency } from "../../../lib/format";

const PERCENT = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** AC-RPT-090: `net_revenue=null` (thiếu giá vốn, M21-02a) → "—" kèm chú thích. */
export function NetRevenue({
  amount,
  missingCost,
}: {
  amount: number | null;
  missingCost?: boolean;
}) {
  return (
    <>
      <span>{amount === null ? "—" : formatCurrency(amount)}</span>
      {amount === null || missingCost ? (
        <span className="block text-xs font-normal text-muted">Thiếu giá vốn</span>
      ) : null}
    </>
  );
}

/** AC-RPT-090: chưa đặt chỉ tiêu → "Chưa đặt". */
export function Target({ amount }: { amount: number | null }) {
  return <>{amount === null ? "Chưa đặt" : formatCurrency(amount)}</>;
}

/** AC-RPT-089/090: `125,0%`; đạt (≥ 100) tô xanh; `null` → "—". */
export function Achievement({ pct }: { pct: number | null }) {
  if (pct === null) return <span>—</span>;
  return (
    <span className={pct >= 100 ? "font-semibold text-completed-fg" : undefined}>
      {`${PERCENT.format(pct)}%`}
    </span>
  );
}
