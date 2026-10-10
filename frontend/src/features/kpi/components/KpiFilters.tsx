import { Download } from "lucide-react";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import type { KpiFilters as Filters } from "../api";
import { kpiExportUrl } from "../api";

export interface TechnicianOption {
  id: string;
  code: string;
  full_name: string;
}

/** AC-KPI-016, AC-KPI-020, AC-KPI-021: bộ lọc ngày + (MANAGER/TECH_LEAD) chọn KTV + nút xuất CSV.
 * `technicians` là `undefined` để ẩn hẳn ô chọn KTV với TECHNICIAN (spec §2). */
export function KpiFilters({
  filters,
  technicians,
  onChange,
}: {
  filters: Filters;
  technicians: TechnicianOption[] | undefined;
  onChange: (filters: Filters) => void;
}) {
  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          type="date"
          label="Từ ngày"
          value={filters.from}
          onChange={(event) => {
            set("from", event.target.value);
          }}
        />
        <TextField
          type="date"
          label="Đến ngày"
          value={filters.to}
          onChange={(event) => {
            set("to", event.target.value);
          }}
        />
        {technicians ? (
          <Select
            label="Kỹ thuật viên"
            value={filters.employeeId}
            onChange={(event) => {
              set("employeeId", event.target.value);
            }}
          >
            <option value="">Tất cả KTV</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.full_name} ({technician.code})
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      <a
        href={kpiExportUrl(filters)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <Download aria-hidden="true" className="size-4" />
        Xuất CSV
      </a>
    </div>
  );
}
