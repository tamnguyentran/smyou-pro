import { Badge } from "../../../components/ui/Badge";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { ProductServiceGroup } from "../api";

export function StatusBadge({ group }: { group: ProductServiceGroup }) {
  return (
    <Badge tone={group.is_active ? "completed" : "todo"}>
      {group.is_active ? "Đang hoạt động" : "Đã ngừng hoạt động"}
    </Badge>
  );
}

/** AC-CAT-097: bảng (desktop) / thẻ (mobile). */
export function ProductServiceGroupList({
  items,
  onSelect,
}: {
  items: ProductServiceGroup[];
  onSelect: (group: ProductServiceGroup) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Tên nhóm", "Trạng thái"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((group) => (
            <tr key={group.id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(group);
                  }}
                  className="min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  {group.name}
                </button>
              </td>
              <td className="px-4 py-3">
                <StatusBadge group={group} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((group) => (
        <li key={group.id}>
          <button
            type="button"
            onClick={() => {
              onSelect(group);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card p-5 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <p className="truncate font-semibold text-heading">{group.name}</p>
            <StatusBadge group={group} />
          </button>
        </li>
      ))}
    </ul>
  );
}
