import { Download } from "lucide-react";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import type { EmployeeRevenueFilters as Filters } from "../employeeApi";
import { employeeRevenueExportUrl } from "../employeeApi";
import { EmployeeSelectField } from "./EmployeeSelectField";

/** AC-RPT-030, AC-RPT-033: bộ lọc ngày/nhân viên/trạng thái + nút xuất Excel. */
export function EmployeeRevenueFilters({
  filters,
  onChange,
  canListAllEmployees,
  self,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  canListAllEmployees: boolean;
  self: { code: string; full_name: string };
}) {
  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

        <Select
          label="Trạng thái"
          value={filters.status}
          onChange={(event) => {
            set("status", event.target.value as Filters["status"]);
          }}
        >
          <option value="COMPLETED">Đã hoàn tất</option>
          <option value="NOT_COMPLETED">Chưa xong</option>
        </Select>

        <EmployeeSelectField
          employeeId={filters.employeeId}
          onChange={(employeeId) => {
            set("employeeId", employeeId);
          }}
          canListAll={canListAllEmployees}
          self={self}
        />
      </div>

      <div className="flex justify-end">
        <a
          href={employeeRevenueExportUrl(filters)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Download aria-hidden="true" className="size-4" />
          Xuất Excel
        </a>
      </div>
    </div>
  );
}
