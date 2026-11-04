import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Sheet } from "../../../components/ui/Sheet";
import { useToast } from "../../../components/ui/Toast";
import { ApiError } from "../../auth/errors";
import { useCopyKpiTargets } from "../api";
import { addMonths, monthLabel } from "../month";

const MAX_COPY_MONTHS = 12; // backend kpi_targets.service.MAX_COPY_MONTHS

/** AC-KPI-052/053: copy chỉ tiêu cả tháng sang 1–12 tháng sau; lỗi thì giữ modal mở (M20-04). */
export function CopyTargetsSheet({ month, onClose }: { month: string; onClose: () => void }) {
  const toast = useToast();
  const copy = useCopyKpiTargets();
  const targets = Array.from({ length: MAX_COPY_MONTHS }, (_, i) => addMonths(month, i + 1));
  const [toMonth, setToMonth] = useState(targets[0] ?? "");
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      const result = await copy.mutateAsync({ from_month: month, to_month: toMonth, overwrite });
      toast(
        `Đã copy: ${String(result.created)} mới, ${String(result.overwritten)} ghi đè, ${String(result.skipped)} giữ nguyên`,
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.problem.detail
          ? err.problem.detail
          : "Không copy được. Vui lòng thử lại.",
      );
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Copy sang các tháng sau"
      dismissible={!copy.isPending}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={copy.isPending}>
            Huỷ
          </Button>
          <Button onClick={() => void run()} loading={copy.isPending}>
            Copy
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm font-medium text-heading">Từ tháng: {monthLabel(month)}</p>
        <Select
          label="Đến tháng"
          value={toMonth}
          onChange={(event) => {
            setToMonth(event.target.value);
          }}
        >
          {targets.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
        <label className="flex min-h-11 items-center gap-3 text-sm text-heading">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => {
              setOverwrite(event.target.checked);
            }}
            className="size-5 rounded border-line accent-brand"
          />
          Ghi đè chỉ tiêu đã có
        </label>
        <p className="text-sm text-body">
          Chỉ tiêu của mọi nhân viên trong tháng {monthLabel(month)} được copy sang từng tháng tới
          tháng đã chọn. Không chọn ghi đè thì tháng đã có chỉ tiêu được giữ nguyên.
        </p>
        {error ? <Alert>{error}</Alert> : null}
      </div>
    </Sheet>
  );
}
