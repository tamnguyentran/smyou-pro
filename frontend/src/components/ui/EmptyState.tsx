import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** UI_GUIDELINES §6: large muted icon + short guidance, optional action. */
export function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon aria-hidden="true" className="size-10 text-muted" />
      <p className="text-sm leading-relaxed text-body">{message}</p>
      {action}
    </div>
  );
}
