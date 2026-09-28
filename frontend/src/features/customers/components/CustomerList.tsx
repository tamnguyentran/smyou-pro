import { useMediaQuery } from "../../../lib/useMediaQuery";
import type { Customer } from "../api";
import { TYPE_LABELS, type CustomerType } from "../schemas";

const NAME_BUTTON =
  "min-h-11 rounded font-semibold text-heading underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** AC-CUS-009: table on desktop, cards on mobile. */
export function CustomerList({
  items,
  onSelect,
}: {
  items: Customer[];
  onSelect: (customer: Customer) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);

  if (desktop) {
    return (
      <table className="w-full overflow-hidden rounded-2xl border border-line bg-card text-left text-sm">
        <thead className="bg-sidebar-sub text-xs font-semibold text-body uppercase">
          <tr>
            {["Mã KH", "Loại", "Tên", "Người liên hệ", "SĐT", "MST", "Địa chỉ"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((customer) => (
            <tr key={customer.id} className="hover:bg-sidebar-sub">
              <td className="px-4 py-3 font-medium text-heading">{customer.code}</td>
              <td className="px-4 py-3 text-body">{TYPE_LABELS[customer.type as CustomerType]}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(customer);
                  }}
                  className={NAME_BUTTON}
                >
                  {customer.name}
                </button>
              </td>
              <td className="px-4 py-3 text-body">{customer.contact_person ?? "—"}</td>
              <td className="px-4 py-3 text-body">{customer.phone}</td>
              <td className="px-4 py-3 text-body">{customer.tax_code ?? "—"}</td>
              <td className="px-4 py-3 text-body">{customer.address ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((customer) => (
        <li key={customer.id}>
          <button
            type="button"
            onClick={() => {
              onSelect(customer);
            }}
            className="flex w-full flex-col items-start gap-1 rounded-2xl border border-line bg-card p-4 text-left shadow-card transition duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <p className="truncate font-semibold text-heading">{customer.name}</p>
              <span className="shrink-0 text-xs font-medium text-muted">{customer.code}</span>
            </div>
            <p className="text-sm text-body">{customer.phone}</p>
            <p className="text-xs text-muted">{TYPE_LABELS[customer.type as CustomerType]}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
