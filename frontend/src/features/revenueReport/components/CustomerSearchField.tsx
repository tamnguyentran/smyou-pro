import { Search } from "lucide-react";
import { useState } from "react";
import { TextField } from "../../../components/ui/TextField";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useCustomers } from "../../customers/api";

const RESULTS_ID = "revenue-report-customer-results";

/** Ô tìm khách hàng cho bộ lọc báo cáo — autocomplete mới dùng `useCustomers` (không tái dùng
 * `CustomerPicker` của M3: component đó gắn liền form tạo đơn/react-hook-form). Rỗng = "Tất cả". */
export function CustomerSearchField({
  customerId,
  customerName,
  onSelect,
}: {
  customerId: string;
  customerName: string;
  onSelect: (customer: { id: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const searching = !customerId && debouncedQuery.trim() !== "";
  const results = useCustomers({ q: debouncedQuery, type: "", limit: 8, offset: 0 }, searching);

  return (
    <div className="relative space-y-2">
      <TextField
        label="Khách hàng"
        placeholder="Tất cả"
        role="combobox"
        aria-expanded={searching}
        aria-controls={RESULTS_ID}
        aria-autocomplete="list"
        value={customerId ? customerName : query}
        onChange={(event) => {
          if (customerId) onSelect({ id: "", name: "" });
          setQuery(event.target.value);
        }}
        trailing={
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted"
          >
            <Search className="size-4" />
          </span>
        }
      />
      {searching && (results.data?.items.length ?? 0) > 0 ? (
        <ul
          id={RESULTS_ID}
          role="listbox"
          aria-label="Kết quả tìm khách hàng"
          className="absolute z-10 w-full divide-y divide-line rounded-xl border border-line bg-card shadow-card-hover"
        >
          {(results.data?.items ?? []).map((candidate) => (
            <li
              key={candidate.id}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onClick={() => {
                onSelect({ id: candidate.id, name: candidate.name });
                setQuery("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                onSelect({ id: candidate.id, name: candidate.name });
                setQuery("");
              }}
              className="flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <span className="font-medium text-heading">{candidate.name}</span>
              <span className="text-xs text-muted">
                {candidate.code} · {candidate.phone}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
