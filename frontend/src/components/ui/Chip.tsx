import { cn } from "../../lib/cn";

/** Single-choice chip group (UI_GUIDELINES §6 "chip chọn nhanh"): priority, VAT rate. */
export function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-heading">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                onChange(option.value);
              }}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                checked
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-card text-body hover:bg-sidebar-sub",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
