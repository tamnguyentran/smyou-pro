import { Badge } from "../../../components/ui/Badge";
import { formatDateTime } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { AuditEventOut } from "../api";
import { ACTION_LABELS, BUSINESS_AREA_LABELS, ENTITY_TYPE_LABELS } from "../labels";

// Same labels and tones as the employees list (EmployeeList StatusBadges).
const STATUS: Record<string, { label: string; tone: "completed" | "todo" }> = {
  ACTIVE: { label: "Đang hoạt động", tone: "completed" },
  INACTIVE: { label: "Đã khoá", tone: "todo" },
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** M21-04: "Đơn hàng DH2611-0003" — the label comes from the API; type only when it can't be found. */
function entityText(event: AuditEventOut): string {
  const type = ENTITY_TYPE_LABELS[event.entity_type] ?? event.entity_type;
  return event.entity_label ? `${type} ${event.entity_label}` : type;
}

function areaLabel(event: AuditEventOut): string {
  return BUSINESS_AREA_LABELS[event.business_area];
}

function ActorText({ actor }: { actor: AuditEventOut["actor"] }) {
  if (!actor) return <span>Hệ thống</span>;
  return (
    <span>
      {actor.full_name} <span className="text-xs font-medium text-body">({actor.code})</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span>—</span>;
  const known = STATUS[status];
  return <Badge tone={known?.tone ?? "neutral"}>{known?.label ?? status}</Badge>;
}

function Transition({ event }: { event: AuditEventOut }) {
  if (!event.from_status && !event.to_status) return <span>—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusBadge status={event.from_status} />
      <span aria-hidden="true">→</span>
      <span className="sr-only">thành</span>
      <StatusBadge status={event.to_status} />
    </span>
  );
}

/** AC-SYS-072/073: table on desktop, cards on mobile — same data as the employees list pattern. */
export function AuditEventList({ items }: { items: AuditEventOut[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <div className="overflow-x-auto">
        <table
          aria-label="Nhật ký hệ thống"
          className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm shadow-card"
        >
          <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
            <tr>
              {[
                "Thời gian",
                "Nghiệp vụ",
                "Người thực hiện",
                "Đối tượng",
                "Hành động",
                "Trước → Sau",
              ].map((heading) => (
                <th key={heading} scope="col" className="px-4 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((event) => (
              <tr key={event.id} className="hover:bg-sidebar-sub">
                <td className="px-4 py-3 whitespace-nowrap text-body">
                  {formatDateTime(event.occurred_at)}
                </td>
                <td className="px-4 py-3 text-body">{areaLabel(event)}</td>
                <td className="px-4 py-3 text-body">
                  <ActorText actor={event.actor} />
                </td>
                <td className="px-4 py-3 text-body">{entityText(event)}</td>
                <td className="px-4 py-3">
                  <Badge tone="neutral">{actionLabel(event.action)}</Badge>
                </td>
                <td className="px-4 py-3 text-body">
                  <Transition event={event} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ul aria-label="Nhật ký hệ thống" className="space-y-3">
      {items.map((event) => (
        <li key={event.id} className="rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="in_progress">{areaLabel(event)}</Badge>
            <span className="text-xs font-medium text-muted">
              {formatDateTime(event.occurred_at)}
            </span>
          </div>
          <div className="mt-2">
            <Badge tone="neutral">{actionLabel(event.action)}</Badge>
          </div>
          <p className="mt-2 text-sm font-semibold text-heading">{entityText(event)}</p>
          {event.from_status || event.to_status ? (
            <div className="mt-1 text-sm text-body">
              <Transition event={event} />
            </div>
          ) : null}
          <p className="mt-1 text-sm text-body">
            <ActorText actor={event.actor} />
          </p>
        </li>
      ))}
    </ul>
  );
}
