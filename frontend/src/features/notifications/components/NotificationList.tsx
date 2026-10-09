import {
  BadgeCheck,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  ShoppingBag,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { formatDateTime } from "../../../lib/format";
import { useMarkRead, type Notification } from "../api";

// UI_GUIDELINES §7 icon glossary; type tên theo M7-01a §3. Loại lạ (không nên xảy ra) → `Bell`.
const TYPE_ICONS: Record<string, LucideIcon> = {
  ORDER_SUBMITTED: ShoppingBag,
  ORDER_AWAITING_CONFIRMATION: BadgeCheck,
  ORDER_COMPLETED: BadgeCheck,
  ORDER_REVISION_REQUESTED: RotateCcw,
  TASK_ASSIGNED: ClipboardCheck,
  TASK_UPDATED: Wrench,
  TASK_REOPENED: RotateCcw,
  TASK_CANCELLED: XCircle,
  ASSIGNMENT_REJECTED: XCircle,
  ASSIGNMENT_DONE: CheckCircle2,
  ASSIGNMENT_REMOVED: XCircle,
};

function Row({ item }: { item: Notification }) {
  const markRead = useMarkRead();
  const unread = item.read_at === null;
  return (
    <li className={unread ? "bg-brand-light/30" : undefined}>
      <Link
        to={`/orders/${item.entity_id}`}
        onClick={() => {
          if (unread) markRead.mutate(item.id);
        }}
        className="flex min-h-11 gap-3 rounded-xl p-3 transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        data-unread={unread}
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand"
        >
          {(() => {
            const Icon = TYPE_ICONS[item.type] ?? Bell;
            return <Icon className="size-5" />;
          })()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {unread ? (
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand" />
            ) : null}
            <span className="truncate text-sm font-semibold text-heading">{item.title}</span>
          </span>
          <span className="block text-sm text-body">{item.body}</span>
          <span className="block text-xs text-muted">{formatDateTime(item.created_at)}</span>
        </span>
      </Link>
    </li>
  );
}

/** Danh sách thông báo (spec §6) — chưa đọc có chấm + nền nhạt hơn, thứ tự giữ nguyên từ server. */
export function NotificationList({ items }: { items: Notification[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </ul>
  );
}
