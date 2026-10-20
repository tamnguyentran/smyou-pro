const VN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

/** `YYYY-MM-DD` hôm nay theo giờ Việt Nam. */
export function vnToday(now: Date = new Date()): string {
  return VN_DAY.format(now);
}

/** Mặc định dùng chung cho các trang tra cứu có khoảng ngày: đầu tháng hiện tại → hôm nay
 * (giờ VN). Quyết định 2026-10-20 — thay cho các mặc định rời rạc trước đó (để trống, hoặc
 * "30 ngày gần nhất" ở KPI). */
export function defaultMonthToDateRange(now: Date = new Date()): { from: string; to: string } {
  const to = vnToday(now);
  return { from: `${to.slice(0, 7)}-01`, to };
}
