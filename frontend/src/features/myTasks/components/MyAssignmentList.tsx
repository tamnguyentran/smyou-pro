import { CalendarClock, MapPin, Phone, Timer } from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatPhone, mapHref } from "../../../lib/format";
import { cn } from "../../../lib/cn";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { MyAssignment } from "../api";

const URGENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isUrgent(dueAt: string, now: number): boolean {
  return new Date(dueAt).getTime() - now <= URGENT_WINDOW_MS;
}

function DueAt({ dueAt, now }: { dueAt: string; now: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        isUrgent(dueAt, now) ? "font-semibold text-urgent-fg" : "text-body",
      )}
    >
      <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
      {formatDateTime(dueAt)}
    </span>
  );
}

function CustomerLinks({ item }: { item: MyAssignment }) {
  return (
    <div className="flex flex-col gap-1">
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
    </div>
  );
}

/** AC-ASG-008…014: thẻ (mobile) / bảng (desktop ≥1024px), mẫu `CustomerList.tsx`. */
export function MyAssignmentList({ items }: { items: MyAssignment[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const [now] = useState(() => Date.now());

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã", "Tiêu đề", "Khách & địa chỉ", "Hạn chót", "Giờ ước tính"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.assignment_id}>
              <td className="px-4 py-3 font-medium text-heading">{item.task_code}</td>
              <td className="px-4 py-3 text-body">{item.task_title}</td>
              <td className="px-4 py-3">
                <CustomerLinks item={item} />
              </td>
              <td className="px-4 py-3">
                <DueAt dueAt={item.due_at} now={now} />
              </td>
              <td className="px-4 py-3 text-body">{item.estimated_hours} giờ</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.assignment_id}
          className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-heading">{item.task_code}</p>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Timer aria-hidden="true" className="size-3.5" />
              {item.estimated_hours} giờ
            </span>
          </div>
          <p className="text-sm text-body">{item.task_title}</p>
          <CustomerLinks item={item} />
          <DueAt dueAt={item.due_at} now={now} />
        </li>
      ))}
    </ul>
  );
}
