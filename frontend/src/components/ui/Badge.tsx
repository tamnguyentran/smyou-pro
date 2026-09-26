import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

const TOKENS = {
  todo: "bg-todo-bg text-todo-fg border-todo-border",
  in_progress: "bg-in_progress-bg text-in_progress-fg border-in_progress-border",
  review: "bg-review-bg text-review-fg border-review-border",
  completed: "bg-completed-bg text-completed-fg border-completed-border",
  urgent: "bg-urgent-bg text-urgent-fg border-urgent-border",
  neutral: "bg-sidebar-sub text-body border-line",
} as const;

/** Status/role pill (UI_GUIDELINES §2): colour + text, never colour alone. */
export function Badge({ tone, children }: { tone: keyof typeof TOKENS; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TOKENS[tone],
      )}
    >
      {children}
    </span>
  );
}
