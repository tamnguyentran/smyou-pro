import { useState } from "react";
import { useSearchParams } from "react-router";
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
  useProductRevenueLines,
  useProductRevenueReport,
  type ProductRevenueFilters as Filters,
  type ProductRevenueMode,
  type ProductRevenueRow,
} from "../productApi";
import { ProductRevenueFilters } from "../components/ProductRevenueFilters";
import { ProductRevenueTable } from "../components/ProductRevenueTable";
import { RevenueLinesSheet } from "../components/RevenueLinesSheet";
import { RevenueSkeleton } from "../components/RevenueSkeleton";
import { defaultMonthToDateRange } from "../../../lib/dateRange";

function LinesSheet({
  mode,
  row,
  filters,
  onClose,
}: {
  mode: ProductRevenueMode;
  row: ProductRevenueRow;
  filters: Filters;
  onClose: () => void;
}) {
  const lines = useProductRevenueLines(mode, row.key, filters);
  return <RevenueLinesSheet title={row.label} lines={lines} onClose={onClose} />;
}

/** AC-RPT-153…159 (M24-01b): trang `/reports/revenue-by-product`, kiểu xem ghi ở `?mode=item`. */
export function RevenueByProductReportPage() {
  usePageTitle("Doanh thu theo nhóm & sản phẩm/dịch vụ");
  const me = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: ProductRevenueMode = searchParams.get("mode") === "item" ? "item" : "group";
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultMonthToDateRange(),
    status: "COMPLETED",
    groupId: "",
  }));
  const [selected, setSelected] = useState<ProductRevenueRow | null>(null);

  const allowed = me.data !== undefined && "report.revenue.read" in me.data.capabilities;
  const report = useProductRevenueReport(mode, filters, { enabled: allowed });

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

  function changeMode(next: ProductRevenueMode) {
    setSelected(null);
    setSearchParams(
      (params) => {
        if (next === "item") params.set("mode", "item");
        else params.delete("mode");
        return params;
      },
      { replace: true },
    );
  }

  return (
    <div className="space-y-6">
      <ProductRevenueFilters
        mode={mode}
        onModeChange={changeMode}
        filters={filters}
        onChange={setFilters}
      />
      {validationMessage ? <Alert>{validationMessage}</Alert> : null}
      {report.isPending ? (
        <RevenueSkeleton />
      ) : report.isError && !validationMessage ? (
        <EmptyState
          icon={Inbox}
          message="Không tải được báo cáo doanh thu theo SP/DV."
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
        <EmptyState icon={Inbox} message="Không có doanh thu trong khoảng thời gian này" />
      ) : (
        <ProductRevenueTable
          mode={mode}
          rows={report.data.items}
          summary={report.data.summary}
          onSelect={setSelected}
        />
      )}
      {selected ? (
        <LinesSheet
          mode={mode}
          row={selected}
          filters={filters}
          onClose={() => {
            setSelected(null);
          }}
        />
      ) : null}
    </div>
  );
}
