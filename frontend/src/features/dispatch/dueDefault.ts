/** M28-02 (Q194): hạn hoàn thành mặc định khi giao việc — cộng số giờ ước tính vào "bây giờ", chỉ
 * trong giờ làm việc giờ VN: Thứ 2–Thứ 7, 08:00–12:00 và 13:00–17:00. Điểm bắt đầu làm tròn lên
 * bội 15 phút. Trả chuỗi `yyyy-MM-ddTHH:mm` (giờ tường VN) như ô "Hạn hoàn thành". */

const VN_OFFSET_MS = 7 * 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;
const STEP_MINUTES = 15;
/** Khung làm việc trong ngày, tính bằng phút từ 00:00. */
const WINDOWS: readonly (readonly [number, number])[] = [
  [8 * 60, 12 * 60],
  [13 * 60, 17 * 60],
];
const SUNDAY = 0;

export function defaultDueAt(now: Date, hours: number): string {
  if (!(hours > 0)) throw new RangeError("defaultDueAt needs a positive number of hours");
  // Giờ tường VN biểu diễn như "UTC" để dùng getUTC* — VN không có giờ mùa hè, lệch cố định +7.
  let minutes = Math.ceil((now.getTime() + VN_OFFSET_MS) / MINUTE_MS / STEP_MINUTES) * STEP_MINUTES;
  let remaining = Math.round(hours * 60);

  for (;;) {
    const dayStart = Math.floor(minutes / DAY_MINUTES) * DAY_MINUTES;
    const weekday = new Date(dayStart * MINUTE_MS).getUTCDay();
    const window =
      weekday === SUNDAY ? undefined : WINDOWS.find(([, end]) => minutes - dayStart < end);
    if (!window) {
      minutes = dayStart + DAY_MINUTES + (WINDOWS[0]?.[0] ?? 0);
      continue;
    }
    const [start, end] = window;
    minutes = Math.max(minutes, dayStart + start);
    const available = dayStart + end - minutes;
    if (remaining <= available) return format(minutes + remaining);
    remaining -= available;
    minutes = dayStart + end;
  }
}

function format(wallMinutes: number): string {
  return new Date(wallMinutes * MINUTE_MS).toISOString().slice(0, 16);
}
