import { formatCurrency } from "../../../lib/format";
import type { Order } from "../api";

/** Section 3 (AC-ORD-031): grouped by VAT rate from the server's own per-line numbers — only summed
 * here, never re-derived, so the figures always match the last GET/POST response. */
export function OrderTotalsSection({ order }: { order: Order }) {
  const groups = new Map<string, { base: number; vat: number }>();
  for (const line of order.lines) {
    const rate = line.vat_rate;
    const base = line.line_total - line.line_vat;
    const current = groups.get(rate) ?? { base: 0, vat: 0 };
    groups.set(rate, { base: current.base + base, vat: current.vat + line.line_vat });
  }
  const groupedByRate = [...groups.entries()].sort(([a], [b]) => Number(a) - Number(b));

  return (
    <section
      data-testid="order-totals"
      className="space-y-2 rounded-2xl border border-line bg-card p-4"
    >
      {groupedByRate.map(([rate, group]) => (
        <p key={rate} className="tabular-nums text-sm text-body">
          Tiền hàng chịu VAT {Number(rate)}%: {formatCurrency(group.base)} · VAT {Number(rate)}%:{" "}
          {formatCurrency(group.vat)}
        </p>
      ))}
      <p className="tabular-nums text-base font-semibold text-heading">
        Tổng cộng: {formatCurrency(order.total)}
      </p>
    </section>
  );
}
