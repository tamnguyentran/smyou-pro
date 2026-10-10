/** §3 (spec UI): nhãn ngắn cho cột/thẻ lý do từ chối, theo đúng thứ tự hiển thị. */
export const REJECTION_REASON_ORDER = ["BUSY", "SICK", "SKILL", "DISTANCE", "OTHER"] as const;

export const REJECTION_REASON_LABELS: Record<(typeof REJECTION_REASON_ORDER)[number], string> = {
  BUSY: "Bận",
  SICK: "Ốm",
  SKILL: "Không đúng CM",
  DISTANCE: "Xa",
  OTHER: "Khác",
};

/** AC-KPI-019: `on_time_rate=null` (không có task xong) → "—", không hiện "0/0 · 0%" gây hiểu lầm. */
export function formatOnTime(onTimeCount: number, completedCount: number): string {
  if (completedCount === 0) return "—";
  const percent = Math.round((onTimeCount / completedCount) * 100);
  return `${String(onTimeCount)}/${String(completedCount)} · ${String(percent)}%`;
}

export function formatHoursPair(estimated: string, actual: string): string {
  return `${String(Number(estimated))} / ${String(Number(actual))}`;
}
