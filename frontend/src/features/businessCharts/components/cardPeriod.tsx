import { useState, type ReactNode } from "react";
import { DateField } from "../../../components/ui/DateField";
import { addMonths, currentMonth, monthLabel } from "../../kpiTargets/month";
import type { Period } from "../api";

const MAX_MONTHS = 24;

function monthsBetween(from: string, to: string): number {
  const [fy = 0, fm = 1] = from.split("-").map(Number);
  const [ty = 0, tm = 1] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Same rules as M23a's 422s, checked first so an invalid period never calls the API (AC-RPT-132). */
function periodError(from: string, to: string, today: string): string | null {
  if (from > to) return "Tháng bắt đầu phải trước hoặc bằng tháng kết thúc";
  if (monthsBetween(from, to) > MAX_MONTHS) return `Chỉ xem tối đa ${String(MAX_MONTHS)} tháng`;
  if (to > today) return `Không được sau tháng ${monthLabel(today)}`;
  return null;
}

/** A card's own period (M25-01) and the picker that goes in its `ChartCard` `period` slot. */
export interface CardPeriod {
  period: Period;
  controls: ReactNode;
}

function Picker({
  error,
  width,
  children,
}: {
  error: string | null;
  /** Desktop width: narrow enough to sit beside the title of a half-width card (B7-04). */
  width: string;
  children: ReactNode;
}) {
  return (
    <div className={`w-full space-y-1 ${width}`}>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-urgent-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** "Từ tháng – Đến tháng", defaulting to the last `months` months up to the current one (Q180). */
export function useCardRange(months: number): CardPeriod {
  const [today] = useState(() => currentMonth());
  const [range, setRange] = useState(() => ({ from: addMonths(today, 1 - months), to: today }));
  const error = periodError(range.from, range.to, today);
  return {
    period: { ...range, valid: error === null },
    controls: (
      <Picker error={error} width="lg:w-80">
        <div className="grid grid-cols-2 gap-3 lg:gap-2">
          <DateField
            mode="month"
            label="Từ tháng"
            value={range.from}
            onChange={(next) => {
              if (next) setRange((r) => ({ ...r, from: next }));
            }}
          />
          <DateField
            mode="month"
            label="Đến tháng"
            value={range.to}
            onChange={(next) => {
              if (next) setRange((r) => ({ ...r, to: next }));
            }}
          />
        </div>
      </Picker>
    ),
  };
}

/** One month, defaulting to the current one; sent as `from = to` (cards 6, 7). */
export function useCardMonth(): CardPeriod {
  const [today] = useState(() => currentMonth());
  const [month, setMonth] = useState(today);
  const error = periodError(month, month, today);
  return {
    period: { from: month, to: month, valid: error === null },
    controls: (
      <Picker error={error} width="lg:w-40">
        <DateField
          mode="month"
          label="Tháng"
          value={month}
          onChange={(next) => {
            if (next) setMonth(next);
          }}
        />
      </Picker>
    ),
  };
}
