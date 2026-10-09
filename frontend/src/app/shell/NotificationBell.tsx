import { Bell } from "lucide-react";
import { Link } from "react-router";
import { useMe } from "../../features/me/api";

/** `undefined`/`0` → no badge; `>99` caps the display (spec §8). */
export function unreadBadgeLabel(count: number | undefined): string | null {
  if (!count) return null;
  return count > 99 ? "99+" : String(count);
}

/** Chuông thông báo dùng ở header desktop + mobile (UI_GUIDELINES dòng 55/59) — bấm điều hướng
 * thẳng `/thong-bao`, không có popover (spec §8). */
export function NotificationBell() {
  const me = useMe();
  const label = unreadBadgeLabel(me.data?.unread_notifications_count);
  return (
    <Link
      to="/thong-bao"
      aria-label={label ? `Thông báo, ${label} chưa đọc` : "Thông báo"}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-xl text-heading hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Bell aria-hidden="true" className="size-6" />
      {label ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 min-w-4 rounded-full bg-urgent-bg px-1 text-center text-[10px] font-semibold text-urgent-fg leading-4 tabular-nums"
        >
          {label}
        </span>
      ) : null}
    </Link>
  );
}
