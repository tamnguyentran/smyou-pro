import { Button } from "../../../components/ui/Button";
import type { Employee } from "../../employees/api";

/** AC-DSP-021: chọn nhiều kỹ thuật viên — checkbox có `<label>`, vùng chạm ≥44px. */
export function AssigneePicker({
  technicians,
  selected,
  onToggle,
  error,
  loadError = false,
  onRetry,
}: {
  /** Panel chỉ mở sau khi gọi xong `GET /employees`, nên rỗng = không có ai (hoặc lỗi tải). */
  technicians: Employee[];
  selected: string[];
  onToggle: (id: string) => void;
  error?: string | undefined;
  /** `GET /employees` lỗi: báo lỗi + "Thử lại" thay vì báo nhầm "không có ai" (AC-DSP-038). */
  loadError?: boolean;
  onRetry?: () => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="block text-sm font-medium text-heading">Giao cho kỹ thuật viên</legend>
      {loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-urgent-border bg-urgent-bg p-3 text-sm text-urgent-fg"
        >
          <span>Không tải được danh sách kỹ thuật viên.</span>
          <Button type="button" variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      ) : technicians.length === 0 ? (
        <p className="text-sm text-muted">Không có kỹ thuật viên nào đang hoạt động.</p>
      ) : (
        <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {technicians.map((technician) => (
            <li key={technician.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-sidebar-sub">
                <input
                  type="checkbox"
                  checked={selected.includes(technician.id)}
                  onChange={() => {
                    onToggle(technician.id);
                  }}
                  className="size-5 shrink-0 rounded border-line text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                />
                {/* Mã nhân viên dùng `text-body` (không phải `text-muted`): hàng này có nền
                 * `hover:bg-sidebar-sub`, trên nền đó `text-muted` tụt dưới 4.5:1 (axe). */}
                <span className="text-sm text-body">
                  <span className="font-medium text-heading">{technician.full_name}</span> ·{" "}
                  {technician.code}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs font-medium text-muted">
        {`Đã chọn ${String(selected.length)} kỹ thuật viên`}
      </p>
      {error ? <p className="text-xs font-medium text-urgent-fg">{error}</p> : null}
    </fieldset>
  );
}
