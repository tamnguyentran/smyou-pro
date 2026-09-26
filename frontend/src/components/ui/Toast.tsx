import { CheckCircle2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}

/** Minimal success toast (UI_GUIDELINES §6): bottom on mobile, bottom-right on desktop, auto-hides. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((text: string) => {
    setMessage(text);
  }, []);
  useEffect(() => {
    if (message === null) return undefined;
    const timer = window.setTimeout(() => {
      setMessage(null);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message]);
  return (
    <ToastContext value={show}>
      {children}
      {/* Always-mounted live region: some screen readers ignore regions inserted with their text. */}
      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <div
            role="status"
            className="fixed inset-x-4 bottom-24 z-50 lg:bottom-4 flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-medium text-white shadow-card-hover md:left-auto md:right-6 md:w-96"
          >
            <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-accent" />
            {message}
          </div>
        ) : null}
      </div>
    </ToastContext>
  );
}
