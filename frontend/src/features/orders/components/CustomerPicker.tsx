import { Search } from "lucide-react";
import { useState } from "react";
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useCustomers, type Customer } from "../../customers/api";
import type { OrderInfoFormValues } from "../schemas";

const RESULTS_ID = "customer-search-results";

/** AC-ORD-025: autocomplete over GET /customers (reused from Khách hàng), or "+ Khách lẻ" free text. */
export function CustomerPicker({
  register,
  watch,
  setValue,
  errors,
}: {
  register: UseFormRegister<OrderInfoFormValues>;
  watch: UseFormWatch<OrderInfoFormValues>;
  setValue: UseFormSetValue<OrderInfoFormValues>;
  errors: FieldErrors<OrderInfoFormValues>;
}) {
  const mode = watch("customerMode");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const searching = mode === "search" && debouncedQuery.trim() !== "" && selected === null;
  const results = useCustomers({ q: debouncedQuery, type: "", limit: 8, offset: 0 }, searching);

  if (mode === "walkin") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-heading">Khách lẻ</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setValue("customerMode", "search");
              setValue("customer_name", "");
              setValue("customer_phone", "");
            }}
          >
            Chọn khách có sẵn
          </Button>
        </div>
        <TextField
          label="Tên khách hàng"
          error={errors.customer_name?.message}
          {...register("customer_name")}
        />
        <TextField
          label="Số điện thoại"
          inputMode="tel"
          error={errors.customer_phone?.message}
          {...register("customer_phone")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="relative flex-1">
          <TextField
            label="Tìm khách hàng"
            placeholder="Tên, số điện thoại, mã số thuế…"
            role="combobox"
            aria-expanded={searching}
            aria-controls={RESULTS_ID}
            aria-autocomplete="list"
            value={selected ? selected.name : query}
            onChange={(event) => {
              setSelected(null);
              setValue("customer_id", "");
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
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setValue("customerMode", "walkin");
            setValue("customer_id", "");
            setSelected(null);
            setQuery("");
          }}
        >
          + Khách lẻ
        </Button>
      </div>
      {selected ? (
        <p className="flex flex-wrap gap-x-1 text-sm text-muted">
          <span>{selected.phone}</span>
          {selected.address ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{selected.address}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {searching && (results.data?.items.length ?? 0) > 0 ? (
        <ul
          id={RESULTS_ID}
          role="listbox"
          aria-label="Kết quả tìm khách hàng"
          className="divide-y divide-line rounded-xl border border-line bg-card"
        >
          {(results.data?.items ?? []).map((candidate) => (
            <li
              key={candidate.id}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onClick={() => {
                setSelected(candidate);
                setValue("customer_id", candidate.id);
                setQuery(candidate.name);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                setSelected(candidate);
                setValue("customer_id", candidate.id);
                setQuery(candidate.name);
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
