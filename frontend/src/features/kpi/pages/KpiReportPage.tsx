import { useState } from "react";
import { Inbox } from "lucide-react";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useMe } from "../../me/api";
import { useKpiReport, type KpiFilters as Filters } from "../api";
import { KpiFilters } from "../components/KpiFilters";
import { KpiRows } from "../components/KpiRows";
import { KpiSelfCard } from "../components/KpiSelfCard";
import { KpiSkeleton } from "../components/KpiSkeleton";
import { defaultKpiRange } from "../dateRange";

/** AC-KPI-016…026 (M8-01b): trang `/reports/kpi` — số liệu KPI thô theo KTV. */
export function KpiReportPage() {
  usePageTitle("Báo cáo KPI");
  const me = useMe();
  const [filters, setFilters] = useState<Filters>(() => ({ ...defaultKpiRange(), employeeId: "" }));

  const allowed = me.data !== undefined && "kpi.read" in me.data.capabilities;
  const isSelf = me.data !== undefined && (me.data.capabilities["kpi.read"] ?? []).includes("self");

  const options = useKpiReport({ ...filters, employeeId: "" }, { enabled: allowed && !isSelf });
  const report = useKpiReport(filters, { enabled: allowed });

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <KpiSkeleton isSelf={false} />;
  if (!allowed) return <ForbiddenPage />;
  if (report.isPending) return <KpiSkeleton isSelf={isSelf} />;
  if (report.isError) {
    return (
      <EmptyState
        icon={Inbox}
        message="Không tải được báo cáo KPI."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void report.refetch();
            }}
          >
            Tải lại
          </Button>
        }
      />
    );
  }

  const technicians = isSelf
    ? undefined
    : (options.data?.rows ?? []).map((row) => ({
        id: row.employee_id,
        code: row.employee_code,
        full_name: row.employee_full_name,
      }));

  return (
    <div className="space-y-6">
      <KpiFilters filters={filters} technicians={technicians} onChange={setFilters} />
      {isSelf ? (
        report.data.rows[0] ? (
          <KpiSelfCard row={report.data.rows[0]} />
        ) : null
      ) : report.data.rows.length === 0 ? (
        <EmptyState icon={Inbox} message="Chưa có kỹ thuật viên nào trong hệ thống." />
      ) : (
        <KpiRows rows={report.data.rows} />
      )}
    </div>
  );
}
