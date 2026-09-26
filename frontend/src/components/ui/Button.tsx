import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

const VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-line bg-card text-heading hover:bg-sidebar-sub",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  loading?: boolean;
  icon?: ReactNode;
}

/** UI_GUIDELINES §6: ≥ 44px tall, spinner + disabled while loading (no double submit). */
export function Button({
  variant = "primary",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 ease-in-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
