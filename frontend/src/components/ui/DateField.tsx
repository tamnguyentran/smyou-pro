import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { vnToday } from "../../lib/dateRange";
import { cn } from "../../lib/cn";
import { Select } from "./Select";

export type DateFieldMode = "month" | "date" | "datetime";

interface Pattern {
  /** Digit count of each part, in display order (dd, MM, yyyy, HH, mm, ss). */
  groups: number[];
  /** Separator shown before each part after the first. */
  separators: string[];
  placeholder: string;
  error: string;
}

function patternFor(mode: DateFieldMode, withSeconds: boolean): Pattern {
  if (mode === "month") {
    return {
      groups: [2, 4],
      separators: ["/"],
      placeholder: "MM/yyyy",
      error: "Tháng không hợp lệ (MM/yyyy).",
    };
  }
  if (mode === "date") {
    return {
      groups: [2, 2, 4],
      separators: ["/", "/"],
      placeholder: "dd/MM/yyyy",
      error: "Ngày không hợp lệ (dd/MM/yyyy).",
    };
  }
  const placeholder = withSeconds ? "dd/MM/yyyy HH:mm:ss" : "dd/MM/yyyy HH:mm";
  return {
    groups: withSeconds ? [2, 2, 4, 2, 2, 2] : [2, 2, 4, 2, 2],
    separators: withSeconds ? ["/", "/", " ", ":", ":"] : ["/", "/", " ", ":"],
    placeholder,
    error: `Ngày giờ không hợp lệ (${placeholder}).`,
  };
}

const total = (p: Pattern) => p.groups.reduce((sum, n) => sum + n, 0);

function splitDigits(digits: string, p: Pattern): string[] {
  const parts: string[] = [];
  let at = 0;
  for (const size of p.groups) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  return parts;
}

/** "112026" → "11/2026": a separator appears only once the next part has started, so deleting
 * never gets stuck behind an auto-inserted "/". */
function mask(digits: string, p: Pattern): string {
  return splitDigits(digits, p)
    .map((part, i) => (i === 0 ? part : `${p.separators[i - 1] ?? ""}${part}`))
    .join("");
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Complete, valid digits → the native input's value shape; anything else → "". */
function toValue(digits: string, mode: DateFieldMode, p: Pattern): string {
  if (digits.length !== total(p)) return "";
  const parts = splitDigits(digits, p);
  const [dd = "", mm = "", yyyy = ""] = mode === "month" ? ["01", parts[0], parts[1]] : parts;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (year < 1 || month < 1 || month > 12) return "";
  if (mode === "month") return `${yyyy}-${mm}`;
  if (day < 1 || day > daysIn(year, month)) return "";
  const date = `${yyyy}-${mm}-${dd}`;
  if (mode === "date") return date;
  const [hh = "", mi = "", ss] = parts.slice(3);
  if (Number(hh) > 23 || Number(mi) > 59 || (ss !== undefined && Number(ss) > 59)) return "";
  return `${date}T${hh}:${mi}${ss === undefined ? "" : `:${ss}`}`;
}

/** Native-shaped value → typed digits (inverse of `toValue`); unparseable → "". */
function toDigits(value: string, mode: DateFieldMode, withSeconds: boolean): string {
  if (mode === "month") {
    const m = /^(\d{4})-(\d{2})$/.exec(value);
    return m ? `${m[2] ?? ""}${m[1] ?? ""}` : "";
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (!m) return "";
  const date = `${m[3] ?? ""}${m[2] ?? ""}${m[1] ?? ""}`;
  if (mode === "date") return date;
  if (m[4] === undefined) return "";
  return `${date}${m[4]}${m[5] ?? ""}${withSeconds ? (m[6] ?? "00") : ""}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** HHmm the picker starts from in datetime mode when no complete time is typed (Q187). */
const DEFAULT_TIME = "1700";
const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));
/** 5-minute steps, plus an odd typed minute so the select still shows it. */
function minuteOptions(current: string): string[] {
  const steps = Array.from({ length: 12 }, (_, i) => pad(i * 5));
  return steps.includes(current) || !/^[0-5]\d$/.test(current) ? steps : [...steps, current].sort();
}
const vnDate = (iso: string) => iso.split("-").reverse().join("/");

/** `yyyy-MM-dd` outside [min, max] → the Vietnamese error to show; inside (or unbounded) → null. */
function rangeError(date: string, min?: string, max?: string): string | null {
  if (max && date > max) return `Ngày không được sau ${vnDate(max)}.`;
  if (min && date < min) return `Ngày không được trước ${vnDate(min)}.`;
  return null;
}
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const cellClass =
  "min-h-11 min-w-11 rounded-lg text-sm font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const navClass = cn(cellClass, "flex items-center justify-center text-muted hover:text-heading");

export interface DateFieldProps {
  label: string;
  mode: DateFieldMode;
  /** Same string shape as the matching native input (`yyyy-MM`, `yyyy-MM-dd`,
   * `yyyy-MM-ddTHH:mm[:ss]`), so it drops in for a `type="month|date|datetime-local"` field with
   * no change to the caller's logic; `onChange("")` while the typed text is incomplete/invalid. */
  value: string;
  onChange: (value: string) => void;
  withSeconds?: boolean;
  /** `yyyy-MM-dd` bounds (`mode="date"` only, M21-06b): days outside are disabled in the picker
   * and a typed day outside reports `onChange("")` with an error on blur. */
  min?: string;
  max?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
}

/** Ô ngày/tháng luôn hiện kiểu Việt Nam (`11/2026`, `04/11/2026`, `04/11/2026 14:30`) và lịch
 * chọn tiếng Việt, bất kể ngôn ngữ trình duyệt (M21-06a) — thay cho `type="month|date|…"`. */
export function DateField({
  label,
  mode,
  value,
  onChange,
  withSeconds = false,
  min,
  max,
  hint,
  error,
  disabled,
  required,
  name,
  id,
}: DateFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const p = patternFor(mode, withSeconds);
  const bounded = mode === "date" && Boolean(min || max);
  /** Like `toValue`, but a date outside [min, max] counts as invalid too. */
  const valueOf = (next: string) => {
    const v = toValue(next, mode, p);
    return v && bounded && rangeError(v, min, max) ? "" : v;
  };
  const [digits, setDigits] = useState(() => toDigits(value, mode, withSeconds));
  const [lastValue, setLastValue] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Only an external change re-renders the text: a caller that ignores our `onChange("")` while
  // the person is mid-typing (KPI filters keep the old month) must not wipe what they typed.
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== valueOf(digits)) {
      setDigits(toDigits(value, mode, withSeconds));
      setInvalid(false);
    }
  }
  const open = view !== null;
  const typed = toValue(digits, mode, p);
  const shownError =
    error ?? (invalid ? (bounded && typed && rangeError(typed, min, max)) || p.error : undefined);
  const described = [shownError ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
    .filter(Boolean)
    .join(" ");
  const pickerLabel = mode === "month" ? "Chọn tháng" : "Chọn ngày";
  const current = valueOf(digits) || value;
  const today = vnToday();

  useEffect(() => {
    if (!open) return;
    // Move focus into the grid on open: the selected cell, else today, else the first cell.
    const grid = wrapperRef.current?.querySelector('[role="dialog"]');
    const target =
      grid?.querySelector<HTMLElement>('[data-cell][aria-pressed="true"]') ??
      grid?.querySelector<HTMLElement>('[data-cell][aria-current="date"]') ??
      grid?.querySelector<HTMLElement>("[data-cell]");
    target?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setView(null);
    };
    // Capture phase + stopPropagation: Esc closes only the picker, not an enclosing Sheet.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setView(null);
      if (wrapperRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function commit(next: string) {
    setDigits(next);
    setInvalid(false);
    onChange(valueOf(next));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    commit(event.target.value.replace(/\D/g, "").slice(0, total(p)));
  }

  function toggle() {
    if (open) {
      setView(null);
      return;
    }
    const [year, month] = (current || today).split("-").map(Number);
    setView({ year: year ?? 1970, month: month ?? 1 });
  }

  /** Picker's time (HHmm[ss]): the typed one when complete, else 17:00 (Q187). */
  const timeLength = total(p) - 8;
  const typedTime = digits.slice(8);
  const time =
    mode !== "datetime"
      ? ""
      : typedTime.length === timeLength
        ? typedTime
        : DEFAULT_TIME.padEnd(timeLength, "0");

  /** Time picked before any day → today's date. */
  function setTime(next: string) {
    commit(`${toDigits(current.slice(0, 10) || today, "date", false)}${next}`);
  }

  function pick(next: string) {
    commit(next);
    setView(null);
    triggerRef.current?.focus();
  }

  function shiftMonth(by: number) {
    if (!view) return;
    const index = view.year * 12 + view.month - 1 + by;
    setView({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-heading">
        {label}
      </label>
      <div ref={wrapperRef} className="relative">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          name={name}
          required={required}
          disabled={disabled}
          value={mask(digits, p)}
          placeholder={p.placeholder}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={described || undefined}
          onChange={handleChange}
          onBlur={() => {
            setInvalid(digits !== "" && valueOf(digits) === "");
          }}
          className={cn(
            "h-11 w-full rounded-xl border border-line bg-card px-3 pr-12 text-base tabular-nums text-body placeholder:text-placeholder",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-focus focus-visible:ring-offset-2",
            shownError && "border-urgent-fg",
          )}
        />
        <button
          ref={triggerRef}
          type="button"
          aria-label={pickerLabel}
          aria-expanded={open}
          disabled={disabled}
          onClick={toggle}
          className="absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center rounded-r-xl text-muted hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <CalendarDays aria-hidden="true" className="size-5" />
        </button>
        {view ? (
          <div
            role="dialog"
            aria-label={pickerLabel}
            className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-line bg-card p-2 shadow-card-hover md:right-auto md:w-[21rem]"
          >
            {mode === "month" ? (
              <>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="Năm trước"
                    className={navClass}
                    onClick={() => {
                      shiftMonth(-12);
                    }}
                  >
                    <ChevronLeft aria-hidden="true" className="size-5" />
                  </button>
                  <span className="text-sm font-semibold text-heading">
                    Năm {String(view.year)}
                  </span>
                  <button
                    type="button"
                    aria-label="Năm sau"
                    className={navClass}
                    onClick={() => {
                      shiftMonth(12);
                    }}
                  >
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </button>
                </div>
                <div
                  data-testid="month-grid"
                  className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-4"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = `${String(view.year)}-${pad(i + 1)}`;
                    const selected = current === month;
                    return (
                      <button
                        key={month}
                        type="button"
                        data-cell
                        aria-pressed={selected}
                        aria-current={today.startsWith(month) ? "date" : undefined}
                        className={cn(
                          cellClass,
                          selected ? "bg-brand text-white" : "text-body hover:bg-page",
                          today.startsWith(month) && !selected && "border border-brand",
                        )}
                        onClick={() => {
                          pick(`${pad(i + 1)}${String(view.year)}`);
                        }}
                      >
                        Th{String(i + 1)}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <DayGrid
                year={view.year}
                month={view.month}
                selected={current.slice(0, 10)}
                today={today}
                min={bounded ? min : undefined}
                max={bounded ? max : undefined}
                onShift={shiftMonth}
                onPick={(day) => {
                  const date = `${pad(day)}${pad(view.month)}${String(view.year)}`;
                  // Datetime stays open so the time can be picked next (UAT-03, Q187).
                  if (mode === "datetime") commit(`${date}${time}`);
                  else pick(date);
                }}
              />
            )}
            {mode === "datetime" ? (
              <div className="mt-2 flex items-end gap-2 border-t border-line pt-2">
                <Select
                  label="Giờ"
                  value={time.slice(0, 2)}
                  onChange={(event) => {
                    setTime(`${event.target.value}${time.slice(2)}`);
                  }}
                >
                  {HOURS.map((hh) => (
                    <option key={hh} value={hh}>
                      {hh}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Phút"
                  value={time.slice(2, 4)}
                  onChange={(event) => {
                    setTime(`${time.slice(0, 2)}${event.target.value}${time.slice(4)}`);
                  }}
                >
                  {minuteOptions(time.slice(2, 4)).map((mi) => (
                    <option key={mi} value={mi}>
                      {mi}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className="min-h-11 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  onClick={() => {
                    setView(null);
                    triggerRef.current?.focus();
                  }}
                >
                  Xong
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {hint ? (
        <p id={`${fieldId}-hint`} className="text-xs font-medium text-muted">
          {hint}
        </p>
      ) : null}
      {shownError ? (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-urgent-fg">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}

function DayGrid({
  year,
  month,
  selected,
  today,
  min,
  max,
  onShift,
  onPick,
}: {
  year: number;
  month: number;
  selected: string;
  today: string;
  min?: string;
  max?: string;
  onShift: (by: number) => void;
  onPick: (day: number) => void;
}) {
  // Monday-first week: Sunday (getUTCDay 0) is the 7th column.
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysIn(year, month) }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const monthKey = `${String(year)}-${pad(month)}`;
  // Whole previous/next month out of range → nothing to pick there.
  const noPrev = Boolean(min && monthKey <= min.slice(0, 7));
  const noNext = Boolean(max && monthKey >= max.slice(0, 7));
  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Tháng trước"
          disabled={noPrev}
          className={cn(navClass, "disabled:opacity-40")}
          onClick={() => {
            onShift(-1);
          }}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <span className="text-sm font-semibold text-heading">
          Tháng {pad(month)}/{String(year)}
        </span>
        <button
          type="button"
          aria-label="Tháng sau"
          disabled={noNext}
          className={cn(navClass, "disabled:opacity-40")}
          onClick={() => {
            onShift(1);
          }}
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
      <table className="mt-2 w-full table-fixed border-collapse text-center">
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day} scope="col" className="pb-1 text-xs font-medium text-muted">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((day, i) => {
                if (day === null) return <td key={`e${String(i)}`} />;
                const date = `${String(year)}-${pad(month)}-${pad(day)}`;
                const isSelected = date === selected;
                const isToday = date === today;
                const outOfRange = rangeError(date, min, max) !== null;
                return (
                  <td key={day} className="p-0">
                    <button
                      type="button"
                      data-cell
                      aria-pressed={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      disabled={outOfRange}
                      className={cn(
                        cellClass,
                        "w-full disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                        isSelected ? "bg-brand text-white" : "text-body hover:bg-page",
                        isToday && "border border-brand",
                      )}
                      onClick={() => {
                        onPick(day);
                      }}
                    >
                      {day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
