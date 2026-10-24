import { Search } from "lucide-react";
import { useId, useState } from "react";
import { TextField } from "../../../components/ui/TextField";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useEmployees } from "../api";

/** Ô tìm nhân viên (search-select) — tìm theo tên, mã, SĐT hoặc email (`useEmployees` `q`, khớp
 * `full_name`/`code`/`phone`/`email` ở server). Dùng cho các form cần chọn 1 nhân viên đang hoạt
 * động, ví dụ "Người thực hiện"/"Người yêu cầu" ở M16-01b. */
export function EmployeeSearchField({
  label,
  employeeId,
  employeeName,
  onSelect,
  error,
  includeInactive = false,
}: {
  label: string;
  employeeId: string;
  employeeName: string;
  onSelect: (employee: { id: string; name: string }) => void;
  error?: string;
  /** M16-04: "Người nhận doanh số" trên dòng hàng cho phép chọn NV đã ngừng hoạt động (spec §8) —
   * mặc định `false` giữ hành vi cũ (chỉ NV đang hoạt động) cho các nơi dùng khác (M16-01b). */
  includeInactive?: boolean;
}) {
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const searching = !employeeId && debouncedQuery.trim() !== "";
  const results = useEmployees(
    { q: debouncedQuery, role: "", is_active: includeInactive ? "" : "true", limit: 8, offset: 0 },
    { enabled: searching },
  );

  return (
    <div className="relative space-y-2">
      <TextField
        label={label}
        placeholder="Tìm theo tên, mã, SĐT hoặc email…"
        role="combobox"
        aria-expanded={searching}
        aria-controls={resultsId}
        aria-autocomplete="list"
        error={error}
        value={employeeId ? employeeName : query}
        onChange={(event) => {
          if (employeeId) onSelect({ id: "", name: "" });
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
          id={resultsId}
          role="listbox"
          aria-label="Kết quả tìm nhân viên"
          className="absolute z-10 w-full divide-y divide-line rounded-xl border border-line bg-card shadow-card-hover"
        >
          {(results.data?.items ?? []).map((candidate) => (
            <li
              key={candidate.id}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onClick={() => {
                onSelect({ id: candidate.id, name: candidate.full_name });
                setQuery("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                onSelect({ id: candidate.id, name: candidate.full_name });
                setQuery("");
              }}
              className="flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <span className="font-medium text-heading">{candidate.full_name}</span>
              <span className="text-xs text-muted">
                {candidate.code}
                {candidate.phone ? ` · ${candidate.phone}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
