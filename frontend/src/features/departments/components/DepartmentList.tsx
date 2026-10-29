import { Pencil, Power, PowerOff } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { Department } from "../api";

export function StatusBadge({ department }: { department: Department }) {
  return (
    <Badge tone={department.is_active ? "completed" : "todo"}>
      {department.is_active ? "Đang hoạt động" : "Ngừng hoạt động"}
    </Badge>
  );
}

/** AC-EMP-047/048: bảng có cột "Thao tác" (desktop) / thẻ tên + badge, chạm để sửa (mobile). */
export function DepartmentList({
  items,
  onEdit,
  onToggle,
}: {
  items: Department[];
  onEdit: (department: Department) => void;
  onToggle: (department: Department) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Tên phòng ban", "Trạng thái", "Thao tác"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((department) => (
            <tr key={department.id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 font-semibold text-heading">{department.name}</td>
              <td className="px-4 py-3">
                <StatusBadge department={department} />
              </td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon={<Pencil aria-hidden="true" className="size-4" />}
                    onClick={() => {
                      onEdit(department);
                    }}
                  >
                    Sửa
                  </Button>
                  <Button
                    variant="secondary"
                    icon={
                      department.is_active ? (
                        <PowerOff aria-hidden="true" className="size-4" />
                      ) : (
                        <Power aria-hidden="true" className="size-4" />
                      )
                    }
                    onClick={() => {
                      onToggle(department);
                    }}
                  >
                    {department.is_active ? "Ngừng hoạt động" : "Mở lại hoạt động"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((department) => (
        <li key={department.id}>
          <button
            type="button"
            onClick={() => {
              onEdit(department);
            }}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-card p-5 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <p className="truncate font-semibold text-heading" title={department.name}>
              {department.name}
            </p>
            <StatusBadge department={department} />
          </button>
        </li>
      ))}
    </ul>
  );
}
