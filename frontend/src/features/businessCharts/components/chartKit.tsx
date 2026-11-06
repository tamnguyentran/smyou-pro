import { useId, type ReactElement, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { Button } from "../../../components/ui/Button";
import { useMediaQuery } from "../../../lib/useMediaQuery";

/** UI_GUIDELINES §2 tokens only (AC-RPT-137): SVG fills read the CSS variables directly. */
export const COLOR = {
  revenue: "var(--color-brand)",
  profit: "var(--color-completed-fg)",
  danger: "var(--color-urgent-fg)",
  newCustomers: "var(--color-in_progress-fg)",
  returningCustomers: "var(--color-brand)",
  minor: "var(--color-placeholder)",
  grid: "var(--color-line)",
  axisLine: "var(--color-line)",
  /** Gaps between pie slices / around dots: the card's own background. */
  surface: "var(--color-card)",
  /** Hover band/line behind the tooltip. */
  cursor: "var(--color-sidebar-sub)",
  axis: "var(--color-muted)",
} as const;

/** Pie slices, in order; 10 = the API's max (9 items + "Khác"). */
export const SERIES = [
  "var(--color-brand)",
  "var(--color-in_progress-fg)",
  "var(--color-completed-fg)",
  "var(--color-accent)",
  "var(--color-urgent-fg)",
  "var(--color-muted)",
  "var(--color-review-fg)",
  "var(--color-placeholder)",
  "var(--color-todo-border)",
  "var(--color-heading)",
] as const;

export const AXIS_TICK = { fill: COLOR.axis, fontSize: 12 };
export const EMPTY_MESSAGE = "Chưa có dữ liệu trong kỳ này";

/** AC-RPT-135/136: 280px on phones, 320px from `lg`. */
export function useChartHeight(): number {
  return useMediaQuery("(min-width: 1024px)", false) ? 320 : 280;
}

export function ChartCard({
  title,
  period,
  controls,
  className,
  loading = false,
  invalid = false,
  failed = false,
  children,
}: {
  title: string;
  /** M25-01: the card's period picker — beside the title from `lg` (the title wraps first). */
  period?: ReactNode;
  /** Other controls (metric/dimension chips): their own row under the title. */
  controls?: ReactNode;
  className?: string;
  /** Data not here yet: a skeleton the chart's height stands in for `children`. */
  loading?: boolean;
  /** The card's own period is invalid (M25-01): only the picker and its error show. */
  invalid?: boolean;
  /** The card's request failed: the picker stays so another period can be chosen (the tab shows the error). */
  failed?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`min-w-0 space-y-3 rounded-2xl bg-card p-4 shadow-card ${className ?? ""}`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <h2 id={id} className="min-w-0 text-base font-semibold text-heading">
          {title}
        </h2>
        {period ? <div className="lg:shrink-0">{period}</div> : null}
      </div>
      {controls ? <div className="flex flex-wrap gap-3">{controls}</div> : null}
      {invalid || failed ? null : loading ? <ChartSkeleton /> : children}
    </section>
  );
}

/** The SVG chart as one image for assistive tech (AC-RPT-137); `initialDimension` lets jsdom draw it. */
export function ChartFrame({ label, children }: { label: string; children: ReactElement }) {
  const height = useChartHeight();
  return (
    <div role="img" aria-label={label} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartEmpty() {
  const height = useChartHeight();
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-page px-4 text-center text-sm text-body"
      style={{ height }}
    >
      {EMPTY_MESSAGE}
    </div>
  );
}

export function ChartSkeleton() {
  const height = useChartHeight();
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải biểu đồ"
      className="w-full animate-pulse rounded-2xl bg-sidebar-sub"
      style={{ height }}
    />
  );
}

export function ChartError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-card">
      <p className="text-sm text-body">Không tải được số liệu</p>
      <Button variant="secondary" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

export function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div
      role="tooltip"
      className="max-w-64 rounded-xl border border-line bg-card px-3 py-2 text-xs text-body shadow-card"
    >
      <p className="font-semibold text-heading">{title}</p>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

/** HTML legend under the chart (AC-RPT-135), so it wraps on phones instead of eating SVG height. */
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; note?: string }[];
}) {
  return (
    <ul aria-label="Chú giải" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-body">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: item.color }}
          />
          <span>{item.label}</span>
          {item.note ? <span className="font-semibold text-heading">{item.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Category tick for horizontal bars: long names end in "…"; the tooltip shows the full name. */
export function TruncatedTick({
  x,
  y,
  payload,
  max = 22,
  anchor = "end",
}: {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  max?: number;
  /** "end" for a Y (category) axis, "middle" under an X axis. */
  anchor?: "end" | "middle";
}) {
  const text = typeof payload?.value === "string" ? payload.value : "";
  const shown = text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  return (
    <text
      x={x}
      y={y}
      dy={anchor === "middle" ? 14 : 4}
      textAnchor={anchor}
      fill={COLOR.axis}
      fontSize={11}
    >
      {shown}
    </text>
  );
}

/** A tab's queries (one per card since M25-01): one error block on top if any failed (AC-RPT-134),
 * while every card stays — a failed card keeps its picker, the others their charts; until its data
 * arrives a card shows a skeleton of the chart's own height. */
export function TabQuery({
  queries,
  children,
}: {
  queries: { data: unknown; isError: boolean; refetch: () => unknown }[];
  children: ReactNode;
}) {
  const failed = queries.filter((q) => q.data === undefined && q.isError);
  return (
    <div className="space-y-4">
      {failed.length > 0 ? (
        <ChartError
          onRetry={() => {
            for (const q of failed) void q.refetch();
          }}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
    </div>
  );
}

/** A card's request failed and has nothing to show (see `TabQuery`). */
export function isFailed(query: { data: unknown; isError: boolean }) {
  return query.data === undefined && query.isError;
}
