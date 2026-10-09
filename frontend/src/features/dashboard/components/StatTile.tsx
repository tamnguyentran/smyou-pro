import { cn } from "../../../lib/cn";

/** 1 thẻ số liệu (UI_GUIDELINES: nhãn + số lớn). `urgent` chỉ tô màu khi `value > 0` (AC-DASH-011). */
export function StatTile({
  label,
  value,
  urgent = false,
}: {
  label: string;
  value: number;
  urgent?: boolean;
}) {
  const isUrgent = urgent && value > 0;
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        isUrgent ? "border-urgent-border bg-urgent-bg" : "border-line bg-card",
      )}
    >
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={cn("text-2xl font-bold", isUrgent ? "text-urgent-fg" : "text-heading")}>
        {value}
      </p>
    </div>
  );
}
