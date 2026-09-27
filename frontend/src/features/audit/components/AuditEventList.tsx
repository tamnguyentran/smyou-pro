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

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function entityLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

function ActorText({ actor }: { actor: AuditEventOut["actor"] }) {
  if (!actor) return <span>Hệ thống</span>;
  return (
    <span>
      {actor.full_name} <span className="text-xs font-medium text-body">({actor.code})</span>
    </span>
  );
}

function Transition({ event }: { event: AuditEventOut }) {
  if (!event.from_status && !event.to_status) return <span>—</span>;
  return (
    <span>
      {event.from_status ?? "—"} → {event.to_status ?? "—"}
    </span>
  );
}

/** AC-SYS-072/073: table on desktop, cards on mobile — same data as the employees list pattern. */
export function AuditEventList({ items }: { items: AuditEventOut[] }) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
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
              <td className="px-4 py-3 text-body">{formatDateTime(event.occurred_at)}</td>
              <td className="px-4 py-3 text-body">
                <ActorText actor={event.actor} />
              </td>
              <td className="px-4 py-3 text-body">{entityLabel(event.entity_type)}</td>
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
    <ul className="space-y-3">
      {items.map((event) => (
        <li key={event.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="neutral">{actionLabel(event.action)}</Badge>
            <span className="text-xs font-medium text-muted">{entityLabel(event.entity_type)}</span>
          </div>
          <p className="mt-2 text-sm text-body">
            <ActorText actor={event.actor} />
          </p>
          <p className="mt-1 text-xs text-muted">{formatDateTime(event.occurred_at)}</p>
        </li>
      ))}
    </ul>
  );
}
