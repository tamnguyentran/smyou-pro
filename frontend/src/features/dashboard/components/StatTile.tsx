import { cn } from "../../../lib/cn";

const TONE_CLASS = {
  urgent: { tile: "border-urgent-border bg-urgent-bg", text: "text-urgent-fg" },
  in_progress: { tile: "border-in_progress-border bg-in_progress-bg", text: "text-in_progress-fg" },
  review: { tile: "border-review-border bg-review-bg", text: "text-review-fg" },
  completed: { tile: "border-completed-border bg-completed-bg", text: "text-completed-fg" },
} as const;

/** 1 thẻ số liệu (UI_GUIDELINES: nhãn + số lớn). `tone` chỉ tô màu khi `value > 0` (AC-DASH-011),
 * dùng lại đúng tone Badge đã có — không tạo màu mới (M7-02c: nhóm nhân sự/đầu việc). */
export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: keyof typeof TONE_CLASS;
}) {
  const active = tone !== undefined && value > 0 ? TONE_CLASS[tone] : undefined;
  return (
    <div className={cn("rounded-2xl border p-4", active ? active.tile : "border-line bg-card")}>
      <p className={cn("text-sm font-medium", active ? active.text : "text-muted")}>{label}</p>
      <p className={cn("text-2xl font-bold", active ? active.text : "text-heading")}>{value}</p>
    </div>
  );
}
