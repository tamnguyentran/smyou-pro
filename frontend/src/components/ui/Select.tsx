import { useId, type ReactNode, type Ref, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
}

export function Select({ label, error, id, className, children, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="block text-sm font-medium text-heading">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={cn(
          "h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-body",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
          error && "border-urgent-fg",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className="text-xs font-medium text-urgent-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
