import { monthLabel } from "../kpiTargets/month";

const DECIMAL = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const PERCENT = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** VND → axis tick: 3_700_000 → "3,7 tr", 2_500_000_000 → "2,5 tỷ" (spec §6). */
export function shortMoney(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${DECIMAL.format(amount / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${DECIMAL.format(amount / 1_000_000)} tr`;
  if (abs >= 1_000) return `${DECIMAL.format(amount / 1_000)} k`;
  return DECIMAL.format(amount);
}

/** 80 → "80,0%". */
export function formatPercent(value: number): string {
  return `${PERCENT.format(value)}%`;
}

/** 5.5 → "5,5" (quantities and hours). */
export function formatDecimal(value: number): string {
  return DECIMAL.format(value);
}

/** "2026-10" → "T10/2026". */
export function monthTick(month: string): string {
  const [year, mon] = month.split("-");
  return `T${String(Number(mon))}/${year ?? ""}`;
}

/** { from: "2026-09", to: "2026-10" } → "09/2026–10/2026" (chart aria-labels). */
export function periodLabel(period: { from: string; to: string }): string {
  return `${monthLabel(period.from)}–${monthLabel(period.to)}`;
}
