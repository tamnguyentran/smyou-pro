import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

/** Form-level error (token `urgent`). role=alert so screen readers announce it at once. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-urgent-border bg-urgent-bg px-3 py-2.5 text-sm text-urgent-fg"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
