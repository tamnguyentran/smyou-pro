import { Download } from "lucide-react";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import type { RevenueFilters as Filters } from "../api";
import { revenueExportUrl } from "../api";
import { CustomerSearchField } from "./CustomerSearchField";

/** AC-RPT-010, AC-RPT-014: bộ lọc ngày/khách hàng/trạng thái + nút xuất Excel. */
export function RevenueFilters({
  filters,
  customerName,
  onChange,
}: {
  filters: Filters;
  customerName: string;
  onChange: (filters: Filters, customerName: string) => void;
}) {
  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value }, customerName);
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
        <CustomerSearchField
          customerId={filters.customerId}
          customerName={customerName}
          onSelect={(customer) => {
            onChange({ ...filters, customerId: customer.id }, customer.name);
          }}
        />
      </div>
      <a
        href={revenueExportUrl(filters)}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-heading transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <Download aria-hidden="true" className="size-4" />
        Xuất Excel
      </a>
    </div>
  );
}
