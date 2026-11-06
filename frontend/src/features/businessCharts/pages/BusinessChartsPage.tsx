import { useSearchParams } from "react-router";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { cn } from "../../../lib/cn";
import { useMe } from "../../me/api";
import { RevenueSkeleton } from "../../revenueReport/components/RevenueSkeleton";
import { ResultsTab } from "../components/ResultsTab";
import { SalesTab } from "../components/SalesTab";
import { StaffTab } from "../components/StaffTab";

const TABS = [
  { id: "results", label: "Kết quả kinh doanh" },
  { id: "sales", label: "Bán hàng & sản phẩm" },
  { id: "staff", label: "Nhân sự & KPI" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** AC-RPT-123…137 (M23b): `/reports/business-charts` — 3 tab biểu đồ, chỉ Manager; mỗi card tự
 * chọn kỳ (M25-01). */
export function BusinessChartsPage() {
  usePageTitle("Biểu đồ kinh doanh");
  const me = useMe();
  const [params, setParams] = useSearchParams();

  const requested = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "results";

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
        {tab === "sales" ? <SalesTab /> : tab === "staff" ? <StaffTab /> : <ResultsTab />}
      </div>
    </div>
  );
}
