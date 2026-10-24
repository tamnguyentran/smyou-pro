import { useState } from "react";
import { Inbox } from "lucide-react";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Alert } from "../../../components/ui/Alert";
import { useMe } from "../../me/api";
import { ApiError } from "../../auth/errors";
import {
  useEmployeeRevenueReport,
  type EmployeeRevenueFilters as Filters,
  type EmployeeRevenueRow,
} from "../employeeApi";
import { EmployeeRevenueFilters } from "../components/EmployeeRevenueFilters";
import { EmployeeRevenueTable } from "../components/EmployeeRevenueTable";
import { EmployeeOrdersDrilldownSheet } from "../components/EmployeeOrdersDrilldownSheet";
import { RevenueSkeleton } from "../components/RevenueSkeleton";
import { defaultMonthToDateRange } from "../../../lib/dateRange";

type Drilldown =
  | { selector: { employeeId: string }; title: string }
  | { selector: { unassigned: true }; title: string };

/** AC-RPT-030…034 (M15-10b): trang `/reports/revenue-by-employee`. */
export function RevenueByEmployeeReportPage() {
  usePageTitle("Báo cáo doanh thu theo nhân viên");
  const me = useMe();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultMonthToDateRange(),
    employeeId: "",
    status: "COMPLETED",
  }));
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  const allowed = me.data !== undefined && "report.revenue.read" in me.data.capabilities;
  const report = useEmployeeRevenueReport(filters, { enabled: allowed });

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

  function openDrilldown(row: EmployeeRevenueRow) {
    if (row.unassigned || row.employee_id === null) {
      setDrilldown({ selector: { unassigned: true }, title: "Chưa gán" });
      return;
    }
    setDrilldown({ selector: { employeeId: row.employee_id }, title: row.employee_name ?? "" });
  }

  return (
    <div className="space-y-6">
      <EmployeeRevenueFilters
        filters={filters}
        onChange={setFilters}
        canListAllEmployees={"employee.read" in me.data.capabilities}
        self={{ code: me.data.employee.code, full_name: me.data.employee.full_name }}
      />
      {validationMessage ? <Alert>{validationMessage}</Alert> : null}
      {report.isPending ? (
        <RevenueSkeleton />
      ) : report.isError && !validationMessage ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được báo cáo doanh thu theo nhân viên."
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
      ) : report.isError ? null : report.data.items.length === 0 ? (
        <EmptyState icon={Inbox} message="Không có dữ liệu phù hợp." />
      ) : (
        <EmployeeRevenueTable rows={report.data.items} onSelect={openDrilldown} />
      )}
      {drilldown ? (
        <EmployeeOrdersDrilldownSheet
          selector={drilldown.selector}
          title={drilldown.title}
          filters={filters}
          onClose={() => {
            setDrilldown(null);
          }}
        />
      ) : null}
    </div>
  );
}
