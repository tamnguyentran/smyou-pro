import { useId, useState, type ChangeEvent, type Ref } from "react";
import { cn } from "../../lib/cn";

/** Keeps only digits and (if `allowDecimal`) a single decimal point, normalised to "." — the same
 * string shape a native `<input type="number">` would have given the caller, regardless of
 * whether the person typed "," or "." as their decimal mark. */
function parseTyped(raw: string, allowDecimal: boolean): string {
  let out = "";
  let sawDecimal = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
    } else if (allowDecimal && !sawDecimal && (ch === "," || ch === ".")) {
      sawDecimal = true;
      out += ".";
    }
  }
  return out;
}

/** vi-VN display: "." every 3 digits of the integer part, "," before the decimal part. */
function formatDisplay(normalized: string): string {
  if (normalized === "") return "";
  const [intPart, decPart] = normalized.split(".");
  const grouped = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart === undefined ? grouped : `${grouped},${decPart}`;
}

export interface NumberFieldProps {
  label: string;
  /** Raw numeric string, "." as decimal separator — same contract as a native number input's
   * `value`/`onChange`, so swapping this in for an existing `type="number"` field needs no change
   * to the surrounding parsing/validation logic, only the display changes. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Order quantities support a fractional amount (e.g. "1,5 kg"); money and Gift's quantity do not. */
  allowDecimal?: boolean;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Số lượng/đơn giá/tiền phải hiện phân cách hàng nghìn kiểu Việt Nam ("1.500.000") ngay khi đang
 * gõ, không chỉ lúc hiển thị giá trị đã lưu (quy tắc bắt buộc — `docs/design/UI_GUIDELINES.md`,
 * quyết định 2026-10-24). Không dùng cho trường định danh dạng số (SĐT, mã, MST…) — những trường
 * đó giữ `TextField` thường. */
export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  id,
  placeholder,
  disabled,
  allowDecimal = false,
  className,
  ref,
}: NumberFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  // Derived-during-render sync with an externally changed `value` (e.g. a reverted draft after a
  // failed save) — same pattern this file's callers already use for their own draft state, so a
  // round-trip through our own `onChange` (which sets `value` right back to what we just reported)
  // never causes a redundant reformat.
  const [lastValue, setLastValue] = useState(value);
  const [text, setText] = useState(() => formatDisplay(value));
  if (value !== lastValue) {
    setLastValue(value);
    setText(formatDisplay(value));
  }
  const described = [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
    .filter(Boolean)
    .join(" ");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const normalized = parseTyped(event.target.value, allowDecimal);
    setLastValue(normalized);
    setText(formatDisplay(normalized));
    onChange(normalized);
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-heading">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        onChange={handleChange}
        onBlur={onBlur}
        onFocus={(event) => {
          event.target.select();
        }}
        className={cn(
          "h-11 w-full rounded-xl border border-line bg-card px-3 text-right text-base tabular-nums text-body placeholder:text-placeholder",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-focus focus-visible:ring-offset-2",
          error && "border-urgent-fg",
          className,
        )}
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
