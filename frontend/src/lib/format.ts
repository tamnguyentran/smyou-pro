const DATE_TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  dateStyle: "short",
  timeStyle: "short",
});

/** ISO timestamp (UTC) → Vietnamese short date+time in Asia/Ho_Chi_Minh (CLAUDE.md #6). */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
