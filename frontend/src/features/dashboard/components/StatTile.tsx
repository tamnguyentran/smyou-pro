import { Link } from "react-router";
import { cn } from "../../../lib/cn";

const TONE_CLASS = {
  urgent: { tile: "border-urgent-border bg-urgent-bg", text: "text-urgent-fg" },
  in_progress: { tile: "border-in_progress-border bg-in_progress-bg", text: "text-in_progress-fg" },
  review: { tile: "border-review-border bg-review-bg", text: "text-review-fg" },
  completed: { tile: "border-completed-border bg-completed-bg", text: "text-completed-fg" },
} as const;

/** 1 thẻ số liệu (UI_GUIDELINES: nhãn + số lớn). `tone` chỉ tô màu khi `value > 0` (AC-DASH-011),
 * dùng lại đúng tone Badge đã có — không tạo màu mới (M7-02c: nhóm nhân sự/đầu việc).
 * `to` (M10-03, AC-DASH-022/027/028): có → thẻ là link drill-down tới danh sách đã lọc sẵn;
 * không có → giữ nguyên `<div>` trung tính (M7-02's `task_summary`/`staff_summary`/`my_task_summary`). */
export function StatTile({
  label,
  value,
  tone,
  to,
}: {
  label: string;
  value: number;
  tone?: keyof typeof TONE_CLASS;
  to?: string;
}) {
  const active = tone !== undefined && value > 0 ? TONE_CLASS[tone] : undefined;
  const tile = (
    <div
      className={cn("rounded-2xl p-5", active ? cn("border", active.tile) : "bg-card shadow-card")}
    >
      <p className={cn("text-sm font-medium", active ? active.text : "text-muted")}>{label}</p>
      <p className={cn("text-2xl font-bold", active ? active.text : "text-heading")}>{value}</p>
    </div>
  );
  if (to === undefined) return tile;
  return (
    <Link
      to={to}
      className="block min-h-11 rounded-2xl transition duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      {tile}
    </Link>
  );
}
