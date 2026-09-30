import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Dialog (UI_GUIDELINES §6): bottom sheet on mobile, centred modal on desktop. Same a11y pattern
 * as the app shell's slide-out menu — focus trap, Esc to close, focus returns on unmount. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** false while a confirmed action is in flight: Esc/overlay/✕ must not abandon it mid-request
   * (review round 1 — the mutation still completes and its result would surprise a "cancelled" user). */
  dismissible?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  // Split from the keydown-listener effect below: this one must depend only on `open`, not on
  // `onClose`/`dismissible` — a caller with a controlled field inside the sheet (e.g. a `Textarea`
  // driven by `useState`) re-renders on every keystroke, giving an inline `onClose` a new identity
  // each time. If that were in this effect's deps, the steal-focus-into-panel call below would
  // refire on every keystroke and yank focus away from whatever the user is typing into.
  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dismissible) onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items.at(0);
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-40">
      <div
        data-testid="sheet-overlay"
        aria-hidden="true"
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 bg-heading/40"
      />
      <div
        ref={panel}
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card p-4 shadow-card-hover",
          "lg:inset-0 lg:m-auto lg:h-fit lg:max-h-[85vh] lg:w-full lg:max-w-lg lg:rounded-2xl lg:p-6",
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-heading">{title}</h2>
          <button
            type="button"
            aria-label="Đóng hộp thoại"
            onClick={onClose}
            disabled={!dismissible}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition duration-200 hover:bg-sidebar-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
