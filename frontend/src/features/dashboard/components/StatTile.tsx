import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "../../../lib/cn";

const TONE_CLASS = {
  urgent: { tile: "border-urgent-border bg-urgent-bg", text: "text-urgent-fg" },
  in_progress: { tile: "border-in_progress-border bg-in_progress-bg", text: "text-in_progress-fg" },
  review: { tile: "border-review-border bg-review-bg", text: "text-review-fg" },
  completed: { tile: "border-completed-border bg-completed-bg", text: "text-completed-fg" },
} as const;

const INTERACTIVE_CLASS =
  "block min-h-11 w-full rounded-2xl text-left transition duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** `<button>` mở popup chi tiết (M18-01a, AC-DASH-084) — dùng chung cho thẻ số liệu và các ô tự
 * dựng giao diện riêng (thẻ sao, dòng Top 10 — M18-01c). */
export function TileButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => {
        // Safari không focus <button> khi bấm chuột/chạm → Sheet sẽ ghi nhận `body` là phần tử
        // mở và không trả focus về thẻ khi đóng (AC-DASH-083). Focus tường minh trước khi mở.
        event.currentTarget.focus();
        onClick();
      }}
      className={cn(INTERACTIVE_CLASS, className)}
    >
      {children}
    </button>
  );
}

/** 1 thẻ số liệu (UI_GUIDELINES: nhãn + số lớn). `tone` chỉ tô màu khi `value > 0` (AC-DASH-011),
 * dùng lại đúng tone Badge đã có — không tạo màu mới (M7-02c: nhóm nhân sự/đầu việc).
 * `onClick` (M18-01a, AC-DASH-084): thẻ là `<button>` mở popup danh sách chi tiết.
 * `to` (M10-03): thẻ là link drill-down — chỉ còn ở các khối chưa chuyển sang popup (M18-01b/c).
 * Không có cả hai → `<div>` trung tính. `hint`: dòng phụ dưới số lớn (M16-03: "Hôm nay: n"). */
export function StatTile({
  label,
  value,
  tone,
  to,
  onClick,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: keyof typeof TONE_CLASS;
  to?: string;
  onClick?: () => void;
}) {
  const active = tone !== undefined && value > 0 ? TONE_CLASS[tone] : undefined;
  const tile = (
    <div
      className={cn("rounded-2xl p-5", active ? cn("border", active.tile) : "bg-card shadow-card")}
    >
      <p className={cn("text-sm font-medium", active ? active.text : "text-muted")}>{label}</p>
      <p className={cn("text-2xl font-bold", active ? active.text : "text-heading")}>{value}</p>
      {hint !== undefined ? <p className="text-sm text-body">{hint}</p> : null}
    </div>
  );
  if (onClick !== undefined) return <TileButton onClick={onClick}>{tile}</TileButton>;
  if (to === undefined) return tile;
  return (
    <Link to={to} className={INTERACTIVE_CLASS}>
      {tile}
    </Link>
  );
}
