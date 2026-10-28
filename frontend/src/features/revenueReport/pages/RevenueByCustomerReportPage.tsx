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
import { useRevenueReport, type RevenueFilters as Filters, type RevenueRow } from "../api";
import { RevenueFilters } from "../components/RevenueFilters";
import { RevenueTable } from "../components/RevenueTable";
import { OrdersDrilldownSheet } from "../components/OrdersDrilldownSheet";
import { RevenueSkeleton } from "../components/RevenueSkeleton";
import { defaultMonthToDateRange } from "../../../lib/dateRange";

type Drilldown = {
  customerId: string;
  customerName: string;
  sellerLabel: string;
} & ({ selector: { sellerId: string } } | { selector: { unassigned: true } });

/** AC-RPT-010…019 (M15-09b): trang `/reports/revenue-by-customer`. */
export function RevenueByCustomerReportPage() {
  usePageTitle("Báo cáo doanh thu theo khách hàng");
  const me = useMe();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultMonthToDateRange(),
    customerId: "",
    status: "COMPLETED",
  }));
  const [customerName, setCustomerName] = useState("");
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  const allowed = me.data !== undefined && "report.revenue.read" in me.data.capabilities;
  const report = useRevenueReport(filters, { enabled: allowed });

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

  function openDrilldown(row: RevenueRow) {
    if (row.unassigned || row.seller === null) {
      setDrilldown({
        customerId: row.customer_id,
        customerName: row.customer_name,
        selector: { unassigned: true },
        sellerLabel: "Chưa gán",
      });
      return;
    }
    setDrilldown({
      customerId: row.customer_id,
      customerName: row.customer_name,
      selector: { sellerId: row.seller.id },
      sellerLabel: row.seller.full_name,
    });
  }

  return (
    <div className="space-y-6">
      <RevenueFilters
        filters={filters}
        customerName={customerName}
        onChange={(next, nextName) => {
          setFilters(next);
          setCustomerName(nextName);
        }}
      />
      {validationMessage ? <Alert>{validationMessage}</Alert> : null}
      {report.isPending ? (
        <RevenueSkeleton />
      ) : report.isError && !validationMessage ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được báo cáo doanh thu theo khách hàng."
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
        <RevenueTable rows={report.data.items} onSelect={openDrilldown} />
      )}
      {drilldown ? (
        <OrdersDrilldownSheet
          customerId={drilldown.customerId}
          customerName={drilldown.customerName}
          selector={drilldown.selector}
          sellerLabel={drilldown.sellerLabel}
          filters={filters}
          onClose={() => {
            setDrilldown(null);
          }}
        />
      ) : null}
    </div>
  );
}
