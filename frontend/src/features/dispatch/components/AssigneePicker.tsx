import type { Employee } from "../../employees/api";

/** AC-DSP-021: chọn nhiều kỹ thuật viên — checkbox có `<label>`, vùng chạm ≥44px. */
export function AssigneePicker({
  technicians,
  selected,
  onToggle,
  error,
}: {
  /** Panel chỉ mở sau khi gọi xong `GET /employees`, nên rỗng = không có ai (hoặc lỗi tải). */
  technicians: Employee[];
  selected: string[];
  onToggle: (id: string) => void;
  error?: string | undefined;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="block text-sm font-medium text-heading">Giao cho kỹ thuật viên</legend>
      {technicians.length === 0 ? (
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
                <span className="text-sm text-body">
                  {technician.full_name}
                  <span className="text-muted"> · {technician.code}</span>
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
