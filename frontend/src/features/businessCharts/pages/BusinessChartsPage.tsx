import { useState } from "react";
import { useSearchParams } from "react-router";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { DateField } from "../../../components/ui/DateField";
import { cn } from "../../../lib/cn";
import { addMonths, currentMonth, monthLabel } from "../../kpiTargets/month";
import { useMe } from "../../me/api";
import { RevenueSkeleton } from "../../revenueReport/components/RevenueSkeleton";
import type { Period } from "../api";
import { ResultsTab } from "../components/ResultsTab";
import { SalesTab } from "../components/SalesTab";
import { StaffTab } from "../components/StaffTab";

const TABS = [
  { id: "results", label: "Kết quả kinh doanh" },
  { id: "sales", label: "Bán hàng & sản phẩm" },
  { id: "staff", label: "Nhân sự & KPI" },
] as const;
type TabId = (typeof TABS)[number]["id"];

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

/** AC-RPT-123…137 (M23b): `/reports/business-charts` — 3 tab biểu đồ, chỉ Manager. */
export function BusinessChartsPage() {
  usePageTitle("Biểu đồ kinh doanh");
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [today] = useState(() => currentMonth());
  const [range, setRange] = useState(() => ({ from: addMonths(today, -11), to: today }));

  const requested = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "results";
  const error = periodError(range.from, range.to, today);
  const period: Period = { ...range, valid: error === null };

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <RevenueSkeleton />;
  if (!("report.business_charts.read" in me.data.capabilities)) return <ForbiddenPage />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
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
          error={error ?? undefined}
          onChange={(next) => {
            if (next) setRange((r) => ({ ...r, to: next }));
          }}
        />
      </div>

      <div role="tablist" aria-label="Nhóm biểu đồ" className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setParams(t.id === "results" ? {} : { tab: t.id });
            }}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              tab === t.id
                ? "border-brand bg-brand text-white"
                : "border-line bg-card text-body hover:bg-sidebar-sub",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {!period.valid ? null : tab === "sales" ? (
          <SalesTab period={period} />
        ) : tab === "staff" ? (
          <StaffTab period={period} />
        ) : (
          <ResultsTab period={period} />
        )}
      </div>
    </div>
  );
}
