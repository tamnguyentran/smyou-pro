import { ROLE_LABELS } from "../../../app/menu";
import { Badge } from "../../../components/ui/Badge";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { Employee } from "../api";

function RoleBadges({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} tone="neutral">
          {ROLE_LABELS[role] ?? role}
        </Badge>
      ))}
    </div>
  );
}

function StatusBadges({ employee }: { employee: Employee }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={employee.is_active ? "completed" : "todo"}>
        {employee.is_active ? "Đang hoạt động" : "Đã khoá"}
      </Badge>
      {employee.is_locked ? <Badge tone="urgent">Tạm khoá đăng nhập</Badge> : null}
    </div>
  );
}

const NAME_BUTTON =
  "min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** AC-EMP-013: table on desktop, cards on mobile — same data, same tap target to open a row. */
export function EmployeeList({
  items,
  onSelect,
}: {
  items: Employee[];
  onSelect: (employee: Employee) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-muted uppercase">
          <tr>
            {["Mã", "Họ tên", "Email", "SĐT", "Vai trò", "Trạng thái"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((employee) => (
            <tr key={employee.id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 font-medium text-heading">{employee.code}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(employee);
                  }}
                  className={NAME_BUTTON}
                >
                  {employee.full_name}
                </button>
              </td>
              <td className="px-4 py-3 text-body">{employee.email}</td>
              <td className="px-4 py-3 text-body">{employee.phone ?? "—"}</td>
              <td className="px-4 py-3">
                <RoleBadges roles={employee.roles} />
              </td>
              <td className="px-4 py-3">
                <StatusBadges employee={employee} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((employee) => (
        <li key={employee.id}>
          <button
            type="button"
            onClick={() => {
              onSelect(employee);
            }}
            className="w-full rounded-2xl border border-line bg-card p-4 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-heading">{employee.full_name}</p>
              <span className="text-xs font-medium text-muted">{employee.code}</span>
            </div>
            <p className="mt-1 text-sm text-body">{employee.email}</p>
            {employee.phone ? <p className="text-sm text-body">{employee.phone}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <RoleBadges roles={employee.roles} />
              <StatusBadges employee={employee} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
