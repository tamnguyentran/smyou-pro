import { Badge } from "../../../components/ui/Badge";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { formatCurrency } from "../../../lib/format";
import type { Service } from "../api";
import { CATEGORY_LABELS, type Category } from "../schemas";

/** Reused by ServiceFormSheet's read-only/edit detail view. */
export function StatusBadge({ service }: { service: Service }) {
  return (
    <Badge tone={service.is_active ? "completed" : "todo"}>
      {service.is_active ? "Đang kinh doanh" : "Đã ngừng kinh doanh"}
    </Badge>
  );
}

/** AC-CAT-023/§6: giá 0 nghĩa là "tính thực tế khi thi công" — hiện "Liên hệ báo giá" thay vì "0 ₫". */
export function formatServicePrice(price: number): string {
  return price === 0 ? "Liên hệ báo giá" : formatCurrency(price);
}

const NAME_BUTTON =
  "min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** AC-CAT-027: table on desktop, cards on mobile. */
export function ServiceList({
  items,
  onSelect,
}: {
  items: Service[];
  onSelect: (service: Service) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã dịch vụ", "Tên", "Danh mục", "Giá", "Trạng thái"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((service) => (
            <tr key={service.id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 font-medium text-heading">{service.code}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(service);
                  }}
                  className={NAME_BUTTON}
                >
                  {service.name}
                </button>
              </td>
              <td className="px-4 py-3 text-body">
                {CATEGORY_LABELS[service.category as Category]}
              </td>
              <td className="px-4 py-3 text-body">{formatServicePrice(service.price)}</td>
              <td className="px-4 py-3">
                <StatusBadge service={service} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((service) => (
        <li key={service.id}>
          <button
            type="button"
            onClick={() => {
              onSelect(service);
            }}
            className="flex w-full flex-col items-start gap-1 rounded-2xl border border-line bg-card p-4 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <p className="truncate font-semibold text-heading">{service.name}</p>
              <span className="shrink-0 text-xs font-medium text-muted">{service.code}</span>
            </div>
            <p className="text-sm text-body">{formatServicePrice(service.price)}</p>
            <div className="mt-1">
              <StatusBadge service={service} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
