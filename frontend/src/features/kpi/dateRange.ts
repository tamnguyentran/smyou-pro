const VN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

/** `YYYY-MM-DD` hôm nay theo giờ Việt Nam. */
export function vnToday(now: Date = new Date()): string {
  return VN_DAY.format(now);
}

/** AC-KPI-016: mặc định 30 ngày gần nhất tính tới hôm nay (giờ VN), bao gồm cả 2 đầu. */
export function defaultKpiRange(now: Date = new Date()): { from: string; to: string } {
  const to = vnToday(now);
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to };
}
