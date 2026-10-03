import { Button } from "../../../components/ui/Button";
import { ChipGroup } from "../../../components/ui/Chip";
import { Select } from "../../../components/ui/Select";
import { TextField } from "../../../components/ui/TextField";
import type { Employee } from "../../employees/api";
import { PRIORITY_LABELS, PRIORITY_ORDER } from "../../orders/schemas";
import type { TaskBoardFilters as Filters } from "../api";
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER } from "../taskStatus";

export const EMPTY_TASK_BOARD_FILTERS: Filters = {
  status: "",
  priority: "",
  assigneeId: "",
  dueFrom: "",
  dueTo: "",
};

/** AC-DSP-082…085, AC-DSP-087: thanh lọc dùng chung 2 layout. `showStatus` (mobile, AC-DSP-087)
 * thêm `ChipGroup` lọc theo trạng thái — desktop đã phân biệt trạng thái bằng cột, không cần. */
export function TaskBoardFilters({
  filters,
  technicians,
  showStatus,
  onChange,
}: {
  filters: Filters;
  technicians: Employee[];
  showStatus: boolean;
  onChange: (filters: Filters) => void;
}) {
  const hasActive =
    filters.status !== "" ||
    filters.priority !== "" ||
    filters.assigneeId !== "" ||
    filters.dueFrom !== "" ||
    filters.dueTo !== "";

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      {showStatus ? (
        <ChipGroup
          label="Trạng thái"
          value={filters.status}
          options={[
            { value: "", label: "Tất cả" },
            ...TASK_STATUS_ORDER.map((value) => ({ value, label: TASK_STATUS_LABEL[value] })),
          ]}
          onChange={(value) => {
            set("status", value);
          }}
        />
      ) : null}
      <ChipGroup
        label="Ưu tiên"
        value={filters.priority}
        options={[
          { value: "", label: "Tất cả" },
          ...PRIORITY_ORDER.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
        ]}
        onChange={(value) => {
          set("priority", value);
        }}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="Kỹ thuật viên"
          value={filters.assigneeId}
          onChange={(event) => {
            set("assigneeId", event.target.value);
          }}
        >
          <option value="">Tất cả KTV</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.full_name} ({technician.code})
            </option>
          ))}
        </Select>
        <TextField
          type="date"
          label="Từ ngày"
          value={filters.dueFrom}
          onChange={(event) => {
            set("dueFrom", event.target.value);
          }}
        />
        <TextField
          type="date"
          label="Đến ngày"
          value={filters.dueTo}
          onChange={(event) => {
            set("dueTo", event.target.value);
          }}
        />
      </div>
      {hasActive ? (
        <Button
          variant="secondary"
          onClick={() => {
            onChange(EMPTY_TASK_BOARD_FILTERS);
          }}
        >
          Xoá lọc
        </Button>
      ) : null}
    </div>
  );
}
