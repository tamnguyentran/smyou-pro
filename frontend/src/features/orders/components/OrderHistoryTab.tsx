import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { formatDateTime } from "../../../lib/format";
import { History } from "lucide-react";
import { useOrderHistory, type AuditEventOut } from "../api";
import {
  COMMAND_LABELS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  type OrderStatus,
} from "../orderStatus";

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span>—</span>;
  const known = status in ORDER_STATUS_LABEL ? (status as OrderStatus) : undefined;
  return (
    <Badge tone={known ? ORDER_STATUS_TONE[known] : "neutral"}>
      {known ? ORDER_STATUS_LABEL[known] : status}
    </Badge>
  );
}

function Transition({ event }: { event: AuditEventOut }) {
  if (!event.from_status && !event.to_status) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-sm text-body">
      <StatusBadge status={event.from_status} />
      <span aria-hidden="true">→</span>
      <span className="sr-only">thành</span>
      <StatusBadge status={event.to_status} />
    </span>
  );
}

/** Tab "Lịch sử" (AC-ORD-067): timeline dọc, mới nhất trước — `GET /orders/{id}/history` đã trả
 * theo thứ tự này (không cần sắp lại), API chỉ ghi audit cho các lệnh order.* nên không cần phân
 * trang ở item này. */
export function OrderHistoryTab({ orderId }: { orderId: string }) {
  const history = useOrderHistory(orderId);

  if (history.isPending) {
    return (
      <div
        role="group"
        aria-busy="true"
        aria-label="Đang tải lịch sử"
        className="h-32 animate-pulse rounded-2xl bg-sidebar-sub"
      />
    );
  }
  if (history.isError || history.data.items.length === 0) {
    return <EmptyState icon={History} message="Chưa có lịch sử thay đổi." />;
  }

  return (
    <ul aria-label="Lịch sử đơn" className="space-y-3">
      {history.data.items.map((event) => (
        <li key={event.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="neutral">{COMMAND_LABELS[event.action] ?? event.action}</Badge>
            <span className="text-xs font-medium text-muted">
              {formatDateTime(event.occurred_at)}
            </span>
          </div>
          <div className="mt-1">
            <Transition event={event} />
          </div>
          <p className="mt-1 text-sm text-body">{event.actor?.full_name ?? "Hệ thống"}</p>
        </li>
      ))}
    </ul>
  );
}
