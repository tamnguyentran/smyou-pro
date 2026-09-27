import { Badge } from "../../../components/ui/Badge";
import { formatDateTime } from "../../../lib/format";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { AuditEventOut } from "../api";

const ACTION_LABELS: Record<string, string> = {
  create: "Tạo",
  update: "Cập nhật",
  roles: "Đổi vai trò",
  deactivate: "Khoá",
  activate: "Mở khoá",
  "reset-password": "Cấp lại mật khẩu",
  login: "Đăng nhập",
  login_failed: "Đăng nhập sai",
  login_refused: "Từ chối đăng nhập",
  account_locked: "Tạm khoá",
  password_changed: "Đổi mật khẩu",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  EMPLOYEE: "Nhân viên",
};

// Same labels and tones as the employees list (EmployeeList StatusBadges).
const STATUS: Record<string, { label: string; tone: "completed" | "todo" }> = {
  ACTIVE: { label: "Đang hoạt động", tone: "completed" },
  INACTIVE: { label: "Đã khoá", tone: "todo" },
};

/** entity_id → "Name (CODE)" for the entities the page could look up (spec §6: "nếu tra được"). */
export type EntityNames = ReadonlyMap<string, string>;

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function entityText(event: AuditEventOut, names: EntityNames): string {
  const type = ENTITY_TYPE_LABELS[event.entity_type] ?? event.entity_type;
  const name = names.get(event.entity_id);
  return name ? `${type} · ${name}` : type;
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
export function AuditEventList({ items, names }: { items: AuditEventOut[]; names: EntityNames }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table
        aria-label="Nhật ký hệ thống"
        className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm shadow-card"
      >
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Thời gian", "Người thực hiện", "Đối tượng", "Hành động", "Trước → Sau"].map(
              (heading) => (
                <th key={heading} scope="col" className="px-4 py-3">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((event) => (
            <tr key={event.id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 whitespace-nowrap text-body">
                {formatDateTime(event.occurred_at)}
              </td>
              <td className="px-4 py-3 text-body">
                <ActorText actor={event.actor} />
              </td>
              <td className="px-4 py-3 text-body">{entityText(event, names)}</td>
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
    );
  }

  return (
    <ul aria-label="Nhật ký hệ thống" className="space-y-3">
      {items.map((event) => (
        <li key={event.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="neutral">{actionLabel(event.action)}</Badge>
            <span className="text-xs font-medium text-muted">
              {formatDateTime(event.occurred_at)}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-heading">{entityText(event, names)}</p>
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
