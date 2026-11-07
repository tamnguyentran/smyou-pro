import { useState } from "react";
import { Inbox } from "lucide-react";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ApiError } from "../../auth/errors";
import { currentMonth, monthLabel } from "../../kpiTargets/month";
import { useMe } from "../../me/api";
import { RevenueSkeleton } from "../../revenueReport/components/RevenueSkeleton";
import { useKpiSalesReport, type KpiSalesFilters as Filters } from "../api";
import { KpiSalesFilters } from "../components/KpiSalesFilters";
import { KpiSalesTable } from "../components/KpiSalesTable";

/** AC-RPT-089…095 (M21-02b): trang `/reports/kpi-sales` — KPI doanh số theo tháng. */
export function KpiSalesReportPage() {
  usePageTitle("Báo cáo KPI");
  const me = useMe();
  const [filters, setFilters] = useState<Filters>(() => ({
    month: currentMonth(),
    departmentId: "",
    groupId: "",
    employeeId: "",
    employeeName: "",
  }));

  const allowed = me.data !== undefined && "report.kpi_sales.read" in me.data.capabilities;
  const report = useKpiSalesReport(filters, { enabled: allowed });

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
  if (!allowed) return <ForbiddenPage />;

  const validationMessage =
    report.isError && report.error instanceof ApiError && report.error.problem.status === 422
      ? (report.error.problem.errors?.[0]?.message ?? report.error.problem.detail ?? null)
      : null;

  return (
    <div className="space-y-6">
      <KpiSalesFilters filters={filters} onChange={setFilters} />
      {validationMessage ? <Alert>{validationMessage}</Alert> : null}
      {report.isPending ? (
        <RevenueSkeleton />
      ) : report.isError && !validationMessage ? (
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
      ) : report.isError ? null : report.data.rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={`Chưa có dữ liệu KPI cho tháng ${monthLabel(filters.month)}`}
        />
      ) : (
        <KpiSalesTable rows={report.data.rows} totals={report.data.totals} />
      )}
    </div>
  );
}
