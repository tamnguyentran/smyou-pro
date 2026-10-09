import { CalendarClock, MapPin, Phone } from "lucide-react";
import { formatDateTime, formatPhone, mapHref } from "../../../lib/format";
import { cn } from "../../../lib/cn";
import type { Dashboard } from "../api";

type TodayTask = NonNullable<Dashboard["today_tasks"]>[number];

/** AC-DASH-005/013: 1 thẻ việc hôm nay (đọc, không có hành động) — hạn chót quá hạn tô đỏ. */
export function TodayTaskCard({ item, now }: { item: TodayTask; now: number }) {
  const overdue = new Date(item.due_at).getTime() < now;
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-heading">{item.task_code}</p>
        <span className="text-xs text-muted">{item.estimated_hours} giờ</span>
      </div>
      <p className="text-sm text-body">{item.task_title}</p>
      <p className="font-medium text-heading">{item.customer_name ?? "Khách lẻ"}</p>
      {item.service_address ? (
        <a
          href={mapHref(item.service_address)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-brand underline-offset-2 hover:underline"
        >
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          {item.service_address}
        </a>
      ) : null}
      {item.customer_phone ? (
        <a
          href={`tel:${item.customer_phone}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-brand underline-offset-2 hover:underline"
        >
          <Phone aria-hidden="true" className="size-4 shrink-0" />
          {formatPhone(item.customer_phone)}
        </a>
      ) : null}
      <span
        className={cn(
          "inline-flex items-center gap-1.5",
          overdue ? "font-semibold text-urgent-fg" : "text-body",
        )}
      >
        <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
        {formatDateTime(item.due_at)}
      </span>
    </li>
  );
}
