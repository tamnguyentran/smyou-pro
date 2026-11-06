import { Download } from "lucide-react";
import { Select } from "../../../components/ui/Select";
import { DateField } from "../../../components/ui/DateField";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { useActiveDepartments } from "../../departments/api";
import { EmployeeSearchField } from "../../employees/components/EmployeeSearchField";
import { monthLabel } from "../../kpiTargets/month";
import { useActiveProductServiceGroups } from "../../productServiceGroups/api";
import { kpiSalesExportUrl, type KpiSalesFilters as Filters } from "../api";

/** AC-RPT-089/091/093: Tháng · Phòng ban · Nhóm dịch vụ · Nhân viên + "Xuất Excel" (chỉ desktop). */
export function KpiSalesFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const departments = useActiveDepartments();
  const groups = useActiveProductServiceGroups();

  function set(patch: Partial<Filters>) {
    onChange({ ...filters, ...patch });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DateField
          mode="month"
          label="Tháng"
          value={filters.month}
          hint={`Tháng ${monthLabel(filters.month)}`}
          onChange={(next) => {
            if (next) set({ month: next });
          }}
        />
        <Select
          label="Phòng ban"
          value={filters.departmentId}
          onChange={(event) => {
            set({ departmentId: event.target.value });
          }}
        >
          <option value="">Tất cả</option>
          {(departments.data ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <Select
          label="Nhóm dịch vụ"
          value={filters.groupId}
          onChange={(event) => {
            set({ groupId: event.target.value });
          }}
        >
          <option value="">Tất cả</option>
          {(groups.data ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>
        <EmployeeSearchField
          label="Nhân viên"
          employeeId={filters.employeeId}
          employeeName={filters.employeeName}
          includeInactive
          onSelect={(employee) => {
            set({ employeeId: employee.id, employeeName: employee.name });
          }}
        />
      </div>

      {desktop ? (
        <div className="flex justify-end">
          <a
            href={kpiSalesExportUrl(filters)}
            download={`bao-cao-kpi-${filters.month}.csv`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Download aria-hidden="true" className="size-4" />
            Xuất Excel
          </a>
        </div>
      ) : null}
    </div>
  );
}
