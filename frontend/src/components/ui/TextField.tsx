import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { cn } from "../../lib/cn";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
  /** Rendered inside the input box on the right (e.g. show-password button). */
  trailing?: ReactNode;
}

export function TextField({
  label,
  error,
  hint,
  id,
  trailing,
  className,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const described = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-heading">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          className={cn(
            "h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-body placeholder:text-placeholder",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            error && "border-urgent-border",
            trailing ? "pr-12" : undefined,
            className,
          )}
          {...rest}
        />
        {trailing}
      </div>
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-xs font-medium text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-xs font-medium text-urgent-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
