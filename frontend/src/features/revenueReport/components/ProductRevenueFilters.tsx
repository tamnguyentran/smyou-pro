import { Download } from "lucide-react";
import { Select } from "../../../components/ui/Select";
import { DateField } from "../../../components/ui/DateField";
import { cn } from "../../../lib/cn";
import { useActiveProductServiceGroups } from "../../productServiceGroups/api";
import {
  productRevenueExportUrl,
  type ProductRevenueFilters as Filters,
  type ProductRevenueMode,
} from "../productApi";

const MODES: { value: ProductRevenueMode; label: string }[] = [
  { value: "group", label: "Nhóm SP/DV" },
  { value: "item", label: "Từng sản phẩm/dịch vụ" },
];

/** AC-RPT-153/154/157/159: radio "Xem theo" + bộ lọc ngày/trạng thái/nhóm + nút xuất Excel. */
export function ProductRevenueFilters({
  mode,
  onModeChange,
  filters,
  onChange,
}: {
  mode: ProductRevenueMode;
  onModeChange: (mode: ProductRevenueMode) => void;
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const groups = useActiveProductServiceGroups();

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-4">
        <span id="revenue-product-mode" className="text-sm font-semibold text-heading">
          Xem theo
        </span>
        <div
          role="radiogroup"
          aria-labelledby="revenue-product-mode"
          className="flex flex-col lg:flex-row lg:gap-4"
        >
          {MODES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 text-sm text-heading",
                mode === option.value && "font-semibold",
              )}
            >
              <input
                type="radio"
                name="revenue-product-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => {
                  onModeChange(option.value);
                }}
                className="size-4 accent-brand"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DateField
          mode="date"
          label="Từ ngày"
          value={filters.from}
          onChange={(value) => {
            set("from", value);
          }}
        />

        <DateField
          mode="date"
          label="Đến ngày"
          value={filters.to}
          onChange={(value) => {
            set("to", value);
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
          <option value="NOT_COMPLETED">Chưa hoàn tất</option>
        </Select>

        <Select
          label="Nhóm SP/DV"
          value={filters.groupId}
          onChange={(event) => {
            set("groupId", event.target.value);
          }}
        >
          <option value="">Tất cả</option>
          {(groups.data ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
          <option value="ungrouped">Chưa phân nhóm</option>
        </Select>
      </div>

      <div className="flex justify-end">
        <a
          href={productRevenueExportUrl(mode, filters)}
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
