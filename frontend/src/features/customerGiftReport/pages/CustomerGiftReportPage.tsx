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
import { defaultMonthToDateRange } from "../../../lib/dateRange";
import {
  useCustomerGiftReport,
  type CustomerGiftReportFilters as Filters,
  type CustomerGiftReportRow,
} from "../api";
import { CustomerGiftReportFilters } from "../components/CustomerGiftReportFilters";
import { CustomerGiftReportTable } from "../components/CustomerGiftReportTable";
import { CustomerGiftDrilldownSheet } from "../components/CustomerGiftDrilldownSheet";

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải báo cáo"
      className="h-64 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

/** AC-GFT-040…043 (M16-02b): trang `/reports/customer-gifts`. */
export function CustomerGiftReportPage() {
  usePageTitle("Chi phí quà tặng KH");
  const me = useMe();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultMonthToDateRange(),
    customerId: "",
  }));
  const [customerName, setCustomerName] = useState("");
  const [drilldown, setDrilldown] = useState<{ customerId: string; customerName: string } | null>(
    null,
  );

  const allowed = me.data !== undefined && "report.customer_gift.read" in me.data.capabilities;
  const report = useCustomerGiftReport(filters, { enabled: allowed });

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <Waiting />;
  if (!allowed) return <ForbiddenPage />;

  const validationMessage =
    report.isError && report.error instanceof ApiError && report.error.problem.status === 422
      ? (report.error.problem.errors?.[0]?.message ?? report.error.problem.detail ?? null)
      : null;

  function openDrilldown(row: CustomerGiftReportRow) {
    setDrilldown({ customerId: row.customer_id, customerName: row.customer_name });
  }

  return (
    <div className="space-y-6">
      <CustomerGiftReportFilters
        filters={filters}
        customerName={customerName}
        onChange={(next, nextName) => {
          setFilters(next);
          setCustomerName(nextName);
        }}
      />
      {validationMessage ? <Alert>{validationMessage}</Alert> : null}
      {report.isPending ? (
        <Waiting />
      ) : report.isError && !validationMessage ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được báo cáo chi phí quà tặng KH."
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
        <CustomerGiftReportTable rows={report.data.items} onSelect={openDrilldown} />
      )}
      {drilldown ? (
        <CustomerGiftDrilldownSheet
          customerId={drilldown.customerId}
          customerName={drilldown.customerName}
          filters={filters}
          onClose={() => {
            setDrilldown(null);
          }}
        />
      ) : null}
    </div>
  );
}
