import { useId, type Ref, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  hint?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

/** Multi-line field (e.g. `specs`) — same label/error/id wiring as TextField. */
export function Textarea({ label, error, hint, id, className, ...rest }: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const described = [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-heading">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        className={cn(
          "w-full rounded-xl border border-line bg-card px-3 py-2 text-base text-body placeholder:text-placeholder",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
          error && "border-urgent-fg",
          className,
        )}
        {...rest}
      />
      {hint ? (
        <p id={`${fieldId}-hint`} className="text-xs font-medium text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-urgent-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
