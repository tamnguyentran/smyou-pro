const DATE_TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO timestamp (UTC) → `dd/MM/yyyy HH:mm` in Asia/Ho_Chi_Minh (UI_GUIDELINES §6, CLAUDE.md #6). */
export function formatDateTime(iso: string): string {
  const part = Object.fromEntries(
    DATE_TIME.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]),
  ) as Record<Intl.DateTimeFormatPartTypes, string>;
  return `${part.day}/${part.month}/${part.year} ${part.hour}:${part.minute}`;
}

const DATE_ONLY = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** ISO date (YYYY-MM-DD) → `dd/MM/yyyy` (UI_GUIDELINES §6, CLAUDE.md #6). */
export function formatDate(iso: string): string {
  const part = Object.fromEntries(
    DATE_ONLY.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]),
  ) as Record<Intl.DateTimeFormatPartTypes, string>;
  return `${part.day}/${part.month}/${part.year}`;
}

const CURRENCY = new Intl.NumberFormat("vi-VN");

/** VND integer → `12.500.000 ₫` (UI_GUIDELINES §6, CLAUDE.md #6: tiền là số nguyên VND). */
export function formatCurrency(amount: number): string {
  return `${CURRENCY.format(amount)} ₫`;
}

/** "0932068787" → "0932 06 8787" (spec §UI). Số chưa chuẩn hoá thì để nguyên. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return /^\d{10}$/.test(digits)
    ? `${digits.slice(0, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`
    : phone;
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("vi-VN", { numeric: "auto" });

/** ISO timestamp (UTC) → "5 phút trước" / "2 giờ trước" / ... (spec M7-01b §6). Quá 7 ngày → `formatDateTime`. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffSeconds) < 60) return "Vừa xong";
  if (Math.abs(diffMinutes) < 60) return RELATIVE_TIME.format(diffMinutes, "minute");
  if (Math.abs(diffHours) < 24) return RELATIVE_TIME.format(diffHours, "hour");
  if (Math.abs(diffDays) < 7) return RELATIVE_TIME.format(diffDays, "day");
  return formatDateTime(iso);
}

/** Địa chỉ thi công → link Google Maps mở tab mới. */
export function mapHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
