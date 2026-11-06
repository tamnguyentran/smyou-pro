import { vnToday } from "../../lib/dateRange";

/** `YYYY-MM` of the current month, Vietnam time. */
export function currentMonth(now: Date = new Date()): string {
  return vnToday(now).slice(0, 7);
}

/** "2026-11" + 2 → "2027-01". */
export function addMonths(month: string, count: number): string {
  const [year, mon] = month.split("-").map(Number);
  const index = (year ?? 0) * 12 + (mon ?? 1) - 1 + count;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "2026-11" → "11/2026". */
export function monthLabel(month: string): string {
  const [year, mon] = month.split("-");
  return `${mon ?? ""}/${year ?? ""}`;
}
